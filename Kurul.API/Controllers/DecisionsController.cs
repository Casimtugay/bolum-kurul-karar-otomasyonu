using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

[ApiController]
[Authorize]
[Route("api/decisions")]
public class DecisionsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ISignatureService _signatures;
    private readonly PermissionService _perms;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _config;
    private readonly ILogger<DecisionsController> _logger;
    private readonly DecisionSealService _seal;
    private readonly IEmailQueue _emailQueue;

    public DecisionsController(
        AppDbContext db,
        ISignatureService signatures,
        PermissionService perms,
        IWebHostEnvironment env,
        IConfiguration config,
        ILogger<DecisionsController> logger,
        DecisionSealService seal,
        IEmailQueue emailQueue)
    {
        _db = db;
        _signatures = signatures;
        _perms = perms;
        _env = env;
        _config = config;
        _logger = logger;
        _seal = seal;
        _emailQueue = emailQueue;
    }

    public record CreateDecisionRequest(
        DateOnly MeetingDate, int? MeetingNo, string Agenda,
        string? Reference, string? Content, string? AttachmentsNote,
        string? TableColumnsJson, string? TableRowsJson,
        int? MeetingId = null,
        List<int>? AttendeeIds = null);
    public record UpdateDecisionRequest(
        string Agenda, string? Reference, string? Content,
        string? AttachmentsNote, string? TableColumnsJson,
        string? TableRowsJson, byte[]? RowVersion);

    public record DeleteDecisionRequest(byte[]? RowVersion);
    public record AttendanceRequest(
        int UserId, string Attendance, byte[]? RowVersion);
    public record VoteRequest(
        string Vote, string? Reason, byte[]? RowVersion);
    public record SignRequest(string Pin);
    public record PrepareSignatureRequest(byte[]? RowVersion);
    public record CancelRequest(string Reason, byte[]? RowVersion);
    public record ReconsiderRequest(
     DateOnly MeetingDate,
     int? MeetingNo,
     byte[]? RowVersion,
     int? MeetingId = null);

    public sealed class ListRequest
    {
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 25;
        public string? Search { get; set; }
        public string? Status { get; set; }
        public string? From { get; set; }
        public string? To { get; set; }
        public int? SnapshotId { get; set; }
    }

    private const int MaxRetries = 3;

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private int? CurrentUnitId =>
        int.TryParse(User.FindFirstValue("unitId"), out var id)
            ? id : null;

    private bool IsLifecycleManager =>
        User.IsInRole(SystemRoles.Admin) ||
        User.FindFirstValue("unitRole") == UnitRoles.Baskan;

    private Task<bool> Can(string page, bool write = false) =>
        _perms.CanAsync(User, page, write);

    private IActionResult NoUnit() =>
        BadRequest(new { error = "Önce bir kurul seçmelisiniz." });

    private IActionResult Denied(string message) =>
        StatusCode(403, new { error = message });

    private static bool IsArchived(Decision d) =>
        d.Status is DecisionStatus.Imzalandi
            or DecisionStatus.Reddedildi
            or DecisionStatus.IptalEdildi;

    // Katılım (katıldı/katılmadı) oylamaya sunulduktan sonra da ilk oy gelene kadar düzenlenir.
    private static bool CanChangeAttendance(Decision d) =>
        d.Status is (DecisionStatus.Taslak or DecisionStatus.Oylamada) &&
        d.SignedAt == null &&
        d.SealedAt == null &&
        d.DocumentHash == null &&
        d.SignatureVersion == null &&
        d.SigningContentHash == null &&
        d.SigningContentFrozenAt == null &&
        !d.Participants.Any(
            p => p.Vote != null || p.SignedAt != null);

    private static bool CanCancelState(Decision d) =>
        d.Status is (
            DecisionStatus.Taslak or
            DecisionStatus.Oylamada or
            DecisionStatus.ImzaBekliyor) &&
        d.SignedAt == null &&
        d.SealedAt == null &&
        d.DocumentHash == null;

    // Metin, tablo ve silme: yalnızca oylamaya sunulmamış taslakta.
    private static bool IsEditable(Decision d) =>
        d.Status == DecisionStatus.Taslak &&
        d.SubmittedAt == null &&
        d.SignedAt == null &&
        d.SealedAt == null &&
        d.DocumentHash == null &&
        d.SignatureVersion == null &&
        d.SigningContentHash == null &&
        d.SigningContentFrozenAt == null &&
        !d.Participants.Any(
            p => p.Vote != null || p.SignedAt != null);

    private async Task<IActionResult> WithRetryAsync(
        Func<Task<IActionResult>> action)
    {
        for (var attempt = 0; attempt < MaxRetries; attempt++)
        {
            try
            {
                return await action();
            }
            catch (DbUpdateConcurrencyException)
            {
                _db.ChangeTracker.Clear();
            }
        }

        return Conflict(new
        {
            error = "Aynı anda başka bir işlem yapıldı. Lütfen tekrar deneyin."
        });
    }

    private async Task<IActionResult> WithConflictAsync(
        Func<Task<IActionResult>> action)
    {
        try
        {
            return await action();
        }
        catch (DbUpdateConcurrencyException)
        {
            _db.ChangeTracker.Clear();
            return Conflict(new
            {
                error = "Karar başka bir işlemle değişti. Güncel kararı yükleyin; işlem kaydedilmedi."
            });
        }
    }

    private IActionResult? CheckVersion(Decision d, byte[]? expected)
    {
        if (expected == null || expected.Length != 8)
            return BadRequest(new
            {
                error = "Kararın sürüm bilgisi eksik. Sayfayı yenileyin."
            });

        if (!d.RowVersion.SequenceEqual(expected))
            return Conflict(new
            {
                error = "Karar siz görüntüledikten sonra değişti. Güncel kararı yeniden kontrol edin."
            });

        _db.Entry(d).Property(x => x.RowVersion).OriginalValue = expected;
        return null;
    }

    private void Touch(Decision d)
    {
        d.UpdatedAt = DateTime.UtcNow;
        _db.Entry(d).Property(x => x.UpdatedAt).IsModified = true;
    }

    private Task<Decision?> LoadAsync(int id, int unitId) =>
        _db.Decisions
            .Include(d => d.AcademicUnit)
            .Include(d => d.Meeting)
            .Include(d => d.Participants)
            .Include(d => d.Attachments)
            .FirstOrDefaultAsync(
                d => d.Id == id && d.AcademicUnitId == unitId);

    private async Task<bool> CanViewAsync(Decision d) =>
        await Can(Pages.Voting) ||
        (IsArchived(d) && await Can(Pages.Archive));

    private void Log(string message, Decision? d = null)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            AcademicUnitId = CurrentUnitId,
            UserId = CurrentUserId,
            Username = User.Identity?.Name,
            Level = "info",
            Message = message,
            Detail = d == null
                ? null
                : $"Karar #{d.Id} ({d.MeetingYear}/{d.MeetingNo}-{d.DecisionNo})",
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
        });
    }

    private static bool ValidTable(string? columns, string? rows)
    {
        try
        {
            using var c = JsonDocument.Parse(columns ?? "[]");
            using var r = JsonDocument.Parse(rows ?? "[]");

            if (c.RootElement.ValueKind != JsonValueKind.Array ||
                r.RootElement.ValueKind != JsonValueKind.Array)
                return false;

            var keys = new HashSet<string>(StringComparer.Ordinal);

            foreach (var col in c.RootElement.EnumerateArray())
            {
                if (col.ValueKind != JsonValueKind.Object ||
                    !col.TryGetProperty("key", out var key) ||
                    key.ValueKind != JsonValueKind.String ||
                    string.IsNullOrWhiteSpace(key.GetString()) ||
                    !keys.Add(key.GetString()!) ||
                    !col.TryGetProperty("label", out var label) ||
                    label.ValueKind != JsonValueKind.String)
                    return false;
            }

            foreach (var row in r.RootElement.EnumerateArray())
            {
                if (row.ValueKind != JsonValueKind.Object)
                    return false;

                foreach (var cell in row.EnumerateObject())
                {
                    if (cell.Value.ValueKind is
                        JsonValueKind.Array or JsonValueKind.Object)
                        return false;
                }
            }

            return keys.Count > 0 || r.RootElement.GetArrayLength() == 0;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private string? ResolveStoredPath(string storedPath)
    {
        if (string.IsNullOrWhiteSpace(storedPath))
            return null;

        try
        {
            var root = Path.GetFullPath(Path.Combine(
                _env.ContentRootPath,
                _config["Storage:Root"] ?? "Storage"));

            var prefix = Path.TrimEndingDirectorySeparator(root) +
                         Path.DirectorySeparatorChar;

            var full = Path.GetFullPath(Path.Combine(root, storedPath));

            var comparison = OperatingSystem.IsWindows()
                ? StringComparison.OrdinalIgnoreCase
                : StringComparison.Ordinal;

            return full.StartsWith(prefix, comparison) ? full : null;
        }
        catch (Exception ex) when (
            ex is ArgumentException or NotSupportedException)
        {
            return null;
        }
    }

    private void DeleteStoredFile(string storedPath)
    {
        try
        {
            var path = ResolveStoredPath(storedPath);
            if (path == null)
            {
                _logger.LogWarning("Ek yolu çözümlenemedi: {StoredPath}", storedPath);
                return;
            }

            System.IO.File.Delete(path);
        }
        catch (Exception ex) when (
            ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "Ek temizlenemedi: {StoredPath}", storedPath);
        }
    }

    // Sadece DB'deki dosya özetini okumakla yetinmez;
    // gerçek dosyanın boyutu ve SHA-256 değeri kontrol edilir.
    private async Task<string?> CheckAttachmentFilesAsync(
        Decision d,
        CancellationToken ct)
    {
        foreach (var attachment in d.Attachments.OrderBy(a => a.Id))
        {
            ct.ThrowIfCancellationRequested();

            var path = ResolveStoredPath(attachment.StoredPath);
            if (path == null)
                return $"Ek dosya yolu geçersiz: {attachment.OriginalName}";

            try
            {
                await using var stream = new FileStream(
                    path,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.Read,
                    81920,
                    useAsync: true);

                if (stream.Length != attachment.SizeBytes)
                    return $"Ek dosyanın boyutu değişmiş: {attachment.OriginalName}";

                var actual = Convert.ToHexString(
                    await SHA256.HashDataAsync(stream, ct));

                if (!string.Equals(
                        actual,
                        attachment.Sha256,
                        StringComparison.OrdinalIgnoreCase))
                {
                    return $"Ek dosyanın içeriği değişmiş: {attachment.OriginalName}";
                }
            }
            catch (Exception ex) when (
                ex is IOException or UnauthorizedAccessException)
            {
                _logger.LogWarning(
                    ex,
                    "İmza için ek doğrulanamadı: {AttachmentId}",
                    attachment.Id);

                return $"Ek dosya bulunamadı veya okunamıyor: {attachment.OriginalName}";
            }
        }

        return null;
    }

    private object ToDto(Decision d)
    {
        var result = DecisionRules.Compute(d.Participants);

        return new
        {
            d.Id,
            d.MeetingYear,
            d.MeetingNo,
            d.DecisionNo,
            d.MeetingId,
            AttendanceManagedByMeeting = d.MeetingId != null,

            MeetingRowVersion = d.Meeting?.RowVersion,

            MeetingAttendanceLocked =
                d.MeetingId != null &&
                (d.Meeting == null || d.Meeting.AttendanceLockedAt != null),

            MeetingDate = d.MeetingDate.ToString("yyyy-MM-dd"),
            d.Reference,
            d.Agenda,
            d.Content,
            d.AttachmentsNote,
            d.TableColumnsJson,
            d.TableRowsJson,
            d.Status,
            d.VoteOutcome,
            d.SubmittedAt,
            d.CreatedAt,
            d.UpdatedAt,
            d.RowVersion,
            UnitCode = d.AcademicUnit?.Code ??
                       User.FindFirstValue("unitCode"),
            Attachments = d.Attachments.OrderBy(a => a.Id).Select(a => new
            {
                a.Id,
                Name = a.OriginalName,
                Size = a.SizeBytes,
                a.ContentType,
                a.UploadedAt,
                a.Sha256
            }).ToArray(),
            d.SignedAt,
            d.DocumentHash,
            d.SealedAt,
            d.SignatureVersion,
            d.SigningContentHash,
            d.SigningContentFrozenAt,
            d.SigningPdfHash,
            d.SigningPdfFrozenAt,
            d.VerificationCode,
            d.FinalPdfHash,
            d.FinalPdfSealedAt,
            d.CancelledAt,
            d.CancelledById,
            d.CancelledByName,
            d.CancellationReason,
            d.SourceDecisionId,
            d.ReconsiderationDecisionId,
            CanCancel = IsLifecycleManager && CanCancelState(d),
            CanReconsider = IsLifecycleManager &&
                d.Status is (
                    DecisionStatus.Reddedildi or DecisionStatus.IptalEdildi),
            Eligibility = DecisionRules.GetEligibility(d.Participants),
            Result = new
            {
                result.Eligible,
                result.Kabul,
                result.Ret,
                result.Pending,
                result.Complete,
                result.Accepted,
                result.TieBrokenByChair
            },
            Participants = d.Participants
                .OrderBy(p => p.SortOrder)
                .ThenBy(p => p.UserId)
                .Select(p => new
                {
                    p.UserId,
                    p.DisplayName,
                    p.Duty,
                    p.IsChair,
                    p.Attendance,
                    p.Vote,
                    p.VoteReason,
                    p.VotedAt,
                    p.SignedAt,
                    p.SignatureRef,
                    p.SignedContentHash,
                    p.PreSignedAt,
                    HasSignatureImage = p.SignatureImagePng != null
                })
        };
    }

    private async Task<IActionResult> ListAsync(
        ListRequest req,
        string permissionPage,
        bool archive,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId) return NoUnit();
        if (!await Can(permissionPage))
            return Denied("Bu listeyi görme yetkiniz yok.");

        if (req.Page < 1)
            return BadRequest(new { error = "Sayfa numarası geçersiz." });

        if (req.PageSize is not (10 or 25 or 50 or 100))
            return BadRequest(new
            {
                error = "Sayfa boyutu 10, 25, 50 veya 100 olmalıdır."
            });

        if (req.SnapshotId < 0)
            return BadRequest(new { error = "Liste sınırı geçersiz." });

        var search = req.Search?.Trim() ?? "";
        var status = req.Status?.Trim() ?? "";

        if (search.Length > 200)
            return BadRequest(new
            {
                error = "Arama metni en fazla 200 karakter olabilir."
            });

        if (status.Length > 0)
        {
            var valid = archive
                ? status is (
                    DecisionStatus.Imzalandi or DecisionStatus.Reddedildi
                    or DecisionStatus.IptalEdildi)
                : status is (
                    DecisionStatus.Taslak or DecisionStatus.Oylamada
                    or DecisionStatus.ImzaBekliyor or DecisionStatus.Imzalandi
                    or DecisionStatus.Reddedildi or DecisionStatus.IptalEdildi);

            if (!valid)
                return BadRequest(new { error = "Durum filtresi geçersiz." });
        }

        DateOnly? fromDate = null;
        DateOnly? toDate = null;

        if (!string.IsNullOrWhiteSpace(req.From))
        {
            if (!DateOnly.TryParseExact(
                    req.From, "yyyy-MM-dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var parsed))
                return BadRequest(new { error = "Başlangıç tarihi geçersiz." });

            fromDate = parsed;
        }

        if (!string.IsNullOrWhiteSpace(req.To))
        {
            if (!DateOnly.TryParseExact(
                    req.To, "yyyy-MM-dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var parsed))
                return BadRequest(new { error = "Bitiş tarihi geçersiz." });

            toDate = parsed;
        }

        if (fromDate.HasValue && toDate.HasValue &&
            fromDate.Value > toDate.Value)
            return BadRequest(new
            {
                error = "Başlangıç tarihi bitiş tarihinden sonra olamaz."
            });

        var query = _db.Decisions.AsNoTracking()
            .Where(d => d.AcademicUnitId == unitId);

        if (archive)
            query = query.Where(d =>
                d.Status == DecisionStatus.Imzalandi ||
                d.Status == DecisionStatus.Reddedildi ||
                d.Status == DecisionStatus.IptalEdildi);

        if (status.Length > 0)
            query = query.Where(d => d.Status == status);

        if (fromDate.HasValue)
            query = query.Where(d => d.MeetingDate >= fromDate.Value);

        if (toDate.HasValue)
            query = query.Where(d => d.MeetingDate <= toDate.Value);

        if (search.Length > 0)
        {
            var match = Regex.Match(
                search,
                @"^(?<year>\d{4})\s*/\s*(?<meeting>\d+)(?:\s*[-/]\s*(?<decision>\d+))?$");

            if (match.Success &&
                int.TryParse(match.Groups["year"].Value, out var year) &&
                int.TryParse(match.Groups["meeting"].Value, out var meeting))
            {
                if (match.Groups["decision"].Success &&
                    int.TryParse(
                        match.Groups["decision"].Value,
                        out var decisionNo))
                {
                    query = query.Where(d =>
                        d.Agenda.Contains(search) ||
                        (d.MeetingYear == year &&
                         d.MeetingNo == meeting &&
                         d.DecisionNo == decisionNo));
                }
                else if (!match.Groups["decision"].Success)
                {
                    query = query.Where(d =>
                        d.Agenda.Contains(search) ||
                        (d.MeetingYear == year && d.MeetingNo == meeting));
                }
                else
                {
                    query = query.Where(d => d.Agenda.Contains(search));
                }
            }
            else if (int.TryParse(search, out var number))
            {
                query = query.Where(d =>
                    d.Agenda.Contains(search) ||
                    d.MeetingYear == number ||
                    d.MeetingNo == number ||
                    d.DecisionNo == number);
            }
            else
            {
                query = query.Where(d => d.Agenda.Contains(search));
            }
        }

        var upperId = req.SnapshotId ??
            (await query.MaxAsync(d => (int?)d.Id, ct) ?? 0);

        query = query.Where(d => d.Id <= upperId);

        var total = await query.CountAsync(ct);
        var totalPages = Math.Max(
            1, (int)Math.Ceiling(total / (double)req.PageSize));
        var page = Math.Min(req.Page, totalPages);

        var me = CurrentUserId;

        var items = await query
            .OrderByDescending(d => d.MeetingYear)
            .ThenByDescending(d => d.MeetingNo)
            .ThenByDescending(d => d.DecisionNo)
            .ThenByDescending(d => d.Id)
            .Skip((page - 1) * req.PageSize)
            .Take(req.PageSize)
            .Select(d => new
            {
                d.Id,
                d.MeetingYear,
                d.MeetingNo,
                d.DecisionNo,
                d.MeetingDate,
                d.Agenda,
                d.Status,
                d.VoteOutcome,
                d.SignedAt,
                d.CancelledAt,
                d.RowVersion,
                Eligible = d.Participants.Count(
                    p => p.Attendance == AttendanceStatus.Katilir),
                SignedCount = d.Participants.Count(
                    p => p.Attendance == AttendanceStatus.Katilir &&
                         p.SignedAt != null),
                // Listede oylama durumu ve "oy kullan" düğmesi için.
                KabulCount = d.Participants.Count(
                    p => p.Attendance == AttendanceStatus.Katilir &&
                         p.Vote == VoteType.Kabul),
                RetCount = d.Participants.Count(
                    p => p.Attendance == AttendanceStatus.Katilir &&
                         p.Vote == VoteType.Ret),
                MyVotePending = d.Participants.Any(
                    p => p.UserId == me &&
                         p.Attendance == AttendanceStatus.Katilir &&
                         p.Vote == null)
            })
            .ToListAsync(ct);

        return Ok(new
        {
            items,
            total,
            page,
            pageSize = req.PageSize,
            totalPages,
            snapshotId = upperId
        });
    }

    [HttpGet]
    public Task<IActionResult> List(
        [FromQuery] ListRequest req,
        CancellationToken ct) =>
        ListAsync(req, Pages.Voting, false, ct);

    [HttpGet("archive")]
    public Task<IActionResult> Archive(
        [FromQuery] ListRequest req,
        CancellationToken ct) =>
        ListAsync(req, Pages.Archive, true, ct);

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        if (CurrentUnitId is not int unitId) return NoUnit();

        var d = await LoadAsync(id, unitId);
        if (d == null) return NotFound();

        if (!await CanViewAsync(d))
            return Denied("Bu kararı görme yetkiniz yok.");

        return Ok(ToDto(d));
    }

    // GET: api/decisions/next-numbers?date=2026-11-12&meetingNo=5
    // Yeni Karar sihirbazı için önerilen toplantı ve karar numarası.
    [HttpGet("next-numbers")]
    public async Task<IActionResult> NextNumbers(
        [FromQuery] DateOnly date,
        [FromQuery] int? meetingNo,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId) return NoUnit();

        if (!await Can(Pages.NewDecision, true))
            return Denied("Karar oluşturma yetkiniz yok.");

        if (date == default || meetingNo is <= 0)
            return BadRequest(new { error = "Toplantı tarihi veya numarası geçersiz." });

        var (no, decisionNo) = await DecisionNumbering.SuggestAsync(_db, unitId, date, meetingNo, ct);

        return Ok(new { meetingYear = date.Year, meetingNo = no, decisionNo });
    }

    // "Oylamaya sun": kurul üyelerine sistem içi bildirim yazar (oluşturan hariç).
    private void AddVotingNotifications(Decision decision, int unitId)
    {
        var title = "Oylamanıza sunulan karar";
        var label = $"{decision.MeetingYear}/{decision.MeetingNo}-{decision.DecisionNo}";
        var message = $"{label} · {decision.Agenda}";
        if (message.Length > 500)
            message = message[..499] + "…";

        // Toplantıya katılmayan (izinli/görevli) üyelere oylama bildirimi gitmez.
        foreach (var userId in decision.Participants
                     .Where(p => p.Attendance == AttendanceStatus.Katilir)
                     .Select(p => p.UserId)
                     .Distinct())
        {
            if (userId == CurrentUserId)
                continue;

            _db.Notifications.Add(new Notification
            {
                UserId = userId,
                UnitId = unitId,
                DecisionId = decision.Id,
                Title = title,
                Message = message,
                CreatedAt = DateTime.UtcNow
            });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateDecisionRequest req)
    {
        if (CurrentUnitId is not int unitId) return NoUnit();

        if (!await Can(Pages.NewDecision, true))
            return Denied("Karar oluşturma yetkiniz yok.");

        if (string.IsNullOrWhiteSpace(req.Agenda))
            return BadRequest(new { error = "Gündem boş olamaz." });

        if (!ValidTable(req.TableColumnsJson, req.TableRowsJson))
            return BadRequest(new { error = "Karar tablosunun biçimi geçersiz." });

        return req.MeetingId is int meetingId
            ? await CreateInMeetingAsync(req, unitId, meetingId)
            : await CreateLegacyAsync(req, unitId);
    }

    // Toplantıya bağlı karar: tarih, numara ve katılım toplantıdan gelir.
    private async Task<IActionResult> CreateInMeetingAsync(
        CreateDecisionRequest req, int unitId, int meetingId)
    {
        for (var attempt = 0; attempt < MaxRetries; attempt++)
        {
            try
            {
                await using var transaction =
                    await _db.Database.BeginTransactionAsync();

                var meeting = await _db.Meetings
                    .Include(m => m.Participants)
                    .FirstOrDefaultAsync(
                        m => m.Id == meetingId && m.AcademicUnitId == unitId);

                if (meeting == null)
                    return NotFound(new { error = "Toplantı bulunamadı." });

                if (meeting.Participants.Count == 0)
                    return BadRequest(new
                    {
                        error = "Toplantıda oy kullanacak üye tanımlı değil."
                    });

                var maxExisting = await _db.Decisions
                    .Where(d => d.AcademicUnitId == unitId &&
                                d.MeetingYear == meeting.MeetingYear &&
                                d.MeetingNo == meeting.MeetingNo)
                    .Select(d => (int?)d.DecisionNo)
                    .MaxAsync() ?? 0;

                // Silinen kararın numarası tekrar verilmez.
                var decisionNo = Math.Max(meeting.LastDecisionNo, maxExisting) + 1;

                meeting.LastDecisionNo = decisionNo;
                meeting.UpdatedAt = DateTime.UtcNow;

                var decision = new Decision
                {
                    AcademicUnitId = unitId,
                    MeetingId = meeting.Id,
                    MeetingDate = meeting.MeetingDate,
                    MeetingYear = meeting.MeetingYear,
                    MeetingNo = meeting.MeetingNo,
                    DecisionNo = decisionNo,
                    Reference = req.Reference ?? "",
                    Agenda = req.Agenda.Trim(),
                    Content = req.Content ??
                        $"{req.Agenda.Trim()} konusu Kurulumuzca görüşülmüş olup {{OY_SONUCU}} uygun görülmüştür.",
                    AttachmentsNote = req.AttachmentsNote ?? "",
                    TableColumnsJson = req.TableColumnsJson ?? "[]",
                    TableRowsJson = req.TableRowsJson ?? "[]",
                    Status = DecisionStatus.Taslak,
                    CreatedById = CurrentUserId,
                    Participants = meeting.Participants
                        .OrderBy(p => p.SortOrder)
                        .ThenBy(p => p.UserId)
                        .Select(p => new DecisionParticipant
                        {
                            UserId = p.UserId,
                            DisplayName = p.DisplayName,
                            Duty = p.Duty,
                            SortOrder = p.SortOrder,
                            IsChair = p.IsChair,
                            Attendance = p.Attendance
                        })
                        .ToList()
                };

                _db.Decisions.Add(decision);
                await _db.SaveChangesAsync();

                Log("Karar oluşturuldu", decision);
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Created($"/api/decisions/{decision.Id}", ToDto(decision));
            }
            catch (DbUpdateConcurrencyException)
            {
                // Aynı toplantıya aynı anda başka karar eklendi veya katılım değişti.
                _db.ChangeTracker.Clear();
            }
            catch (DbUpdateException ex) when (
                ex.InnerException is SqlException { Number: 2601 or 2627 })
            {
                _db.ChangeTracker.Clear();
            }
        }

        return Conflict(new
        {
            error = "Aynı anda başka bir işlem yapıldı. Toplantıyı yenileyip tekrar deneyin."
        });
    }

    // Eski akış: toplantısız karar. Arayüz toplantıya geçince kapatılacak.
    private async Task<IActionResult> CreateLegacyAsync(
        CreateDecisionRequest req, int unitId)
    {
        if (req.MeetingNo is <= 0 || req.MeetingDate == default)
            return BadRequest(new { error = "Toplantı tarihi veya numarası geçersiz." });

        var year = req.MeetingDate.Year;

        for (var attempt = 0; attempt < MaxRetries; attempt++)
        {
            if (req.MeetingNo is int existingNo &&
                await _db.Decisions.AnyAsync(d =>
                    d.AcademicUnitId == unitId &&
                    d.MeetingYear == year &&
                    d.MeetingNo == existingNo &&
                    d.MeetingDate != req.MeetingDate))
                return BadRequest(new
                {
                    error = "Bu toplantı numarası başka bir tarih için kullanılmış."
                });

            var participants = await ParticipantSnapshot.BuildAsync(_db, unitId, req.AttendeeIds);

            if (participants.Count == 0)
                return BadRequest(new
                {
                    error = "Bu kurulda oy kullanacak üye tanımlı değil."
                });

            if (req.AttendeeIds != null &&
                (req.AttendeeIds.Count == 0 ||
                 req.AttendeeIds.Any(id => participants.All(p => p.UserId != id))))
                return BadRequest(new
                {
                    error = "Toplantıya katılan üyeleri kurul üyeleri arasından seçin."
                });

            var meetingNo = req.MeetingNo ??
                ((await _db.Decisions
                    .Where(d => d.AcademicUnitId == unitId && d.MeetingYear == year)
                    .Select(d => (int?)d.MeetingNo)
                    .MaxAsync() ?? 0) + 1);

            if (await _db.Meetings.AnyAsync(m =>
                m.AcademicUnitId == unitId &&
                m.MeetingYear == year &&
                m.MeetingNo == meetingNo))
                return Conflict(new
                {
                    error = "Bu numara bir toplantıya ait. Karar eklemek için o toplantıyı seçin."
                });

            var maxDecision = await _db.Decisions
                .Where(d => d.AcademicUnitId == unitId &&
                            d.MeetingYear == year && d.MeetingNo == meetingNo)
                .Select(d => (int?)d.DecisionNo)
                .MaxAsync();

            var decision = new Decision
            {
                AcademicUnitId = unitId,
                MeetingDate = req.MeetingDate,
                MeetingYear = year,
                MeetingNo = meetingNo,
                DecisionNo = (maxDecision ?? 0) + 1,
                Reference = req.Reference ?? "",
                Agenda = req.Agenda.Trim(),
                Content = req.Content ??
                    $"{req.Agenda.Trim()} konusu Kurulumuzca görüşülmüş olup {{OY_SONUCU}} uygun görülmüştür.",
                AttachmentsNote = req.AttachmentsNote ?? "",
                TableColumnsJson = req.TableColumnsJson ?? "[]",
                TableRowsJson = req.TableRowsJson ?? "[]",
                Status = DecisionStatus.Taslak,
                CreatedById = CurrentUserId,
                Participants = participants
            };

            try
            {
                await using var transaction =
                    await _db.Database.BeginTransactionAsync();

                _db.Decisions.Add(decision);
                await _db.SaveChangesAsync();

                Log("Karar oluşturuldu", decision);
                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Created($"/api/decisions/{decision.Id}", ToDto(decision));
            }
            catch (DbUpdateException ex) when (
                ex.InnerException is SqlException { Number: 2601 or 2627 })
            {
                _db.ChangeTracker.Clear();
            }
        }

        return Conflict(new { error = "Karar numarası çakıştı. Tekrar deneyin." });
    }

    [HttpPut("{id:int}")]
    public Task<IActionResult> UpdateDraft(
        int id,
        UpdateDecisionRequest req) =>
        WithConflictAsync(async () =>
        {
            if (CurrentUnitId is not int unitId) return NoUnit();
            if (!await Can(Pages.NewDecision, true))
                return Denied("Karar düzenleme yetkiniz yok.");

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            if (!IsEditable(d))
                return Conflict(new
                {
                    error = "Oylamaya sunulmuş veya oylaması başlamış karar düzenlenemez."
                });

            var versionError = CheckVersion(d, req.RowVersion);
            if (versionError != null) return versionError;

            if (string.IsNullOrWhiteSpace(req.Content) ||
                string.IsNullOrWhiteSpace(req.Agenda))
                return BadRequest(new { error = "Gündem ve karar metni zorunludur." });

            if (!ValidTable(req.TableColumnsJson, req.TableRowsJson))
                return BadRequest(new { error = "Karar tablosunun biçimi geçersiz." });

            d.Agenda = req.Agenda.Trim();
            d.Reference = req.Reference ?? "";
            d.Content = req.Content;
            d.AttachmentsNote = req.AttachmentsNote ?? "";
            d.TableColumnsJson = req.TableColumnsJson ?? "[]";
            d.TableRowsJson = req.TableRowsJson ?? "[]";

            Touch(d);
            Log("Taslak karar güncellendi", d);
            await _db.SaveChangesAsync();

            return Ok(ToDto(d));
        });

    [HttpDelete("{id:int}")]
    public Task<IActionResult> DeleteDraft(
        int id,
        [FromBody] DeleteDecisionRequest req) =>
        WithConflictAsync(async () =>
        {
            if (CurrentUnitId is not int unitId) return NoUnit();
            if (!await Can(Pages.NewDecision, true))
                return Denied("Karar silme yetkiniz yok.");

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            if (!IsEditable(d))
                return Conflict(new
                {
                    error = "Oylamaya sunulmuş karar silinemez; geri çekmek için süreci iptal edin."
                });

            var versionError = CheckVersion(d, req.RowVersion);
            if (versionError != null) return versionError;

            var storedFiles = d.Attachments.Select(a => a.StoredPath)
                .Distinct().ToArray();

            if (d.SourceDecisionId is int sourceId)
            {
                var source = await _db.Decisions.FirstOrDefaultAsync(
                    x => x.Id == sourceId && x.AcademicUnitId == unitId);

                if (source?.ReconsiderationDecisionId == d.Id)
                {
                    source.ReconsiderationDecisionId = null;
                    Touch(source);
                }
            }

            // Silinen kararın oylama bildirimleri de kaldırılır.
            _db.Notifications.RemoveRange(
                _db.Notifications.Where(n => n.DecisionId == d.Id));
            _db.Decisions.Remove(d);
            Log("Taslak karar silindi", d);
            await _db.SaveChangesAsync();

            foreach (var path in storedFiles)
                DeleteStoredFile(path);

            return Ok(new { ok = true });
        });

    [HttpPut("{id:int}/attendance")]
    public Task<IActionResult> SetAttendance(
        int id,
        AttendanceRequest req) =>
        WithConflictAsync(async () =>
        {
            if (CurrentUnitId is not int unitId) return NoUnit();
            if (!await Can(Pages.NewDecision, true))
                return Denied("Katılım durumunu değiştirme yetkiniz yok.");

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            if (d.MeetingId != null)
                return Conflict(new
                {
                    error = "Bu kararın katılımı toplantı ekranından yönetilir."
                });

            if (!CanChangeAttendance(d))
                return BadRequest(new
                {
                    error = "Oylama başladıktan sonra katılım değiştirilemez."
                });

            var versionError = CheckVersion(d, req.RowVersion);
            if (versionError != null) return versionError;

            if (req.Attendance is not (
                AttendanceStatus.Katilir or
                AttendanceStatus.Izinli or
                AttendanceStatus.Gorevli))
                return BadRequest(new { error = "Geçersiz katılım durumu." });

            var p = d.Participants.FirstOrDefault(x => x.UserId == req.UserId);
            if (p == null) return NotFound(new { error = "Üye bulunamadı." });

            if (p.Attendance == req.Attendance)
                return Ok(ToDto(d));

            p.Attendance = req.Attendance;
            Touch(d);
            DecisionRules.RefreshStatus(d);

            Log($"Katılım güncellendi: {p.DisplayName} → {p.Attendance}", d);
            await _db.SaveChangesAsync();
            return Ok(ToDto(d));
        });

    [HttpPost("{id:int}/vote")]
    public Task<IActionResult> Vote(int id, VoteRequest req) =>
        WithConflictAsync(async () =>
        {
            if (CurrentUnitId is not int unitId) return NoUnit();
            if (!await Can(Pages.Voting, true))
                return Denied("Oy kullanma yetkiniz yok.");

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            if (d.Status is not (
                    DecisionStatus.Taslak or DecisionStatus.Oylamada) ||
                d.SignedAt != null || d.SealedAt != null ||
                d.DocumentHash != null || d.SignatureVersion != null ||
                d.SigningContentHash != null)
                return BadRequest(new
                {
                    error = "Oylama tamamlandı, oy değiştirilemez."
                });

            var versionError = CheckVersion(d, req.RowVersion);
            if (versionError != null) return versionError;

            var eligibility = DecisionRules.GetEligibility(d.Participants);
            if (!eligibility.Valid)
                return BadRequest(new { error = eligibility.Error });

            var p = d.Participants.FirstOrDefault(x => x.UserId == CurrentUserId);

            if (p == null)
                return Denied("Bu kararda oy kullanacak üyeler arasında değilsiniz.");

            if (p.Attendance != AttendanceStatus.Katilir)
                return BadRequest(new { error = "İzinli/görevli üye oy kullanamaz." });

            if (p.Vote != null)
                return BadRequest(new { error = "Oyunuzu zaten kullandınız." });

            if (req.Vote is not (VoteType.Kabul or VoteType.Ret))
                return BadRequest(new { error = "Geçersiz oy." });

            if (req.Vote == VoteType.Ret && string.IsNullOrWhiteSpace(req.Reason))
                return BadRequest(new { error = "Ret oyu için gerekçe zorunludur." });

            p.Vote = req.Vote;
            p.VoteReason = req.Vote == VoteType.Ret ? req.Reason!.Trim() : null;
            p.VotedAt = DateTime.UtcNow;

            Touch(d);
            DecisionRules.RefreshStatus(d);

            // Son kabul oyu ile imza içeriği sabitlenmeden önce
            // eklerin gerçekten okunabilir ve değişmemiş olduğunu doğrula.
            if (d.Status == DecisionStatus.ImzaBekliyor)
            {
                var fileError = await CheckAttachmentFilesAsync(
                    d, HttpContext.RequestAborted);

                if (fileError != null)
                    return Conflict(new
                    {
                        error = $"{fileError}. Son oy kaydedilmedi."
                    });
            }

            // Toplantıdaki ilk başarılı oy katılım listesini kilitler.
            // Toplantı satırı da güncellendiği için aynı anda yapılan katılım
            // değişikliğiyle çakışırsa yalnızca biri kaydolur.
            if (d.MeetingId is int meetingId)
            {
                var meeting = await _db.Meetings
                    .Include(m => m.Participants)
                    .FirstOrDefaultAsync(
                        m => m.Id == meetingId && m.AcademicUnitId == unitId);

                if (meeting == null)
                    return Conflict(new
                    {
                        error = "Kararın toplantı kaydı bulunamadı. Oy kaydedilmedi."
                    });

                var attendanceMismatch = d.Participants.Any(dp =>
                    meeting.Participants
                        .FirstOrDefault(mp => mp.UserId == dp.UserId)?.Attendance
                        != dp.Attendance);

                if (attendanceMismatch)
                    return Conflict(new
                    {
                        error = "Karar ile toplantı katılım listesi uyuşmuyor. Oy kaydedilmedi."
                    });

                if (meeting.AttendanceLockedAt == null)
                {
                    var now = DateTime.UtcNow;
                    meeting.AttendanceLockedAt = now;
                    meeting.UpdatedAt = now;
                }
            }

            Log($"Oy kullanıldı: {p.DisplayName}", d);

            // Son oyla imza aşamasına geçildiyse önceden verilen imzalar karara bağlanır.
            var receipts = d.Status == DecisionStatus.ImzaBekliyor
                ? await BindPreSignaturesAsync(d, unitId, HttpContext.RequestAborted)
                : [];

            await _db.SaveChangesAsync();

            foreach (var (signer, signedAt, imageHash) in receipts)
                QueueSignatureReceipt(d, signer, signedAt, imageHash, d.Status == DecisionStatus.Imzalandi);

            return Ok(ToDto(d));
        });

    public record PreSignRequest(
        string? Password,
        string? SignatureImage,
        bool SaveSignature = false,
        byte[]? RowVersion = null);

    // Oy kullanan üye, oylamanın bitmesini beklemeden imzasını verir.
    // İmza, oylama kabulle tamamlanınca imzaya esas PDF'e bağlanır; karar reddedilirse kullanılmaz.
    [HttpPost("{id:int}/signature/presign")]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("login")]
    public Task<IActionResult> PreSign(int id, PreSignRequest req, CancellationToken ct) =>
        WithConflictAsync(async () =>
        {
            if (CurrentUnitId is not int unitId) return NoUnit();
            if (!await Can(Pages.Voting, true))
                return Denied("İmza atma yetkiniz yok.");

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            if (d.Status != DecisionStatus.Oylamada ||
                d.SignatureVersion != null || d.SigningContentHash != null)
                return Conflict(new
                {
                    error = d.Status == DecisionStatus.ImzaBekliyor
                        ? "Oylama tamamlandı; imzanızı karar sayfasındaki imza bölümünden atın."
                        : "Bu karar imzaya açık değil."
                });

            var versionError = CheckVersion(d, req.RowVersion);
            if (versionError != null) return versionError;

            var p = d.Participants.FirstOrDefault(x => x.UserId == CurrentUserId);
            if (p == null || p.Attendance != AttendanceStatus.Katilir)
                return Denied("Bu kararı imzalayacak üyeler arasında değilsiniz.");

            if (p.Vote == null)
                return Conflict(new { error = "İmzalamadan önce oyunuzu kullanın." });

            if (p.PreSignedAt != null || p.SignedAt != null)
                return Conflict(new { error = "Bu karar için imzanız zaten alındı." });

            if (!SignatureImage.TryParse(req.SignatureImage, out var signaturePng, out var imageError))
                return StatusCode(422, new { error = imageError });

            var signer = await _db.Users.SingleAsync(u => u.Id == CurrentUserId, ct);
            if (string.IsNullOrEmpty(req.Password) ||
                SigningPasswordHasher.VerifyHashedPassword(signer, signer.PasswordHash, req.Password) ==
                    Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed)
            {
                Log($"İmza parolası hatalı girildi: {p.DisplayName}", d);
                await _db.SaveChangesAsync(ct);
                return StatusCode(422, new { error = "Parola hatalı. İmza kaydedilmedi." });
            }

            p.PreSignedAt = DateTime.UtcNow;
            p.PreSignatureImagePng = signaturePng;

            if (req.SaveSignature)
            {
                signer.SavedSignaturePng = signaturePng;
                signer.SavedSignatureUpdatedAt = DateTime.UtcNow;
            }

            Touch(d);
            var imageHash = Convert.ToHexString(SHA256.HashData(signaturePng)).ToLowerInvariant();
            Log($"İmza verildi (oylama tamamlanınca karara bağlanacak): {p.DisplayName} (imza görüntüsü SHA-256: {imageHash})", d);
            await _db.SaveChangesAsync(ct);

            return Ok(ToDto(d));
        });

    // Oylama kabulle tamamlandığında: imzaya esas PDF sabitlenir ve önceden imza veren üyelerin
    // imzaları bu içeriğe bağlanır. PDF sabitlenemezse ön imzalar bekler; imza bölümünden bağlanır.
    private async Task<List<(AppUser Signer, DateTime SignedAt, string ImageHash)>> BindPreSignaturesAsync(
        Decision d, int unitId, CancellationToken ct)
    {
        var receipts = new List<(AppUser, DateTime, string)>();
        var pending = d.Participants
            .Where(x => x.Attendance == AttendanceStatus.Katilir &&
                        x.PreSignedAt != null && x.PreSignatureImagePng != null && x.SignedAt == null)
            .ToList();
        if (pending.Count == 0) return receipts;

        try
        {
            if (await SigningPdfBinding.FreezeAsync(d, _env, ct, DecisionVerification.PublicBaseUrl(_config)))
                Log("İmzaya esas PDF sabitlendi; demo imza yöntemi v2", d);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PDF sabitlenemedi: {DecisionId}", d.Id);
            Log("İmzaya esas PDF sabitlenemedi; önceden verilen imzalar henüz bağlanmadı.", d);
            return receipts;
        }

        if (d.SignatureVersion != 2 || !DecisionRules.SigningContentMatches(d))
            return receipts;

        var now = DateTime.UtcNow;
        var label = $"{d.MeetingYear}/{d.MeetingNo}-{d.DecisionNo}";
        var message = $"{label} · {d.Agenda}";
        if (message.Length > 500) message = message[..499] + "…";

        var ids = pending.Select(x => x.UserId).ToList();
        var users = await _db.Users
            .Where(u => ids.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, ct);

        foreach (var p in pending)
        {
            DemoSignatureService.BindPreSignature(d, p, now);
            var imageHash = Convert.ToHexString(SHA256.HashData(p.SignatureImagePng!)).ToLowerInvariant();
            Log($"Önceden verilen imza karara bağlandı: {p.DisplayName} (imza görüntüsü SHA-256: {imageHash})", d);

            _db.Notifications.Add(new Notification
            {
                UserId = p.UserId,
                UnitId = unitId,
                DecisionId = d.Id,
                Title = "İmzanız karara eklendi",
                Message = message,
                CreatedAt = now
            });

            if (users.TryGetValue(p.UserId, out var signer))
                receipts.Add((signer, now, imageHash));
        }

        var completed = d.Participants
            .Where(x => x.Attendance == AttendanceStatus.Katilir)
            .All(x => DemoSignatureService.HasValidBinding(d, x));

        if (completed)
        {
            d.Status = DecisionStatus.Imzalandi;
            d.SignedAt = now;
            d.SealedAt = DateTime.UtcNow;
            d.DocumentHash = DecisionRules.ComputeHash(d);
            await SealFinalPdfAsync(d, ct);
            Log("İmzalar tamamlandı ve karar mühürlendi", d);
        }

        return receipts;
    }

    // Eski istemci veya eski test yeni akışı atlayamaz.
    [HttpPost("{id:int}/sign")]
    public Task<IActionResult> Sign(
        int id,
        SignRequest req,
        CancellationToken ct)
    {
        IActionResult result = StatusCode(410, new
        {
            error = "Eski imza yöntemi kapatıldı. Sayfayı yenileyip yeni imza sürecini başlatın."
        });

        return Task.FromResult(result);
    }

    private IActionResult? CheckSigningState(Decision d)
    {
        if (d.Status != DecisionStatus.ImzaBekliyor ||
            d.SignedAt != null ||
            d.SealedAt != null ||
            d.DocumentHash != null)
            return Conflict(new { error = "Karar imza aşamasında değil." });

        var result = DecisionRules.Compute(d.Participants);

        if (!result.Complete || !result.Accepted)
            return Conflict(new
            {
                error = "Katılım veya oylama sonucu imzaya uygun değil."
            });

        return null;
    }

    private static bool AllExistingBindingsValid(Decision d) =>
        d.Participants.All(p =>
            p.SignedAt == null
                ? p.SignedContentHash == null &&
                  p.SignatureData == null &&
                  p.SignatureRef == null
                : p.Attendance == AttendanceStatus.Katilir &&
                  DemoSignatureService.HasValidBinding(d, p));

    [HttpPost("{id:int}/signature/prepare")]
    public Task<IActionResult> PrepareSignature(
        int id,
        PrepareSignatureRequest req,
        CancellationToken ct) =>
        WithConflictAsync(async () =>
        {
            if (CurrentUnitId is not int unitId) return NoUnit();
            if (!await Can(Pages.Voting, true))
                return Denied("İmza atma yetkiniz yok.");

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            var stateError = CheckSigningState(d);
            if (stateError != null) return stateError;

            var p = d.Participants.FirstOrDefault(x => x.UserId == CurrentUserId);

            if (p == null || p.Attendance != AttendanceStatus.Katilir)
                return Denied("Bu kararı imzalayacak üyeler arasında değilsiniz.");

            if (p.SignedAt != null)
                return Conflict(new { error = "Bu kararı zaten imzaladınız." });

            if (p.PreSignedAt != null)
                return Conflict(new { error = "İmzanızı oylama sırasında verdiniz; karara bağlanması bekleniyor." });

            var versionError = CheckVersion(d, req.RowVersion);
            if (versionError != null) return versionError;

            var frozeLegacy = false;

            if (d.SignatureVersion == null)
            {
                if (d.SigningContentHash != null ||
                    d.SigningContentFrozenAt != null ||
                    d.Participants.Any(x =>
                        x.SignedAt != null ||
                        x.SignatureRef != null ||
                        x.SignedContentHash != null ||
                        x.SignatureData != null))
                    return Conflict(new
                    {
                        error = "Bu kararda eski yöntemle imza veya tutarsız imza bilgisi var. Başkan/Admin gerekçeli iptal ve yeniden değerlendirme kullanmalıdır."
                    });

                // Geçişten önce imza bekleyen, fakat henüz imzalanmamış karar.
                // Eski tarihe geriye dönük imza/özet yazılmaz.
                DecisionRules.FreezeSigningContent(d);
                frozeLegacy = true;
            }

            if (!DecisionRules.SigningContentMatches(d) ||
                !AllExistingBindingsValid(d))
                return Conflict(new
                {
                    error = "Sabitlenen içerik veya mevcut imza bağlantıları doğrulanamadı."
                });

            var fileError = await CheckAttachmentFilesAsync(d, ct);
            if (fileError != null)
                return Conflict(new { error = fileError });

            bool frozePdf;

            try
            {
                frozePdf = await SigningPdfBinding.FreezeAsync(
                    d, _env, ct, DecisionVerification.PublicBaseUrl(_config));
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "PDF sabitlenemedi: {DecisionId}",
                    d.Id);

                return Conflict(new
                {
                    error = "İmzaya esas PDF oluşturulamadı. Hiçbir imza hazırlığı kaydedilmedi. Sunucu kaydını kontrol edin."
                });
            }

            if (frozePdf)
            {
                Log(
                    "İmzaya esas PDF sabitlendi; demo imza yöntemi v2",
                    d);
            }

            var prepared = await _signatures.PrepareAsync(d, p, ct);

            Touch(d);

            if (frozeLegacy)
                Log("İmzasız eski kararın içeriği yeni demo imza yöntemi için sabitlendi", d);

            Log($"Demo imza hazırlığı oluşturuldu: {p.DisplayName}", d);
            await _db.SaveChangesAsync(ct);

            return Ok(prepared);
        });

    private static readonly Microsoft.AspNetCore.Identity.PasswordHasher<AppUser> SigningPasswordHasher = new();

    // Parola denemesine karşı giriş ile aynı hız sınırı uygulanır.
    [HttpPost("{id:int}/signature/complete")]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("login")]
    public Task<IActionResult> CompleteSignature(
        int id,
        SignatureCompletion req,
        CancellationToken ct) =>
        WithRetryAsync(async () =>
        {
            ct.ThrowIfCancellationRequested();

            if (CurrentUnitId is not int unitId) return NoUnit();
            if (!await Can(Pages.Voting, true))
                return Denied("İmza atma yetkiniz yok.");

            if (req.ChallengeId == Guid.Empty ||
                req.ContentHash == null || req.ContentHash.Length != 64 ||
                req.SignatureData == null || req.SignatureData.Length != 64)
                return BadRequest(new { error = "İmza tamamlama bilgileri geçersiz." });

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            // İptal, tamamlanmış bir imzayı tekrar göndererek aşılamaz.
            if (d.Status is not (
                DecisionStatus.ImzaBekliyor or DecisionStatus.Imzalandi))
                return Conflict(new { error = "Bu kararın imza süreci açık değil." });

            var p = d.Participants.FirstOrDefault(x => x.UserId == CurrentUserId);

            if (p == null || p.Attendance != AttendanceStatus.Katilir)
                return Denied("Bu kararı imzalayacak üyeler arasında değilsiniz.");

            if (!DecisionRules.SigningContentMatches(d) ||
                !AllExistingBindingsValid(d))
                return Conflict(new
                {
                    error = "Karar içeriği veya mevcut imza bağlantıları değişmiş."
                });

            var fileError = await CheckAttachmentFilesAsync(d, ct);
            if (fileError != null)
                return Conflict(new { error = fileError });

            // Başarılı yanıt kaybolmuşsa aynı istek güvenle tekrarlanabilir.
            if (p.SignedAt != null)
            {
                var sameRequest =
                    p.SignatureChallengeId == req.ChallengeId &&
                    p.SignedContentHash == req.ContentHash &&
                    p.SignatureData == req.SignatureData;

                if (!sameRequest)
                    return Conflict(new { error = "Bu üye için başka bir imza zaten kayıtlı." });

                if (d.Status == DecisionStatus.Imzalandi &&
                    (d.DocumentHash == null ||
                     d.DocumentHash != DecisionRules.ComputeHash(d)))
                    return Conflict(new { error = "Tamamlanmış belgenin özeti doğrulanamadı." });

                return Ok(ToDto(d));
            }

            var stateError = CheckSigningState(d);
            if (stateError != null) return stateError;

            // İmza görüntüsü (fotoğraftan arka planı kaldırılmış şeffaf PNG) zorunludur.
            if (!SignatureImage.TryParse(req.SignatureImage, out var signaturePng, out var imageError))
                return StatusCode(422, new { error = imageError });

            // Açık bırakılmış oturumda başkası imza atamasın diye parola yeniden sorulur.
            var signer = await _db.Users.SingleAsync(u => u.Id == CurrentUserId, ct);
            if (string.IsNullOrEmpty(req.Password) ||
                SigningPasswordHasher.VerifyHashedPassword(signer, signer.PasswordHash, req.Password) ==
                    Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed)
            {
                Log($"İmza parolası hatalı girildi: {p.DisplayName}", d);
                await _db.SaveChangesAsync(ct);
                return StatusCode(422, new { error = "Parola hatalı. İmza kaydedilmedi." });
            }

            var signature = await _signatures.CompleteAsync(d, p, req, ct);

            if (!signature.Ok)
                return BadRequest(new { error = signature.Error });

            p.SignedAt = signature.SignedAt;
            p.SignatureRef = signature.Reference;
            p.SignedContentHash = req.ContentHash;
            p.SignatureData = req.SignatureData;
            p.SignatureImagePng = signaturePng;

            if (req.SaveSignature)
            {
                signer.SavedSignaturePng = signaturePng;
                signer.SavedSignatureUpdatedAt = DateTime.UtcNow;
            }

            if (!DemoSignatureService.HasValidBinding(d, p))
                return Conflict(new { error = "İmza içeriğe bağlanamadı." });

            var completed = d.Participants
                .Where(x => x.Attendance == AttendanceStatus.Katilir)
                .All(x => DemoSignatureService.HasValidBinding(d, x));

            Touch(d);

            if (completed)
            {
                d.Status = DecisionStatus.Imzalandi;
                d.SignedAt = signature.SignedAt;
                d.SealedAt = DateTime.UtcNow;
                d.DocumentHash = DecisionRules.ComputeHash(d);
                await SealFinalPdfAsync(d, ct);
            }

            // İmza görüntüsünün özeti kayda geçer; görüntü sonradan değiştirilirse fark edilir.
            var imageHash = Convert.ToHexString(SHA256.HashData(signaturePng)).ToLowerInvariant();

            Log(
                (completed
                    ? $"İmzalar tamamlandı ve karar mühürlendi: {p.DisplayName}"
                    : $"İmza kaydedildi: {p.DisplayName}") +
                $" (imza görüntüsü SHA-256: {imageHash})",
                d);

            // İmzalayana makbuz: sistem içi bildirim (aynı kayıtla) ve e-posta (kayıttan sonra).
            var label = $"{d.MeetingYear}/{d.MeetingNo}-{d.DecisionNo}";
            var receipt = $"{label} · {d.Agenda}";
            _db.Notifications.Add(new Notification
            {
                UserId = signer.Id,
                UnitId = unitId,
                DecisionId = d.Id,
                Title = completed ? "Kararı imzaladınız · imzalar tamamlandı" : "Kararı imzaladınız",
                Message = receipt.Length > 500 ? receipt[..499] + "…" : receipt,
                CreatedAt = DateTime.UtcNow
            });

            await _db.SaveChangesAsync(ct);

            QueueSignatureReceipt(d, signer, p.SignedAt!.Value, imageHash, completed);

            return Ok(ToDto(d));
        });

    // Son imzayla birlikte: imzaların yerleştirildiği PDF üretilir ve sistem sertifikasıyla mühürlenir.
    // Mühür başarısız olursa imza yine kaydedilir; PDF indirme imzalı kopyayı yeniden üretir.
    private async Task SealFinalPdfAsync(Decision d, CancellationToken ct)
    {
        try
        {
            var logoFile = d.AcademicUnit.LogoPath switch
            {
                "/su_bilgisayar.png" => "su_bilgisayar.png",
                "/su_fbe.png" => "su_fbe.png",
                _ => throw new InvalidOperationException("Kurul logosu tanımlı değil.")
            };

            var logo = await System.IO.File.ReadAllBytesAsync(
                Path.Combine(_env.ContentRootPath, "Assets", "Pdf", logoFile), ct);

            var pdf = DecisionPdfRenderer.Render(
                d,
                logo,
                verifyUrl: DecisionVerification.Url(
                    DecisionVerification.PublicBaseUrl(_config), d.VerificationCode),
                sealing: true);

            var label = $"{d.MeetingYear}/{d.MeetingNo}-{d.DecisionNo}";
            var sealedPdf = _seal.Seal(pdf, $"Kurul kararı {label} – imzalar tamamlandı");

            d.FinalPdfBytes = sealedPdf;
            d.FinalPdfHash = Convert.ToHexString(SHA256.HashData(sealedPdf)).ToLowerInvariant();
            d.FinalPdfSealedAt = DateTime.UtcNow;

            Log($"Son PDF sistem sertifikasıyla mühürlendi (SHA-256: {d.FinalPdfHash})", d);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Karar {DecisionId} son PDF mühürlenemedi.", d.Id);
            Log("Son PDF mühürlenemedi; imzalar kaydedildi. Sunucu kaydını kontrol edin.", d);
        }
    }

    private void QueueSignatureReceipt(
        Decision d, AppUser signer, DateTime signedAt, string imageHash, bool completed)
    {
        if (!_emailQueue.IsConfigured ||
            !EmailAddressPolicy.IsDeliverable(signer.Email, EmailAddressPolicy.RequiredSuffix(_config)))
            return;

        static string E(string? s) => System.Net.WebUtility.HtmlEncode(s ?? "");

        var zone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(signedAt, DateTimeKind.Utc), zone);
        var label = $"{d.MeetingYear}/{d.MeetingNo}-{d.DecisionNo}";
        var baseUrl = DecisionVerification.PublicBaseUrl(_config);
        var verifyUrl = DecisionVerification.Url(baseUrl, d.VerificationCode);
        var doneNote = completed
            ? "<p>Tüm üyeler imzaladı; karar mühürlenerek tamamlandı.</p>"
            : "";
        var verifyLink = verifyUrl == null
            ? ""
            : $"<p><a href=\"{E(verifyUrl)}\" style=\"color:#0f1f4f\">Belgenin durumunu doğrula</a></p>";

        var html = $"""
            <div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:620px">
              <div style="background:#0f1f4f;color:#fff;padding:14px 18px;border-bottom:4px solid #f5b800">
                <strong>Selçuk Üniversitesi · Kurul Karar Sistemi</strong>
              </div>
              <div style="padding:18px;border:1px solid #e5e7eb;border-top:0">
                <p>Sayın {E(signer.FullName)},</p>
                <p><strong>{E(label)}</strong> sayılı kararı <strong>{local:dd.MM.yyyy HH:mm}</strong> tarihinde imzaladınız.</p>
                <p style="margin:0 0 4px"><strong>Gündem:</strong> {E(d.Agenda)}</p>
                <table style="font-size:12px;color:#4b5563;margin-top:12px">
                  <tr><td style="padding-right:8px">İmzaya esas belge özeti</td><td style="font-family:monospace">{E(d.SigningPdfHash)}</td></tr>
                  <tr><td style="padding-right:8px">İmza görüntüsü özeti</td><td style="font-family:monospace">{E(imageHash)}</td></tr>
                  <tr><td style="padding-right:8px">Belge doğrulama kodu</td><td style="font-family:monospace">{E(d.VerificationCode)}</td></tr>
                </table>
                {doneNote}
                {verifyLink}
                <p style="font-size:12px;color:#6b7280">Bu imzayı siz atmadıysanız hemen bölüm başkanlığına bildirin ve parolanızı değiştirin.</p>
              </div>
            </div>
            """;

        _emailQueue.Enqueue(new OutgoingEmail(signer.Email, $"Kararı imzaladınız: {label}", html));
    }

    public record SubmitRequest(byte[]? RowVersion);

    // POST: api/decisions/{id}/submit
    // Başkanın "Oylamaya Sun" adımı: karar "Oylamada" olur, metni ve ekleri kilitlenir,
    // kurul üyelerine sistem içi bildirim gider.
    [HttpPost("{id:int}/submit")]
    public Task<IActionResult> Submit(int id, SubmitRequest req) =>
        WithConflictAsync(async () =>
        {
            if (CurrentUnitId is not int unitId) return NoUnit();

            if (!await Can(Pages.NewDecision, true))
                return Denied("Kararı oylamaya sunma yetkiniz yok.");

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            if (!IsEditable(d))
                return Conflict(new { error = "Bu karar zaten oylamaya sunulmuş veya oylaması başlamış." });

            var versionError = CheckVersion(d, req.RowVersion);
            if (versionError != null) return versionError;

            d.SubmittedAt = DateTime.UtcNow;
            d.Status = DecisionStatus.Oylamada;

            AddVotingNotifications(d, unitId);
            Touch(d);
            Log("Karar oylamaya sunuldu", d);
            await _db.SaveChangesAsync();

            return Ok(ToDto(d));
        });

    [HttpPost("{id:int}/cancel")]
    public Task<IActionResult> Cancel(int id, CancelRequest req) =>
        WithConflictAsync(async () =>
        {
            if (CurrentUnitId is not int unitId) return NoUnit();
            if (!IsLifecycleManager)
                return Denied("Süreci yalnızca bu kurulun başkanı veya Admin iptal edebilir.");

            var reason = req.Reason?.Trim();

            if (string.IsNullOrWhiteSpace(reason) || reason.Length > 2000)
                return BadRequest(new
                {
                    error = "1–2000 karakter arasında iptal gerekçesi yazın."
                });

            var d = await LoadAsync(id, unitId);
            if (d == null) return NotFound();

            if (!CanCancelState(d))
                return Conflict(new { error = "Bu kararın süreci iptal edilemez." });

            var versionError = CheckVersion(d, req.RowVersion);
            if (versionError != null) return versionError;

            d.Status = DecisionStatus.IptalEdildi;
            d.CancelledAt = DateTime.UtcNow;
            d.CancelledById = CurrentUserId;

            var name = User.FindFirstValue("fullName") ??
                       User.Identity?.Name ?? "Yönetici";

            d.CancelledByName = name.Length > 300 ? name[..300] : name;
            d.CancellationReason = reason;

            Touch(d);
            Log($"Karar süreci iptal edildi. Gerekçe: {reason}", d);
            await _db.SaveChangesAsync();

            return Ok(ToDto(d));
        });

    [HttpPost("{id:int}/reconsider")]
    public async Task<IActionResult> Reconsider(
        int id,
        ReconsiderRequest req)
    {
        if (CurrentUnitId is not int unitId) return NoUnit();
        if (!IsLifecycleManager)
            return Denied("Yeniden değerlendirmeyi yalnızca başkan veya Admin başlatabilir.");

        if (req.MeetingId is int targetMeetingId)
        {
            return await ReconsiderInMeetingAsync(
                id,
                req,
                unitId,
                targetMeetingId);
        }

        if (req.MeetingDate == default || req.MeetingNo is <= 0)
            return BadRequest(new
            {
                error = "Geçerli toplantı tarihi ve numarası girin."
            });

        for (var attempt = 0; attempt < MaxRetries; attempt++)
        {
            try
            {
                var source = await LoadAsync(id, unitId);
                if (source == null) return NotFound();

                if (source.Status is not (
                    DecisionStatus.Reddedildi or DecisionStatus.IptalEdildi))
                    return Conflict(new
                    {
                        error = "Önce devam eden süreci iptal edin. İmzalanmış karar yeniden açılmaz."
                    });

                if (source.ReconsiderationDecisionId is int existingId)
                {
                    var existing = await LoadAsync(existingId, unitId);
                    return existing == null
                        ? Conflict(new { error = "Bağlı karar bulunamadı." })
                        : Ok(ToDto(existing));
                }

                var versionError = CheckVersion(source, req.RowVersion);
                if (versionError != null) return versionError;

                var year = req.MeetingDate.Year;

                var meetingNo = req.MeetingNo ??
                    ((await _db.Decisions
                        .Where(x => x.AcademicUnitId == unitId && x.MeetingYear == year)
                        .Select(x => (int?)x.MeetingNo)
                        .MaxAsync() ?? 0) + 1);

                if (await _db.Meetings.AnyAsync(m =>
                    m.AcademicUnitId == unitId &&
                    m.MeetingYear == year &&
                    m.MeetingNo == meetingNo))
                    return Conflict(new
                    {
                        error = "Bu numara bir toplantıya ait. Toplantıya bağlı yeniden değerlendirme sonraki adımda eklenecek; şimdilik farklı bir numara girin."
                    });

                if (await _db.Decisions.AnyAsync(x =>
                    x.AcademicUnitId == unitId &&
                    x.MeetingYear == year &&
                    x.MeetingNo == meetingNo &&
                    x.MeetingDate != req.MeetingDate))
                    return BadRequest(new
                    {
                        error = "Bu toplantı numarası başka bir tarih için kullanılmış."
                    });

                var no = (await _db.Decisions
                    .Where(x => x.AcademicUnitId == unitId &&
                                x.MeetingYear == year && x.MeetingNo == meetingNo)
                    .Select(x => (int?)x.DecisionNo)
                    .MaxAsync() ?? 0) + 1;

                var participants = await ParticipantSnapshot.BuildAsync(_db, unitId);

                if (participants.Count == 0)
                    return BadRequest(new { error = "Kurulda aktif oy kullanacak üye yok." });

                var draft = new Decision
                {
                    AcademicUnitId = unitId,
                    MeetingDate = req.MeetingDate,
                    MeetingYear = year,
                    MeetingNo = meetingNo,
                    DecisionNo = no,
                    Agenda = source.Agenda,
                    Reference = source.Reference,
                    Content = source.Content,
                    TableColumnsJson = source.TableColumnsJson,
                    TableRowsJson = source.TableRowsJson,
                    AttachmentsNote = "",
                    SourceDecisionId = source.Id,
                    CreatedById = CurrentUserId,
                    Status = DecisionStatus.Taslak,
                    Participants = participants
                };

                await using var transaction = await _db.Database.BeginTransactionAsync();

                Touch(source);
                _db.Decisions.Add(draft);
                await _db.SaveChangesAsync();

                source.ReconsiderationDecisionId = draft.Id;
                Touch(source);

                Log($"Yeniden değerlendirme taslağı oluşturuldu: #{draft.Id}", source);
                Log($"Taslak oluşturuldu; kaynak karar #{source.Id}", draft);

                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Created($"/api/decisions/{draft.Id}", ToDto(draft));
            }
            catch (DbUpdateConcurrencyException)
            {
                _db.ChangeTracker.Clear();
                return Conflict(new
                {
                    error = "Karar değişti. Güncel kararı yükleyip bağlı taslağı kontrol edin."
                });
            }
            catch (DbUpdateException ex) when (
                ex.InnerException is SqlException { Number: 2601 or 2627 })
            {
                _db.ChangeTracker.Clear();
            }
        }

        return Conflict(new { error = "Karar numarası çakıştı. Tekrar deneyin." });
    }

    private async Task<IActionResult> ReconsiderInMeetingAsync(
    int id,
    ReconsiderRequest req,
    int unitId,
    int meetingId)
    {
        if (meetingId <= 0)
            return BadRequest(new { error = "Geçerli bir toplantı seçin." });

        for (var attempt = 0; attempt < MaxRetries; attempt++)
        {
            try
            {
                await using var transaction =
                    await _db.Database.BeginTransactionAsync();

                var source = await LoadAsync(id, unitId);

                if (source == null)
                    return NotFound(new { error = "Kaynak karar bulunamadı." });

                if (source.Status is not (
                    DecisionStatus.Reddedildi or DecisionStatus.IptalEdildi))
                {
                    return Conflict(new
                    {
                        error = "Yalnızca reddedilmiş veya iptal edilmiş karardan yeni taslak oluşturulabilir."
                    });
                }

                // Başarılı yanıt kaybolmuşsa mevcut bağlantıyı döndür.
                if (source.ReconsiderationDecisionId is int existingId)
                {
                    var existing = await LoadAsync(existingId, unitId);

                    return existing == null
                        ? Conflict(new { error = "Bağlı karar bulunamadı." })
                        : Ok(ToDto(existing));
                }

                var versionError = CheckVersion(source, req.RowVersion);
                if (versionError != null)
                    return versionError;

                var meeting = await _db.Meetings
                    .Include(m => m.Participants)
                    .FirstOrDefaultAsync(m =>
                        m.Id == meetingId &&
                        m.AcademicUnitId == unitId);

                if (meeting == null)
                    return NotFound(new { error = "Toplantı bulunamadı." });

                if (meeting.Participants.Count == 0 ||
                    meeting.Participants.Count(p => p.IsChair) != 1)
                {
                    return Conflict(new
                    {
                        error = "Toplantının katılımcı veya başkan bilgisi geçersiz."
                    });
                }

                var maxExisting = await _db.Decisions
                    .Where(d =>
                        d.AcademicUnitId == unitId &&
                        d.MeetingYear == meeting.MeetingYear &&
                        d.MeetingNo == meeting.MeetingNo)
                    .Select(d => (int?)d.DecisionNo)
                    .MaxAsync() ?? 0;

                var lastNumber = Math.Max(
                    meeting.LastDecisionNo,
                    maxExisting);

                if (lastNumber == int.MaxValue)
                {
                    return Conflict(new
                    {
                        error = "Bu toplantıya yeni karar numarası verilemiyor."
                    });
                }

                meeting.LastDecisionNo = lastNumber + 1;
                meeting.UpdatedAt = DateTime.UtcNow;

                _db.Entry(meeting)
                    .Property(m => m.UpdatedAt)
                    .IsModified = true;

                var draft = new Decision
                {
                    AcademicUnitId = unitId,
                    MeetingId = meeting.Id,
                    MeetingDate = meeting.MeetingDate,
                    MeetingYear = meeting.MeetingYear,
                    MeetingNo = meeting.MeetingNo,
                    DecisionNo = meeting.LastDecisionNo,

                    Agenda = source.Agenda,
                    Reference = source.Reference,
                    Content = source.Content,
                    TableColumnsJson = source.TableColumnsJson,
                    TableRowsJson = source.TableRowsJson,

                    AttachmentsNote = "",
                    SourceDecisionId = source.Id,
                    CreatedById = CurrentUserId,
                    Status = DecisionStatus.Taslak,

                    Participants = meeting.Participants
                        .OrderBy(p => p.SortOrder)
                        .ThenBy(p => p.UserId)
                        .Select(p => new DecisionParticipant
                        {
                            UserId = p.UserId,
                            DisplayName = p.DisplayName,
                            Duty = p.Duty,
                            SortOrder = p.SortOrder,
                            IsChair = p.IsChair,
                            Attendance = p.Attendance
                        })
                        .ToList()
                };

                // Kaynak karar, toplantı sayacı ve yeni taslak
                // aynı transaction içinde kaydedilir.
                Touch(source);
                _db.Decisions.Add(draft);

                await _db.SaveChangesAsync();

                source.ReconsiderationDecisionId = draft.Id;
                Touch(source);

                Log(
                    $"Toplantıya bağlı yeniden değerlendirme taslağı oluşturuldu: #{draft.Id}",
                    source);

                Log(
                    $"Taslak oluşturuldu; kaynak karar #{source.Id}",
                    draft);

                await _db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Created(
                    $"/api/decisions/{draft.Id}",
                    ToDto(draft));
            }
            catch (DbUpdateConcurrencyException)
            {
                _db.ChangeTracker.Clear();
            }
            catch (DbUpdateException ex) when (
                ex.InnerException is SqlException
                {
                    Number: 2601 or 2627 or 1205
                })
            {
                _db.ChangeTracker.Clear();
            }
            catch (SqlException ex) when (ex.Number == 1205)
            {
                _db.ChangeTracker.Clear();
            }
        }

        return Conflict(new
        {
            error = "Eşzamanlı işlem nedeniyle taslak oluşturulamadı. Kaynak kararı yenileyip bağlı karar olup olmadığını kontrol edin."
        });
    }


    [HttpGet("{id:int}/pending-signers")]
    public async Task<IActionResult> PendingSigners(int id)
    {
        if (CurrentUnitId is not int unitId) return NoUnit();
        if (!await Can(Pages.NewDecision, true))
            return Denied("Bu bilgiyi görme yetkiniz yok.");

        var d = await LoadAsync(id, unitId);
        if (d == null) return NotFound();

        var ids = d.Participants
            .Where(p => p.Attendance == AttendanceStatus.Katilir && p.SignedAt == null)
            .Select(p => p.UserId)
            .ToList();

        var users = await _db.Users
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.Email })
            .ToListAsync();

        return Ok(users.Select(u => new
        {
            userId = u.Id,
            email = u.Email
        }));
    }

    [HttpGet("{id:int}/verify")]
    public async Task<IActionResult> Verify(int id)
    {
        if (CurrentUnitId is not int unitId) return NoUnit();

        var d = await LoadAsync(id, unitId);
        if (d == null) return NotFound();

        if (!await CanViewAsync(d))
            return Denied("Bu kararı görme yetkiniz yok.");

        if (d.DocumentHash == null)
            return Ok(new
            {
                isSealed = false,
                valid = (bool?)null,
                signatureVersion = d.SignatureVersion
            });

        if (d.SignatureVersion is not (null or 1 or 2))
            return Ok(new
            {
                isSealed = true,
                valid = false,
                error = "Bilinmeyen imza sürümü."
            });

        var current = DecisionRules.ComputeHash(d);
        var documentValid = current == d.DocumentHash;

        var contentValid = d.SignatureVersion == null ||
            DecisionRules.SigningContentMatches(d);

        var signers = d.Participants
            .Where(p => p.Attendance == AttendanceStatus.Katilir)
            .ToList();

        var bindingsValid = d.SignatureVersion == null ||
            (signers.Count > 0 &&
             AllExistingBindingsValid(d) &&
             signers.All(p => DemoSignatureService.HasValidBinding(d, p)));

        var fileError = await CheckAttachmentFilesAsync(
            d, HttpContext.RequestAborted);

        var stateValid =
            d.Status == DecisionStatus.Imzalandi &&
            d.SignedAt != null &&
            d.SealedAt != null;

        return Ok(new
        {
            isSealed = true,
            valid = stateValid && documentValid && contentValid &&
                    bindingsValid && fileError == null,
            documentValid,
            contentValid,
            bindingsValid,
            attachmentsValid = fileError == null,
            attachmentError = fileError,
            signatureVersion = d.SignatureVersion,
            legacy = d.SignatureVersion == null,
            signingContentHash = d.SigningContentHash,
            pdfBound = d.SignatureVersion == 2,
            pdfValid = d.SignatureVersion == 2
                ? (bool?)DecisionRules.SigningPdfMatches(d)
                : null,
            pdfHash = d.SigningPdfHash,
            storedHash = d.DocumentHash,
            currentHash = current
        });
    }
}