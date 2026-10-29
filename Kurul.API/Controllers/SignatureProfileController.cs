using System.Security.Claims;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

// Kullanıcının profilde kayıtlı imzası ("İmzam" sayfası).
// Yalnızca kişi kendi imzasını görür ve değiştirir.
[Authorize]
[ApiController]
[Route("api/account/signature")]
public class SignatureProfileController : ControllerBase
{
    private readonly AppDbContext _db;

    public SignatureProfileController(AppDbContext db)
    {
        _db = db;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record SaveSignatureRequest(string? Image);

    // GET: api/account/signature
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var saved = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == CurrentUserId)
            .Select(u => new { u.SavedSignaturePng, u.SavedSignatureUpdatedAt })
            .SingleAsync(ct);

        return Ok(new
        {
            hasSignature = saved.SavedSignaturePng != null,
            image = saved.SavedSignaturePng == null ? null : SignatureImage.ToDataUrl(saved.SavedSignaturePng),
            updatedAt = saved.SavedSignatureUpdatedAt
        });
    }

    // PUT: api/account/signature  { "image": "data:image/png;base64,..." }
    [HttpPut]
    public async Task<IActionResult> Save([FromBody] SaveSignatureRequest req, CancellationToken ct)
    {
        if (!SignatureImage.TryParse(req.Image, out var png, out var error))
            return BadRequest(new { error });

        var user = await _db.Users.SingleAsync(u => u.Id == CurrentUserId, ct);
        user.SavedSignaturePng = png;
        user.SavedSignatureUpdatedAt = DateTime.UtcNow;

        _db.AuditLogs.Add(new AuditLog
        {
            Level = "info",
            Message = "Kayıtlı imza güncellendi",
            UserId = user.Id,
            Username = user.Username,
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
        });

        await _db.SaveChangesAsync(ct);
        return Ok(new { hasSignature = true, updatedAt = user.SavedSignatureUpdatedAt });
    }

    // DELETE: api/account/signature
    [HttpDelete]
    public async Task<IActionResult> Remove(CancellationToken ct)
    {
        var user = await _db.Users.SingleAsync(u => u.Id == CurrentUserId, ct);
        user.SavedSignaturePng = null;
        user.SavedSignatureUpdatedAt = null;
        await _db.SaveChangesAsync(ct);
        return Ok(new { hasSignature = false });
    }
}
