using System.Security.Claims;
using System.Security.Cryptography;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace Kurul.API.Controllers;

[ApiController]
[Authorize]
[Route("api/decisions/{decisionId:int}/attachments")]
public class AttachmentsController : ControllerBase
{
    private const int MaxFilesPerDecision = 30;
    private const int MaxFilesPerRequest = 10;
    private const long MaxRequestBytes = 120L * 1024 * 1024;
    private static readonly Dictionary<string, string> Allowed =
        new(StringComparer.OrdinalIgnoreCase)
        {
            [".pdf"] = "application/pdf",
            [".xlsx"] =
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            [".xls"] = "application/vnd.ms-excel",
            [".csv"] = "text/csv",
            [".docx"] =
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            [".doc"] = "application/msword",
            [".png"] = "image/png",
            [".jpg"] = "image/jpeg",
            [".jpeg"] = "image/jpeg",
            [".zip"] = "application/zip"
        };
    private readonly AppDbContext _db;
    private readonly PermissionService _perms;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _cfg;
    private readonly ILogger<AttachmentsController> _logger;
    public AttachmentsController(
        AppDbContext db,
        PermissionService perms,
        IWebHostEnvironment env,
        IConfiguration cfg,
        ILogger<AttachmentsController> logger)
    {
        _db = db;
        _perms = perms;
        _env = env;
        _cfg = cfg;
        _logger = logger;
    }
    private string StorageRoot =>
        Path.GetFullPath(
            Path.Combine(
                _env.ContentRootPath,
                _cfg["Storage:Root"] ?? "Storage"));
    private long MaxFileBytes
    {
        get
        {
            var mb = long.TryParse(
                _cfg["Storage:MaxFileMB"], out var configured)
                && configured > 0
                && configured <= 120
                    ? configured
                    : 25;
            return mb * 1024 * 1024;
        }
    }
    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private int? CurrentUnitId =>
        int.TryParse(User.FindFirstValue("unitId"), out var id)
            ? id
            : null;
    private Task<bool> Can(string page, bool write = false) =>
        _perms.CanAsync(User, page, write);
    private IActionResult NoUnit() =>
        BadRequest(new { error = "Önce bir kurul seçmelisiniz." });
    private IActionResult Denied(string message) =>
        StatusCode(403, new { error = message });
    private Task<Decision?> LoadDecisionAsync(
        int id,
        int unitId,
        CancellationToken ct) =>
        _db.Decisions
            .Include(d => d.Participants)
            .FirstOrDefaultAsync(
                d => d.Id == id && d.AcademicUnitId == unitId,
                ct);
    private async Task<bool> CanViewAsync(Decision d) =>
        await Can(Pages.Voting) ||
        (d.Status is (DecisionStatus.Imzalandi or DecisionStatus.Reddedildi or DecisionStatus.IptalEdildi) &&
         await Can(Pages.Archive));
    // Ekler yalnızca oylamaya sunulmamış taslakta eklenip silinir.
    private static bool IsOpen(Decision d) =>
        d.Status == DecisionStatus.Taslak &&
        d.SubmittedAt == null &&
        d.SignedAt == null && d.SealedAt == null && d.DocumentHash == null &&
        !d.Participants.Any(
            p => p.Vote != null || p.SignedAt != null);
    // Ek değişikliğini de kararın eşzamanlılık kontrolüne dahil eder.
    private void Touch(Decision d)
    {
        d.UpdatedAt = DateTime.UtcNow;
        _db.Entry(d).Property(x => x.UpdatedAt).IsModified = true;
    }
    private void Log(string message, Decision d)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            AcademicUnitId = d.AcademicUnitId,
            UserId = CurrentUserId,
            Username = User.Identity?.Name,
            Level = "info",
            Message = message,
            Detail = $"Karar #{d.Id}",
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
        });
    }
    private static object ToDto(Attachment a) => new
    {
        a.Id,
        Name = a.OriginalName,
        Size = a.SizeBytes,
        a.ContentType,
        a.UploadedAt,
        a.Sha256
    };
    private string? ResolvePath(Attachment a)
    {
        if (string.IsNullOrWhiteSpace(a.StoredPath))
            return null;
        try
        {
            var root = Path.TrimEndingDirectorySeparator(StorageRoot);
            var full = Path.GetFullPath(Path.Combine(root, a.StoredPath));
            var comparison = OperatingSystem.IsWindows()
                ? StringComparison.OrdinalIgnoreCase
                : StringComparison.Ordinal;
            return full.StartsWith(
                root + Path.DirectorySeparatorChar,
                comparison)
                    ? full
                    : null;
        }
        catch (ArgumentException)
        {
            return null;
        }
        catch (NotSupportedException)
        {
            return null;
        }
    }
    private static string SafeName(string? name)
    {
        var value = Path.GetFileName(
            (name ?? "").Replace('\\', '/'));
        value = new string(
            value.Select(c =>
                char.IsControl(c) ||
                Path.GetInvalidFileNameChars().Contains(c)
                    ? '_'
                    : c).ToArray());
        value = value.Replace("..", "_").Trim();
        if (value.Length == 0)
            return "dosya";
        if (value.Length > 150)
        {
            var extension = Path.GetExtension(value);
            // Anormal uzunlukta uzantılar sonradan tür kontrolünde reddedilir.
            if (extension.Length > 20)
                return "gecersiz-uzanti";
            value = value[..(150 - extension.Length)] + extension;
        }
        return value;
    }
    // Temel dosya başlığı kontrolü; antivirüs taraması değildir.
    private static bool HeaderMatches(
        string extension,
        byte[] header,
        int length)
    {
        bool Starts(params byte[] signature) =>
            length >= signature.Length &&
            header.Take(signature.Length).SequenceEqual(signature);
        return extension.ToLowerInvariant() switch
        {
            ".pdf" => Starts(0x25, 0x50, 0x44, 0x46, 0x2D),
            ".xlsx" or ".docx" =>
                Starts(0x50, 0x4B, 0x03, 0x04),
            ".zip" =>
                Starts(0x50, 0x4B, 0x03, 0x04) ||
                Starts(0x50, 0x4B, 0x05, 0x06),
            ".xls" or ".doc" =>
                Starts(0xD0, 0xCF, 0x11, 0xE0,
                       0xA1, 0xB1, 0x1A, 0xE1),
            ".png" =>
                Starts(0x89, 0x50, 0x4E, 0x47,
                       0x0D, 0x0A, 0x1A, 0x0A),
            ".jpg" or ".jpeg" =>
                Starts(0xFF, 0xD8, 0xFF),
            ".csv" =>
                length > 0 &&
                !header.Take(length).Contains((byte)0),
            _ => false
        };
    }
    private void TryDeleteFile(string path)
    {
        try
        {
            System.IO.File.Delete(path);
        }
        catch (Exception ex) when (
            ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(
                ex,
                "Ek dosya temizlenemedi: {Path}",
                path);
        }
    }
    [HttpGet]
    public async Task<IActionResult> List(
        int decisionId,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();
        var d = await LoadDecisionAsync(decisionId, unitId, ct);
        if (d == null) return NotFound();
        if (!await CanViewAsync(d))
            return Denied("Bu kararın eklerini görme yetkiniz yok.");
        var items = await _db.Attachments
            .AsNoTracking()
            .Where(a => a.DecisionId == decisionId)
            .OrderBy(a => a.Id)
            .ToListAsync(ct);
        var canEdit =
            IsOpen(d) && await Can(Pages.NewDecision, write: true);
        return Ok(new
        {
            canEdit,
            items = items.Select(ToDto),
            maxFileBytes = MaxFileBytes,
            maxFilesPerRequest = MaxFilesPerRequest,
            maxFilesPerDecision = MaxFilesPerDecision
        });
    }
    [HttpPost]
    [RequestSizeLimit(MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestBytes)]
    public async Task<IActionResult> Upload(
        int decisionId,
        [FromForm] List<IFormFile> files,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();
        if (!await Can(Pages.NewDecision, write: true))
            return Denied("Ek yükleme yetkiniz yok.");
        var d = await LoadDecisionAsync(decisionId, unitId, ct);
        if (d == null) return NotFound();
        if (!IsOpen(d))
        {
            return BadRequest(new
            {
                error = "Oylama başladıktan sonra ek yüklenemez."
            });
        }
        if (files == null || files.Count == 0)
            return BadRequest(new { error = "Dosya seçilmedi." });
        if (files.Count > MaxFilesPerRequest)
        {
            return BadRequest(new
            {
                error =
                    $"Tek seferde en fazla {MaxFilesPerRequest} dosya yüklenebilir."
            });
        }
        var existing = await _db.Attachments.CountAsync(
            a => a.DecisionId == decisionId, ct);
        if (existing + files.Count > MaxFilesPerDecision)
        {
            return BadRequest(new
            {
                error =
                    $"Bir karara en fazla {MaxFilesPerDecision} dosya eklenebilir."
            });
        }
        // Tüm dosyaları diske yazmadan önce doğrula.
        foreach (var file in files)
        {
            var name = SafeName(file.FileName);
            var extension = Path.GetExtension(name);
            if (file.Length == 0)
            {
                return BadRequest(new
                {
                    error = $"\"{name}\" boş bir dosya."
                });
            }
            if (file.Length > MaxFileBytes)
            {
                return BadRequest(new
                {
                    error =
                        $"\"{name}\" çok büyük. En fazla {MaxFileBytes / 1024 / 1024} MB."
                });
            }
            if (!Allowed.ContainsKey(extension))
            {
                return BadRequest(new
                {
                    error = $"\"{name}\" dosyasının türüne izin verilmiyor."
                });
            }
            var header = new byte[4096];
            await using var input = file.OpenReadStream();
            var count = await input.ReadAtLeastAsync(
                header,
                header.Length,
                throwOnEndOfStream: false,
                cancellationToken: ct);
            if (!HeaderMatches(extension, header, count))
            {
                return BadRequest(new
                {
                    error =
                        $"\"{name}\" dosyasının içeriği uzantısıyla uyuşmuyor."
                });
            }
        }
        var folder = Path.Combine(
            StorageRoot,
            unitId.ToString(),
            decisionId.ToString());
        Directory.CreateDirectory(folder);
        var written = new List<string>();
        var created = new List<Attachment>();
        var saveAttempted = false;
        try
        {
            foreach (var file in files)
            {
                var name = SafeName(file.FileName);
                var extension = Path.GetExtension(name).ToLowerInvariant();
                var storedName = Guid.NewGuid().ToString("N") + extension;
                var fullPath = Path.Combine(folder, storedName);
                using var hash =
                    IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                long actualSize = 0;
                await using (var input = file.OpenReadStream())
                await using (var output = new FileStream(
                    fullPath,
                    FileMode.CreateNew,
                    FileAccess.Write,
                    FileShare.None,
                    81920,
                    useAsync: true))
                {
                    written.Add(fullPath);
                    var buffer = new byte[81920];
                    int count;
                    while ((count = await input.ReadAsync(
                        buffer.AsMemory(), ct)) > 0)
                    {
                        actualSize += count;
                        if (actualSize > MaxFileBytes)
                        {
                            throw new InvalidDataException(
                                "Dosya boyutu izin verilen sınırı aşıyor.");
                        }
                        hash.AppendData(buffer, 0, count);
                        await output.WriteAsync(
                            buffer.AsMemory(0, count), ct);
                    }
                }
                if (actualSize != file.Length)
                {
                    throw new InvalidDataException(
                        "Dosya aktarımı beklenen boyutla eşleşmiyor.");
                }
                created.Add(new Attachment
                {
                    DecisionId = decisionId,
                    OriginalName = name,
                    StoredPath = $"{unitId}/{decisionId}/{storedName}",
                    ContentType = Allowed[extension],
                    SizeBytes = actualSize,
                    Sha256 = Convert.ToHexString(
                        hash.GetHashAndReset()).ToLowerInvariant(),
                    UploadedById = CurrentUserId
                });
            }
            _db.Attachments.AddRange(created);
            // Oy verme veya başka ek işlemiyle çakışmayı tespit eder.
            Touch(d);
            Log($"Ek yüklendi: {created.Count} dosya", d);
            saveAttempted = true;
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // SaveChanges işlemi geri alındı; bu isteğin dosyalarını temizle.
            foreach (var path in written)
                TryDeleteFile(path);
            _db.ChangeTracker.Clear();
            return Conflict(new
            {
                error =
                    "Karar veya ekleri başka bir işlemle değişti. Listeyi yenileyip tekrar deneyin."
            });
        }
        catch (InvalidDataException ex) when (!saveAttempted)
        {
            foreach (var path in written)
                TryDeleteFile(path);
            return BadRequest(new { error = ex.Message });
        }
        catch
        {
            if (!saveAttempted)
            {
                foreach (var path in written)
                    TryDeleteFile(path);
            }
            else
            {
                // Bağlantı kopmasında commit sonucu belirsiz olabilir.
                // Kaydedilmiş olabilecek kayıtların dosyalarını silme.
                _logger.LogError(
                    "Karar {DecisionId} için ek kaydının sonucu doğrulanamadı. " +
                    "Dosya/veritabanı tutarlılığı kontrol edilmeli. Dosyalar: {Paths}",
                    decisionId,
                    string.Join(", ", written));
            }
            throw;
        }
        return StatusCode(201, created.Select(ToDto));
    }
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Download(
        int decisionId,
        int id,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();
        var d = await LoadDecisionAsync(decisionId, unitId, ct);
        if (d == null) return NotFound();
        if (!await CanViewAsync(d))
            return Denied("Bu dosyayı indirme yetkiniz yok.");
        var attachment = await _db.Attachments
            .AsNoTracking()
            .FirstOrDefaultAsync(
                a => a.Id == id && a.DecisionId == decisionId,
                ct);
        if (attachment == null) return NotFound();
        var path = ResolvePath(attachment);
        if (path == null || !System.IO.File.Exists(path))
        {
            return NotFound(new
            {
                error = "Dosya sunucuda bulunamadı."
            });
        }
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Cache-Control"] = "no-store";
        return PhysicalFile(
            path,
            "application/octet-stream",
            SafeName(attachment.OriginalName));
    }
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(
        int decisionId,
        int id,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();
        if (!await Can(Pages.NewDecision, write: true))
            return Denied("Ek silme yetkiniz yok.");
        var d = await LoadDecisionAsync(decisionId, unitId, ct);
        if (d == null) return NotFound();
        if (!IsOpen(d))
        {
            return BadRequest(new
            {
                error = "Oylama başladıktan sonra ek silinemez."
            });
        }
        var attachment = await _db.Attachments.FirstOrDefaultAsync(
            a => a.Id == id && a.DecisionId == decisionId,
            ct);
        if (attachment == null) return NotFound();
        var path = ResolvePath(attachment);
        _db.Attachments.Remove(attachment);
        Touch(d);
        Log($"Ek silindi: #{attachment.Id}", d);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            _db.ChangeTracker.Clear();
            return Conflict(new
            {
                error =
                    "Karar veya ekleri başka bir işlemle değişti. Listeyi yenileyin."
            });
        }
        // Fiziksel dosya yalnızca veritabanı kaydı başarıyla silinince kaldırılır.
        if (path != null)
            TryDeleteFile(path);
        return Ok(new { ok = true });
    }
    [HttpGet("verify")]
    public async Task<IActionResult> Verify(
        int decisionId,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return NoUnit();
        var d = await LoadDecisionAsync(decisionId, unitId, ct);
        if (d == null) return NotFound();
        if (!await CanViewAsync(d))
            return Denied("Bu bilgiyi görme yetkiniz yok.");
        var items = await _db.Attachments
            .AsNoTracking()
            .Where(a => a.DecisionId == decisionId)
            .OrderBy(a => a.Id)
            .ToListAsync(ct);
        var results = new List<object>();
        var allOk = true;
        foreach (var attachment in items)
        {
            ct.ThrowIfCancellationRequested();
            var path = ResolvePath(attachment);
            var missing = path == null;
            var unreadable = false;
            var ok = false;
            if (path != null)
            {
                try
                {
                    await using var stream = new FileStream(
                        path,
                        FileMode.Open,
                        FileAccess.Read,
                        FileShare.Read,
                        81920,
                        useAsync: true);
                    var sizeMatches =
                        stream.Length == attachment.SizeBytes;
                    var current = Convert.ToHexString(
                        await SHA256.HashDataAsync(stream, ct));
                    ok = sizeMatches &&
                        string.Equals(
                            current,
                            attachment.Sha256,
                            StringComparison.OrdinalIgnoreCase);
                }
                catch (FileNotFoundException)
                {
                    missing = true;
                }
                catch (DirectoryNotFoundException)
                {
                    missing = true;
                }
                catch (Exception ex) when (
                    ex is IOException or UnauthorizedAccessException)
                {
                    unreadable = true;
                    _logger.LogWarning(
                        ex,
                        "Ek dosya doğrulama sırasında okunamadı: {AttachmentId}",
                        attachment.Id);
                }
            }
            allOk &= ok;
            results.Add(new
            {
                attachment.Id,
                Name = attachment.OriginalName,
                ok,
                missing,
                unreadable
            });
        }
        return Ok(new { valid = allOk, items = results });
    }
}