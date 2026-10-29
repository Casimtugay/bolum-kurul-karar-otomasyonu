using System.Security.Cryptography;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

// "Belge Doğrula": PDF'deki kod/QR ile giriş yapmadan kararın güncel durumu.
// Kod tahmin edilemez ve yalnızca imzaya esas PDF'si sabitlenmiş kararlarda vardır;
// kodu bilen kişi zaten belgenin kendisine sahiptir. İmza görüntüsü ve oy gerekçesi verilmez.
[AllowAnonymous]
[ApiController]
[Route("api/verify")]
[EnableRateLimiting("rsvp")]
public class VerifyController : ControllerBase
{
    private const long MaxUploadBytes = 20 * 1024 * 1024;

    private readonly AppDbContext _db;

    public VerifyController(AppDbContext db)
    {
        _db = db;
    }

    // GET: api/verify/{code}
    [HttpGet("{code}")]
    public async Task<IActionResult> Get(string code, CancellationToken ct)
    {
        var d = await FindAsync(code, ct);
        if (d == null) return NotFoundCode();

        var signers = d.Participants
            .Where(p => p.Attendance == AttendanceStatus.Katilir)
            .OrderBy(p => p.SortOrder)
            .ThenBy(p => p.UserId)
            .Select(p => new { name = p.DisplayName, signedAt = p.SignedAt })
            .ToList();

        return Ok(new
        {
            code = d.VerificationCode,
            unit = d.AcademicUnit.Name,
            board = d.AcademicUnit.BoardName,
            meetingDate = d.MeetingDate,
            label = $"{d.MeetingYear}/{d.MeetingNo}-{d.DecisionNo}",
            agenda = d.Agenda,
            status = d.Status,
            signingPdfHash = d.SigningPdfHash,
            signingPdfFrozenAt = d.SigningPdfFrozenAt,
            finalPdfHash = d.FinalPdfHash,
            finalPdfSealedAt = d.FinalPdfSealedAt,
            completedAt = d.SignedAt,
            cancelledAt = d.CancelledAt,
            cancellationReason = d.CancellationReason,
            signedCount = signers.Count(s => s.signedAt != null),
            signers
        });
    }

    // POST: api/verify/{code}/file
    // Elindeki PDF'nin bu kararın kayıtlı PDF'lerinden biriyle birebir aynı olup olmadığını söyler.
    [HttpPost("{code}/file")]
    [RequestSizeLimit(MaxUploadBytes + 64 * 1024)]
    public async Task<IActionResult> CheckFile(string code, IFormFile? file, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "Kontrol edilecek PDF dosyasını seçin." });

        if (file.Length > MaxUploadBytes)
            return BadRequest(new { error = "Dosya 20 MB sınırını aşıyor." });

        var d = await FindAsync(code, ct);
        if (d == null) return NotFoundCode();

        byte[] bytes;
        await using (var stream = file.OpenReadStream())
        using (var buffer = new MemoryStream())
        {
            await stream.CopyToAsync(buffer, ct);
            bytes = buffer.ToArray();
        }

        var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

        var match =
            hash == d.FinalPdfHash ? "final" :
            hash == d.SigningPdfHash ? "signing" :
            "none";

        var seal = DecisionSealService.Check(bytes);

        return Ok(new
        {
            match,
            hash,
            sealPresent = seal.Sealed,
            sealValid = seal.Valid,
            sealSigner = seal.Signer,
            sealSignedAt = seal.SignedAt
        });
    }

    private async Task<Decision?> FindAsync(string code, CancellationToken ct)
    {
        var normalized = DecisionVerification.Normalize(code);
        if (normalized == null) return null;

        return await _db.Decisions
            .AsNoTracking()
            .AsSplitQuery()
            .Include(d => d.AcademicUnit)
            .Include(d => d.Participants)
            .FirstOrDefaultAsync(d => d.VerificationCode == normalized, ct);
    }

    private NotFoundObjectResult NotFoundCode() =>
        NotFound(new { error = "Bu doğrulama koduyla kayıtlı bir karar bulunamadı. Kodu kontrol edin." });
}
