using System.Security.Claims;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

[ApiController]
[Authorize]
[Route("api/meetings")]
public class MeetingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _perms;

    public record AgendaItemDto(string Title, string? Description);
    public record SaveAgendaRequest(List<AgendaItemDto>? Items);

    public MeetingsController(
        AppDbContext db,
        PermissionService perms)
    {
        _db = db;
        _perms = perms;
    }

    public record CreateMeetingRequest(
        DateOnly MeetingDate,
        int? MeetingNo);

    public record SetAttendanceRequest(
        int UserId, string Attendance, byte[]? RowVersion);

    private int? CurrentUnitId =>
        int.TryParse(
            User.FindFirstValue("unitId"),
            out var id)
                ? id
                : null;

    private int? CurrentUserId =>
        int.TryParse(
            User.FindFirstValue(ClaimTypes.NameIdentifier),
            out var id)
                ? id
                : null;

    private Task<bool> CanManageAsync() =>
        _perms.CanAsync(User, Pages.NewDecision, true);

    private async Task<bool> CanReadAsync() =>
        await _perms.CanAsync(User, Pages.NewDecision, true) ||
        await _perms.CanAsync(User, Pages.Voting);

    private IActionResult NoUnit() =>
        BadRequest(new
        {
            error = "Önce bir kurul seçmelisiniz."
        });

    private IActionResult Denied() =>
        StatusCode(403, new
        {
            error = "Bu toplantı işlemi için yetkiniz yok."
        });

    private static object ToDto(Meeting meeting)
    {
        return new
        {
            meeting.Id,
            meeting.MeetingYear,
            meeting.MeetingNo,
            meeting.MeetingDate,
            meeting.LastDecisionNo,
            meeting.CreatedAt,
            meeting.UpdatedAt,
            meeting.AttendanceLockedAt,
            attendanceLocked = meeting.AttendanceLockedAt != null,
            meeting.RowVersion,

            participants = meeting.Participants
                .OrderBy(p => p.SortOrder)
                .ThenBy(p => p.UserId)
                .Select(p => new
                {
                    p.UserId,
                    p.DisplayName,
                    p.Duty,
                    p.SortOrder,
                    p.IsChair,
                    p.Attendance
                })
                .ToArray()
        };
    }

    // Seçili kurulun toplantıları.
    // Eski kararların MeetingId=null kayıtları burada otomatik birleştirilmez.
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] int? year = null,
        CancellationToken ct = default)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();

        if (!await CanReadAsync())
            return Denied();

        if (page < 1)
        {
            return BadRequest(new
            {
                error = "Sayfa numarası en az 1 olmalıdır."
            });
        }

        if (pageSize is not (10 or 25 or 50 or 100))
        {
            return BadRequest(new
            {
                error = "Sayfa boyutu 10, 25, 50 veya 100 olmalıdır."
            });
        }

        if (year.HasValue && (year.Value < 1 || year.Value > 9999))
        {
            return BadRequest(new
            {
                error = "Yıl bilgisi geçersiz."
            });
        }

        var query = _db.Meetings
            .AsNoTracking()
            .Where(m => m.AcademicUnitId == unitId);

        if (year.HasValue)
            query = query.Where(m => m.MeetingYear == year.Value);

        var total = await query.CountAsync(ct);

        var totalPages = Math.Max(
            1,
            (int)Math.Ceiling(total / (double)pageSize));

        page = Math.Min(page, totalPages);

        var items = await query
            .OrderByDescending(m => m.MeetingYear)
            .ThenByDescending(m => m.MeetingNo)
            .ThenByDescending(m => m.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new
            {
                m.Id,
                m.MeetingYear,
                m.MeetingNo,
                m.MeetingDate,
                m.LastDecisionNo,
                m.AttendanceLockedAt,
                attendanceLocked = m.AttendanceLockedAt != null,
                m.RowVersion,

                decisionCount = m.Decisions.Count(),
                participantCount = m.Participants.Count(),

                presentCount = m.Participants.Count(
                    p => p.Attendance == AttendanceStatus.Katilir)
            })
            .ToListAsync(ct);

        return Ok(new
        {
            items,
            total,
            page,
            pageSize,
            totalPages
        });
    }

    // Toplantının katılım listesini getirir.
    // Karar içerikleri mevcut karar API'sinden alınır.
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(
        int id,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();

        if (!await CanReadAsync())
            return Denied();

        var meeting = await _db.Meetings
            .AsNoTracking()
            .Include(m => m.Participants)
            .FirstOrDefaultAsync(
                m => m.Id == id && m.AcademicUnitId == unitId,
                ct);

        if (meeting == null)
        {
            return NotFound(new
            {
                error = "Toplantı bulunamadı."
            });
        }

        return Ok(ToDto(meeting));
    }

    // Toplantı katılımı ilk oya kadar değiştirilebilir.
    // Henüz oy kullanılmamış taslak kararlara da yansıtılır.
    [HttpPut("{id:int}/attendance")]
    public async Task<IActionResult> SetAttendance(
        int id,
        SetAttendanceRequest req,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();

        if (CurrentUserId is not int userId)
            return Unauthorized();

        if (!await CanManageAsync())
            return Denied();

        if (req.RowVersion == null || req.RowVersion.Length != 8)
        {
            return BadRequest(new
            {
                error = "Toplantının sürüm bilgisi eksik. Sayfayı yenileyin."
            });
        }

        if (req.Attendance is not (
            AttendanceStatus.Katilir or
            AttendanceStatus.Izinli or
            AttendanceStatus.Gorevli))
        {
            return BadRequest(new { error = "Geçersiz katılım durumu." });
        }

        try
        {
            var meeting = await _db.Meetings
                .Include(m => m.Participants)
                .FirstOrDefaultAsync(
                    m => m.Id == id && m.AcademicUnitId == unitId,
                    ct);

            if (meeting == null)
                return NotFound(new { error = "Toplantı bulunamadı." });

            if (meeting.AttendanceLockedAt != null)
            {
                return Conflict(new
                {
                    error = "Toplantıda oy kullanıldığı için katılım artık değiştirilemez."
                });
            }

            if (!meeting.RowVersion.SequenceEqual(req.RowVersion))
            {
                return Conflict(new
                {
                    error = "Toplantı siz görüntüledikten sonra değişti. Sayfayı yenileyin."
                });
            }

            _db.Entry(meeting).Property(x => x.RowVersion).OriginalValue =
                req.RowVersion;

            var participant = meeting.Participants
                .FirstOrDefault(p => p.UserId == req.UserId);

            if (participant == null)
                return NotFound(new { error = "Üye bulunamadı." });

            if (participant.Attendance == req.Attendance)
                return Ok(ToDto(meeting));

            var now = DateTime.UtcNow;

            participant.Attendance = req.Attendance;
            // Toplantı satırı da değişir; böylece RowVersion artar ve
            // aynı anda gelen ilk oyla çakışma yakalanır.
            meeting.UpdatedAt = now;

            var decisions = await _db.Decisions
                .Include(d => d.Participants)
                .Where(d => d.MeetingId == meeting.Id &&
                            d.AcademicUnitId == unitId)
                .ToListAsync(ct);

            foreach (var decision in decisions)
            {
                var hasProgress = decision.Status != DecisionStatus.Taslak ||
                    decision.Participants.Any(
                        p => p.Vote != null || p.SignedAt != null);

                if (hasProgress) continue;

                var decisionParticipant = decision.Participants
                    .FirstOrDefault(p => p.UserId == req.UserId);

                if (decisionParticipant == null) continue;

                decisionParticipant.Attendance = req.Attendance;
                decision.UpdatedAt = now;
                DecisionRules.RefreshStatus(decision);
            }

            _db.AuditLogs.Add(new AuditLog
            {
                AcademicUnitId = unitId,
                UserId = userId,
                Username = User.Identity?.Name,
                Level = "info",
                Message = "Toplantı katılımı güncellendi",
                Detail =
                    $"Toplantı #{meeting.Id}; " +
                    $"{participant.DisplayName} → {participant.Attendance}",
                Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
            });

            await _db.SaveChangesAsync(ct);
            return Ok(ToDto(meeting));
        }
        catch (DbUpdateConcurrencyException)
        {
            _db.ChangeTracker.Clear();

            return Conflict(new
            {
                error = "Toplantı aynı anda değişti veya oylama başladı. Sayfayı yenileyin; katılım kaydedilmedi."
            });
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        CreateMeetingRequest req,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();

        if (CurrentUserId is not int userId)
            return Unauthorized();

        if (!await CanManageAsync())
            return Denied();

        if (req.MeetingDate == default ||
            req.MeetingNo is <= 0)
        {
            return BadRequest(new
            {
                error = "Geçerli toplantı tarihi ve pozitif toplantı numarası girin."
            });
        }

        var year = req.MeetingDate.Year;

        for (var attempt = 0; attempt < 3; attempt++)
        {
            ct.ThrowIfCancellationRequested();

            try
            {
                // Aynı anda toplantı oluşturan işlemlerde numara
                // kontrolü ve kayıt bir transaction içinde kalır.
                await using var transaction =
                    await _db.Database.BeginTransactionAsync(
                        System.Data.IsolationLevel.Serializable,
                        ct);

                var existingMeetingMax = await _db.Meetings
                    .Where(m =>
                        m.AcademicUnitId == unitId &&
                        m.MeetingYear == year)
                    .Select(m => (int?)m.MeetingNo)
                    .MaxAsync(ct) ?? 0;

                var existingDecisionMax = await _db.Decisions
                    .Where(d =>
                        d.AcademicUnitId == unitId &&
                        d.MeetingYear == year)
                    .Select(d => (int?)d.MeetingNo)
                    .MaxAsync(ct) ?? 0;

                var largestNumber = Math.Max(
                    existingMeetingMax,
                    existingDecisionMax);

                if (!req.MeetingNo.HasValue &&
                    largestNumber == int.MaxValue)
                {
                    return Conflict(new
                    {
                        error = "Bu yıl için yeni toplantı numarası üretilemiyor."
                    });
                }

                var meetingNo = req.MeetingNo ?? largestNumber + 1;

                var meetingExists = await _db.Meetings.AnyAsync(
                    m =>
                        m.AcademicUnitId == unitId &&
                        m.MeetingYear == year &&
                        m.MeetingNo == meetingNo,
                    ct);

                if (meetingExists)
                {
                    return Conflict(new
                    {
                        error = "Bu toplantı zaten var. Yeni toplantı oluşturmak yerine mevcut toplantıyı seçin."
                    });
                }

                var oldNumberExists = await _db.Decisions.AnyAsync(
                    d =>
                        d.AcademicUnitId == unitId &&
                        d.MeetingYear == year &&
                        d.MeetingNo == meetingNo,
                    ct);

                if (oldNumberExists)
                {
                    return Conflict(new
                    {
                        error = "Bu numara geçmiş kararlarda kullanılmış. Geçmiş kayıtlar otomatik birleştirilmez; farklı bir toplantı numarası seçin."
                    });
                }

                // O andaki aktif kurul üyelerinin görünümünü al.
                var snapshot = await ParticipantSnapshot.BuildAsync(
                    _db,
                    unitId);

                if (snapshot.Count == 0)
                {
                    return BadRequest(new
                    {
                        error = "Kurulda aktif oy kullanacak üye bulunmuyor."
                    });
                }

                if (snapshot.Count(p => p.IsChair) != 1)
                {
                    return BadRequest(new
                    {
                        error = "Toplantı oluşturmak için aktif kurul üyeleri arasında tam olarak bir başkan bulunmalıdır."
                    });
                }

                var now = DateTime.UtcNow;

                var meeting = new Meeting
                {
                    AcademicUnitId = unitId,
                    MeetingDate = req.MeetingDate,
                    MeetingYear = year,
                    MeetingNo = meetingNo,
                    LastDecisionNo = 0,
                    CreatedById = userId,
                    CreatedAt = now,
                    UpdatedAt = now,

                    Participants = snapshot.Select(p =>
                        new MeetingParticipant
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

                _db.Meetings.Add(meeting);
                await _db.SaveChangesAsync(ct);

                _db.AuditLogs.Add(new AuditLog
                {
                    AcademicUnitId = unitId,
                    UserId = userId,
                    Username = User.Identity?.Name,
                    Level = "info",
                    Message = "Toplantı oluşturuldu",
                    Detail =
                        $"Toplantı #{meeting.Id}; " +
                        $"{meeting.MeetingYear}/{meeting.MeetingNo}; " +
                        $"Tarih: {meeting.MeetingDate:yyyy-MM-dd}",
                    Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
                });

                await _db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);

                return Created(
                    $"/api/meetings/{meeting.Id}",
                    ToDto(meeting));
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
            error = "Eşzamanlı işlem nedeniyle toplantı oluşturulamadı. Toplantı listesini yenileyip tekrar deneyin."
        });
    }

    private async Task<List<AgendaSnapshot.Item>> DecisionAgendaAsync(
    int meetingId,
    int unitId,
    CancellationToken ct)
    {
        var agendas = await _db.Decisions
            .AsNoTracking()
            .Where(d =>
                d.MeetingId == meetingId &&
                d.AcademicUnitId == unitId &&
                d.Status != DecisionStatus.IptalEdildi)
            .OrderBy(d => d.DecisionNo)
            .ThenBy(d => d.Id)
            .Select(d => d.Agenda)
            .ToListAsync(ct);

        // Karar metni duyuruya taşınmaz; yalnızca gündem başlığı kullanılır.
        // Aynı başlıklı farklı kararlar ayrı maddeler olarak korunur.
        return agendas
            .Select(agenda => new AgendaSnapshot.Item(
                (agenda ?? string.Empty).Trim(),
                string.Empty))
            .ToList();
    }

    private async Task<List<int>> RecipientUserIdsAsync(
        Meeting meeting, int unitId, CancellationToken ct)
    {
        var ids = meeting.Participants
            .Select(p => p.UserId)
            .Distinct()
            .ToList();

        if (ids.Count > 0)
            return ids;

        return await _db.UserUnits
            .Where(u => u.AcademicUnitId == unitId &&
                        u.IsActive &&
                        u.IsBoardMember)
            .Select(u => u.UserId)
            .Distinct()
            .ToListAsync(ct);
    }

    // GET: api/meetings/{id}/agenda
    // Gündem taslağı yalnızca yönetebilen kişiye gösterilir.
    [HttpGet("{id:int}/agenda")]
    public async Task<IActionResult> GetAgenda(
     int id,
     CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();

        if (!await CanManageAsync())
            return Denied();

        var meeting = await _db.Meetings
            .AsNoTracking()
            .Include(m => m.Participants)
            .FirstOrDefaultAsync(
                m => m.Id == id &&
                     m.AcademicUnitId == unitId,
                ct);

        if (meeting == null)
            return NotFound(new { error = "Toplantı bulunamadı." });

        var items = await DecisionAgendaAsync(id, unitId, ct);

        var latest = await _db.MeetingAgendaPublications
            .AsNoTracking()
            .Where(p => p.MeetingId == id)
            .OrderByDescending(p => p.Version)
            .FirstOrDefaultAsync(ct);

        var hash = AgendaSnapshot.Hash(items);

        var recipientCount =
            (await RecipientUserIdsAsync(meeting, unitId, ct)).Count;

        var hasEmptyAgenda =
            items.Any(item => string.IsNullOrWhiteSpace(item.Title));

        return Ok(new
        {
            items = items.Select((item, index) => new
            {
                id = index + 1,
                title = item.Title,
                description = item.Description
            }),
            contentHash = hash,
            source = "decisions",
            canPublish = items.Count > 0 && !hasEmptyAgenda,
            validationError = hasEmptyAgenda
                ? "Bazı kararların gündem alanı boş. İlgili kararları düzenleyin."
                : null,
            status = latest != null ? "Yayimlandi" : "Taslak",
            publishedAt = latest?.PublishedAt,
            publishedVersion = latest?.Version ?? 0,
            hasUnpublishedChanges =
                latest == null || latest.ContentHash != hash,
            recipientCount
        });
    }

    // PUT: api/meetings/{id}/agenda
    // Eski istemcilerin elle gündem kaydetmesini engeller.
    // Gündem, toplantıya bağlı kararlardan otomatik oluşturulur.
    [HttpPut("{id:int}/agenda")]
    public async Task<IActionResult> SaveAgenda(
     int id,
     [FromBody] SaveAgendaRequest req,
     CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();

        if (!await CanManageAsync())
            return Denied();

        var exists = await _db.Meetings
            .AsNoTracking()
            .AnyAsync(
                m => m.Id == id &&
                     m.AcademicUnitId == unitId,
                ct);

        if (!exists)
            return NotFound(new { error = "Toplantı bulunamadı." });

        return Conflict(new
        {
            error = "Gündem toplantıya bağlı kararlardan otomatik oluşturulur. " +
                    "Değişiklik için ilgili kararın gündem alanını düzenleyin."
        });
    }

    // POST: api/meetings/{id}/publish
    // Taslağı yeni bir sürüm olarak yayımlar ve üyelere sistem içi bildirim yazar.
    // Aynı içerik tekrar yayımlanırsa yeni bildirim üretilmez.

    private async Task<IActionResult> PublishMeetingCore(
     int id,
     string expectedHash,
     CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();

        if (CurrentUserId is not int actorId)
            return Unauthorized();

        if (!await CanManageAsync())
            return Denied();

        var meeting = await _db.Meetings
            .Include(m => m.Participants)
            .Include(m => m.AcademicUnit)
            .FirstOrDefaultAsync(m => m.Id == id && m.AcademicUnitId == unitId, ct);

        if (meeting == null)
            return NotFound(new { error = "Toplantı bulunamadı." });

        var items = await DecisionAgendaAsync(id, unitId, ct);

        if (items.Count == 0)
        {
            return BadRequest(new
            {
                error = "Bu toplantıya henüz yayımlanabilecek bir karar eklenmemiş."
            });
        }

        if (items.Any(item => string.IsNullOrWhiteSpace(item.Title)))
        {
            return BadRequest(new
            {
                error = "Bazı kararların gündem alanı boş. İlgili kararları düzenleyin."
            });
        }
        var hash = AgendaSnapshot.Hash(items);
        if (!string.Equals(hash, expectedHash, StringComparison.Ordinal))
        {
            return Conflict(new
            {
                error = "Önizlemeden sonra toplantının gündemi değişti. " +
                        "Gündemi yenileyip tekrar önizleyin."
            });
        }

        var latest = await _db.MeetingAgendaPublications
            .AsNoTracking()
            .Where(p => p.MeetingId == id)
            .OrderByDescending(p => p.Version)
            .FirstOrDefaultAsync(ct);

        // Tekrar isteği: içerik zaten yayımlı, yeni bildirim üretme.
        if (latest != null && latest.ContentHash == hash)
        {
            return Ok(new
            {
                success = true,
                alreadyPublished = true,
                version = latest.Version,
                notifiedCount = 0
            });
        }

        var now = DateTime.UtcNow;
        var version = (latest?.Version ?? 0) + 1;

        var publication = new MeetingAgendaPublication
        {
            MeetingId = meeting.Id,
            Version = version,
            ContentHash = hash,
            ItemsJson = AgendaSnapshot.Serialize(items),
            PublishedById = actorId,
            PublishedAt = now
        };

        _db.MeetingAgendaPublications.Add(publication);

        meeting.IsPublished = true;
        meeting.PublishedAt = now;
        meeting.UpdatedAt = now;

        var recipientUserIds = await RecipientUserIdsAsync(meeting, unitId, ct);

        var boardName = meeting.AcademicUnit?.BoardName ?? "Kurul";
        var label = $"{meeting.MeetingYear}/{meeting.MeetingNo}";

        var notifTitle = version == 1
            ? $"{label} Sayılı Toplantı Gündemi Yayımlandı"
            : $"{label} Sayılı Toplantı Gündemi Güncellendi";

        var notifMsg =
            $"{meeting.MeetingDate:dd.MM.yyyy} tarihli {boardName} toplantı gündemi " +
            (version == 1 ? "yayımlanmıştır." : "güncellenmiştir.");

        foreach (var userId in recipientUserIds)
        {
            _db.Notifications.Add(new Notification
            {
                UserId = userId,
                UnitId = unitId,
                MeetingId = meeting.Id,
                Publication = publication,
                Title = notifTitle,
                Message = notifMsg,
                IsRead = false,
                CreatedAt = now
            });
        }

        _db.AuditLogs.Add(new AuditLog
        {
            AcademicUnitId = unitId,
            UserId = actorId,
            Username = User.Identity?.Name,
            Level = "info",
            Message = "Toplantı gündemi yayımlandı",
            Detail = $"{label} sayılı toplantı gündemi sürüm {version} olarak yayımlandı; " +
                     $"{recipientUserIds.Count} üyeye sistem içi bildirim oluşturuldu.",
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
            CreatedAt = now
        });

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new
            {
                error = "Toplantı aynı anda başka bir işlemle değişti. Sayfayı yenileyip tekrar deneyin."
            });
        }
        catch (DbUpdateException ex) when (
            ex.InnerException is SqlException { Number: 2601 or 2627 })
        {
            return Conflict(new
            {
                error = "Gündem aynı anda başka bir işlemle yayımlandı. Sayfayı yenileyin."
            });
        }

        return Ok(new
        {
            success = true,
            alreadyPublished = false,
            version,
            notifiedCount = recipientUserIds.Count
        });
    }

    // POST: api/meetings/{id}/announcement-email
    // Kullanıcının e-posta uygulamasında açılacak alıcı, konu ve metni hazırlar.
    // Sunucu e-posta göndermez ve "gönderildi" kaydı oluşturmaz.
    [HttpPost("{id:int}/announcement-email")]
    public async Task<IActionResult> PrepareAnnouncementEmail(int id, CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();

        if (!await CanManageAsync())
            return Denied();

        var meeting = await _db.Meetings
            .AsNoTracking()
            .Include(m => m.Participants)
            .Include(m => m.AcademicUnit)
            .FirstOrDefaultAsync(m => m.Id == id && m.AcademicUnitId == unitId, ct);

        if (meeting == null)
            return NotFound(new { error = "Toplantı bulunamadı." });

        var latest = await _db.MeetingAgendaPublications
            .AsNoTracking()
            .Where(p => p.MeetingId == id)
            .OrderByDescending(p => p.Version)
            .FirstOrDefaultAsync(ct);

        if (latest == null)
            return BadRequest(new { error = "E-posta hazırlamadan önce gündemi yayımlayın." });

        var userIds = await RecipientUserIdsAsync(meeting, unitId, ct);

        var rawEmails = await _db.Users
            .AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .Select(u => u.Email)
            .ToListAsync(ct);

        var emails = rawEmails
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var missingEmailCount = rawEmails.Count(e => string.IsNullOrWhiteSpace(e));

        var boardName = meeting.AcademicUnit?.BoardName ?? "Kurul";
        var label = $"{meeting.MeetingYear}/{meeting.MeetingNo}";
        var items = AgendaSnapshot.Deserialize(latest.ItemsJson);

        var subject =
            $"[{boardName}] {label} Sayılı Toplantı Gündemi" +
            (latest.Version > 1 ? " (Güncellendi)" : "");

        var nl = "\r\n";
        var body = new System.Text.StringBuilder();
        body.Append("Sayın Kurul Üyesi,").Append(nl).Append(nl);
        body.Append($"{boardName} {label} sayılı toplantısı {meeting.MeetingDate:dd.MM.yyyy} tarihinde yapılacaktır.").Append(nl);
        body.Append("Gündem maddeleri aşağıdadır:").Append(nl).Append(nl);

        for (var i = 0; i < items.Count; i++)
        {
            body.Append($"{i + 1}. {items[i].Title}").Append(nl);

            if (!string.IsNullOrWhiteSpace(items[i].Description))
                body.Append($"   {items[i].Description}").Append(nl);
        }

        body.Append(nl);
        body.Append("Gündemin tamamını ve kararları sisteme giriş yaparak görüntüleyebilirsiniz.").Append(nl);

        _db.AuditLogs.Add(new AuditLog
        {
            AcademicUnitId = unitId,
            UserId = CurrentUserId,
            Username = User.Identity?.Name,
            Level = "info",
            Message = "Duyuru e-postası hazırlandı",
            Detail = $"{label} sayılı toplantı için {emails.Count} alıcılı e-posta taslağı hazırlandı. " +
                     "Sistem e-posta göndermez; gönderim kullanıcının e-posta uygulamasındadır.",
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            bcc = emails,
            subject,
            body = body.ToString(),
            recipientCount = emails.Count,
            missingEmailCount,
            version = latest.Version
        });
    }

    [HttpPost("{id:int}/publish")]
    public async Task<IActionResult> PublishMeeting(
    int id,
    CancellationToken ct,
    [FromQuery] string? expectedHash = null)
    {
        if (string.IsNullOrWhiteSpace(expectedHash))
        {
            return BadRequest(new
            {
                error = "Önce toplantının gündemini yükleyip önizleyin."
            });
        }

        var strategy = _db.Database.CreateExecutionStrategy();

        try
        {
            return await strategy.ExecuteAsync(async () =>
            {
                _db.ChangeTracker.Clear();

                await using var transaction =
                    await _db.Database.BeginTransactionAsync(
                        System.Data.IsolationLevel.Serializable,
                        ct);

                var result = await PublishMeetingCore(id, expectedHash, ct);

                if (result is OkObjectResult)
                    await transaction.CommitAsync(ct);
                else
                    await transaction.RollbackAsync(ct);

                return result;
            });
        }
        catch (SqlException ex) when (ex.Number == 1205)
        {
            _db.ChangeTracker.Clear();

            return Conflict(new
            {
                error = "Toplantı aynı anda başka bir işlemle değişti. " +
                        "Gündemi yenileyip tekrar deneyin."
            });
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is SqlException { Number: 1205 })
        {
            _db.ChangeTracker.Clear();

            return Conflict(new
            {
                error = "Toplantı aynı anda başka bir işlemle değişti. " +
                        "Gündemi yenileyip tekrar deneyin."
            });
        }
    }
}