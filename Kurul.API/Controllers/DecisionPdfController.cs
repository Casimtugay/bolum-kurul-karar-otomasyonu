using System.Data;
using System.Security.Claims;
using System.Text.Json;
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
public sealed class DecisionPdfController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _permissions;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<DecisionPdfController> _logger;
    private readonly IConfiguration _config;

    // Aynı uygulama sürecinde PDF üretiminin belleği aşırı tüketmesini önler.
    private static readonly SemaphoreSlim RenderSlots = new(2, 2);

    public DecisionPdfController(
        AppDbContext db,
        PermissionService permissions,
        IWebHostEnvironment environment,
        ILogger<DecisionPdfController> logger,
        IConfiguration config)
    {
        _db = db;
        _permissions = permissions;
        _environment = environment;
        _logger = logger;
        _config = config;
    }

    public record PreviewRequest(
        DateOnly MeetingDate,
        int? MeetingNo,
        string? Agenda,
        string? Reference,
        string? Content,
        string? AttachmentsNote,
        string? TableColumnsJson,
        string? TableRowsJson,
        List<string>? AttachmentNames,
        List<int>? AttendeeIds = null);

    // POST: api/decisions/preview-pdf
    // Yeni Karar sihirbazının "PDF Önizle" adımı: karar kaydedilmeden, formdaki
    // bilgilerle ve kurulun güncel üye listesiyle taslak PDF üretir.
    [HttpPost("preview-pdf")]
    public async Task<IActionResult> Preview(
        [FromBody] PreviewRequest req,
        CancellationToken cancellationToken)
    {
        if (!int.TryParse(User.FindFirstValue("unitId"), out var unitId))
            return BadRequest(new { error = "Önce bir kurul seçmelisiniz." });

        if (!await _permissions.CanAsync(User, Pages.NewDecision, true))
            return StatusCode(403, new { error = "Karar oluşturma yetkiniz yok." });

        if (req.MeetingDate == default || req.MeetingNo is <= 0)
            return BadRequest(new { error = "Toplantı tarihi veya numarası geçersiz." });

        if (string.IsNullOrWhiteSpace(req.Agenda))
            return BadRequest(new { error = "Gündem boş olamaz." });

        if (!await RenderSlots.WaitAsync(0, cancellationToken))
        {
            return StatusCode(429, new
            {
                error = "PDF oluşturma işlemleri sürüyor. Biraz sonra tekrar deneyin."
            });
        }

        try
        {
            var unit = await _db.AcademicUnits
                .AsNoTracking()
                .SingleOrDefaultAsync(u => u.Id == unitId, cancellationToken);

            if (unit == null)
                return NotFound(new { error = "Kurul bulunamadı." });

            var logo = await LoadLogoAsync(unit, cancellationToken);
            if (logo == null)
                return Conflict(new { error = "Kurulun PDF logosu tanımlı değil." });

            var (meetingNo, decisionNo) = await DecisionNumbering.SuggestAsync(
                _db, unitId, req.MeetingDate, req.MeetingNo, cancellationToken);

            var agenda = req.Agenda.Trim();

            var decision = new Decision
            {
                AcademicUnitId = unitId,
                AcademicUnit = unit,
                MeetingDate = req.MeetingDate,
                MeetingYear = req.MeetingDate.Year,
                MeetingNo = meetingNo,
                DecisionNo = decisionNo,
                Reference = req.Reference ?? "",
                Agenda = agenda,
                Content = string.IsNullOrWhiteSpace(req.Content)
                    ? $"{agenda} konusu Kurulumuzca görüşülmüş olup {{OY_SONUCU}} uygun görülmüştür."
                    : req.Content,
                AttachmentsNote = req.AttachmentsNote ?? "",
                TableColumnsJson = string.IsNullOrWhiteSpace(req.TableColumnsJson) ? "[]" : req.TableColumnsJson,
                TableRowsJson = string.IsNullOrWhiteSpace(req.TableRowsJson) ? "[]" : req.TableRowsJson,
                Status = DecisionStatus.Taslak,
                Participants = await ParticipantSnapshot.BuildAsync(_db, unitId, req.AttendeeIds),
                Attachments = (req.AttachmentNames ?? new List<string>())
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Take(50)
                    .Select((name, i) => new Attachment { Id = i + 1, OriginalName = name.Trim() })
                    .ToList()
            };

            var pdf = DecisionPdfRenderer.Render(decision, logo);

            Response.Headers["Cache-Control"] = "no-store";
            return File(pdf, "application/pdf", "Karar-Onizleme.pdf");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (JsonException)
        {
            return BadRequest(new { error = "Karar tablosunun biçimi geçersiz." });
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Karar önizleme PDF'i oluşturulamadı.");
            return StatusCode(500, new { error = "PDF önizlemesi oluşturulamadı." });
        }
        finally
        {
            RenderSlots.Release();
        }
    }

    // DB'deki yol ile herhangi bir dosya okunamaz; yalnızca uygulamaya ait iki logo kabul edilir.
    private async Task<byte[]?> LoadLogoAsync(AcademicUnit unit, CancellationToken ct)
    {
        var logoFile = unit.LogoPath switch
        {
            "/su_bilgisayar.png" => "su_bilgisayar.png",
            "/su_fbe.png" => "su_fbe.png",
            _ => null
        };

        if (logoFile == null)
            return null;

        var logoPath = Path.Combine(_environment.ContentRootPath, "Assets", "Pdf", logoFile);
        if (!System.IO.File.Exists(logoPath))
        {
            _logger.LogError("PDF logo dosyası bulunamadı: {LogoFile}", logoFile);
            return null;
        }

        return await System.IO.File.ReadAllBytesAsync(logoPath, ct);
    }

    // original=true: imzaya esas sabit PDF (imza ekranı özet doğrulaması için).
    // Aksi halde, en az bir imza varsa imza görüntüleri yerleştirilmiş güncel kopya üretilir.
    [HttpGet("{id:int}/pdf")]
    public async Task<IActionResult> Download(
        int id,
        CancellationToken cancellationToken,
        [FromQuery] bool original = false)
    {
        if (id <= 0)
            return BadRequest(new { error = "Karar kimliği geçersiz." });

        if (!int.TryParse(
                User.FindFirstValue("unitId"),
                out var unitId))
        {
            return BadRequest(new
            {
                error = "Önce bir kurul seçmelisiniz."
            });
        }

        var canVoteRead = await _permissions.CanAsync(User, Pages.Voting);
        var canArchiveRead = await _permissions.CanAsync(User, Pages.Archive);

        if (!canVoteRead && !canArchiveRead)
        {
            return StatusCode(403, new
            {
                error = "Karar çıktısını görme yetkiniz yok."
            });
        }

        if (!await RenderSlots.WaitAsync(0, cancellationToken))
        {
            return StatusCode(429, new
            {
                error = "PDF oluşturma işlemleri sürüyor. Biraz sonra tekrar deneyin."
            });
        }

        try
        {
            Decision? decision;

            // Karar, üyeler ve ekler aynı tutarlı okuma içinde alınır.
            // PDF üretirken veritabanı kilidi tutulmaz.
            await using (var transaction =
                await _db.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable,
                    cancellationToken))
            {
                decision = await _db.Decisions
                    .AsNoTracking()
                    .AsSingleQuery()
                    .Include(d => d.AcademicUnit)
                    .Include(d => d.Participants)
                    .Include(d => d.Attachments)
                    .FirstOrDefaultAsync(
                        d => d.Id == id &&
                             d.AcademicUnitId == unitId,
                        cancellationToken);

                await transaction.CommitAsync(cancellationToken);
            }

            if (decision == null)
                return NotFound(new { error = "Karar bulunamadı." });

            var archived =
                decision.Status is DecisionStatus.Imzalandi
                    or DecisionStatus.Reddedildi
                    or DecisionStatus.IptalEdildi;

            if (!canVoteRead && !(canArchiveRead && archived))
            {
                return StatusCode(403, new
                {
                    error = "Bu kararın çıktısını görme yetkiniz yok."
                });
            }

            // DB'den gelen yol ile herhangi bir dosya okunamaz.
            // Yalnızca uygulamaya ait iki logo kabul edilir.
            var hasSignatures = decision.Participants.Any(p => p.SignedAt != null);
            var fileName = $"Kurul-Karari-{decision.MeetingYear}-{decision.MeetingNo}-{decision.DecisionNo}.pdf";

            // Tamamlanmış karar: imzaların bitiminde mühürlenen son PDF olduğu gibi verilir.
            if (!original &&
                decision.Status == DecisionStatus.Imzalandi &&
                decision.FinalPdfBytes is { Length: > 0 } finalPdf)
            {
                var finalHash = Convert.ToHexString(
                    System.Security.Cryptography.SHA256.HashData(finalPdf)).ToLowerInvariant();

                if (finalHash != decision.FinalPdfHash)
                {
                    _logger.LogError("Karar {DecisionId} mühürlü PDF özeti tutmuyor.", id);
                    return Conflict(new { error = "Mühürlü PDF'nin özeti doğrulanamadı." });
                }

                Response.Headers["Cache-Control"] = "no-store";
                return File(finalPdf, "application/pdf", fileName);
            }

            if (decision.SignatureVersion == 2 && (original || !hasSignatures))
            {
                if (!DecisionRules.SigningContentMatches(decision))
                {
                    return Conflict(new
                    {
                        error = "Sabit PDF veya bağlı karar içeriği doğrulanamadı."
                    });
                }

                Response.Headers["Cache-Control"] = "no-store";

                return File(
                    decision.SigningPdfBytes!,
                    "application/pdf",
                    $"Kurul-Karari-{decision.MeetingYear}-{decision.MeetingNo}-{decision.DecisionNo}.pdf");
            }

            var logoFile = decision.AcademicUnit.LogoPath switch
            {
                "/su_bilgisayar.png" => "su_bilgisayar.png",
                "/su_fbe.png" => "su_fbe.png",
                _ => null
            };

            if (logoFile == null)
            {
                return Conflict(new
                {
                    error = "Kurulun PDF logosu tanımlı değil."
                });
            }

            var logoPath = Path.Combine(
                _environment.ContentRootPath,
                "Assets",
                "Pdf",
                logoFile);

            if (!System.IO.File.Exists(logoPath))
            {
                _logger.LogError(
                    "PDF logo dosyası bulunamadı: {LogoFile}",
                    logoFile);

                return StatusCode(500, new
                {
                    error = "PDF logo dosyası sunucuda bulunamadı."
                });
            }

            var logo = await System.IO.File.ReadAllBytesAsync(
                logoPath, cancellationToken);

            cancellationToken.ThrowIfCancellationRequested();

            var pdf = DecisionPdfRenderer.Render(
                decision,
                logo,
                verifyUrl: DecisionVerification.Url(
                    DecisionVerification.PublicBaseUrl(_config), decision.VerificationCode));

            cancellationToken.ThrowIfCancellationRequested();

            Response.Headers["Cache-Control"] = "no-store";

            return File(
                pdf,
                "application/pdf",
                $"Kurul-Karari-{decision.MeetingYear}-" +
                $"{decision.MeetingNo}-{decision.DecisionNo}.pdf");
        }
        catch (OperationCanceledException)
            when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (JsonException exception)
        {
            _logger.LogWarning(
                exception,
                "Karar {DecisionId} PDF tablo verisi geçersiz.",
                id);

            return Conflict(new
            {
                error = "Kararın tablo verisi geçersiz. PDF oluşturulamadı."
            });
        }
        catch (Exception exception)
        {
            _logger.LogError(
                exception,
                "Karar {DecisionId} için PDF oluşturulamadı.",
                id);

            return StatusCode(500, new
            {
                error = "PDF oluşturulamadı. Sunucu kaydındaki hata ayrıntısını kontrol edin."
            });
        }
        finally
        {
            RenderSlots.Release();
        }
    }
}