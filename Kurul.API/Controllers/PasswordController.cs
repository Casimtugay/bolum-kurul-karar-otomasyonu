using System.Security.Claims;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

[ApiController]
[Authorize]
[Route("api/account/password")]
public class PasswordController : ControllerBase
{
    private static readonly PasswordHasher<AppUser> Hasher = new();
    private readonly AppDbContext _db;
    public PasswordController(AppDbContext db) => _db = db;
    public record ChangeRequest(string CurrentPassword, string NewPassword, string ConfirmPassword);

    private async Task<AppUser?> CurrentAsync(CancellationToken ct)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ||
            !Guid.TryParse(User.FindFirstValue("sessionStamp"), out var stamp)) return null;
        return await _db.Users.AsNoTracking().SingleOrDefaultAsync(
            u => u.Id == id && u.IsActive && u.SessionStamp == stamp, ct);
    }

    [HttpGet("status")]
    [AllowPasswordChange]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        var user = await CurrentAsync(ct);
        return user == null ? Unauthorized(new { error = "Oturum geçersiz. Tekrar giriş yapın." })
            : Ok(new { mustChangePassword = user.MustChangePassword });
    }

    [HttpPost]
    [AllowPasswordChange]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Change(ChangeRequest req, CancellationToken ct)
    {
        var user = await CurrentAsync(ct);
        if (user == null) return Unauthorized(new { error = "Oturum geçersiz. Tekrar giriş yapın." });
        if (string.IsNullOrEmpty(req.CurrentPassword) || req.CurrentPassword.Length > 1024)
            return BadRequest(new { error = "Mevcut parolanızı girin." });
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8 || req.NewPassword.Length > 128)
            return BadRequest(new { error = "Yeni parola 8–128 karakter olmalıdır." });
        if (req.NewPassword != req.ConfirmPassword)
            return BadRequest(new { error = "Yeni parola ile tekrarı eşleşmiyor." });
        if (Hasher.VerifyHashedPassword(user, user.PasswordHash, req.CurrentPassword) == PasswordVerificationResult.Failed)
            return BadRequest(new { error = "Mevcut parola hatalı." });
        if (Hasher.VerifyHashedPassword(user, user.PasswordHash, req.NewPassword) != PasswordVerificationResult.Failed)
            return BadRequest(new { error = "Yeni parola mevcut paroladan farklı olmalıdır." });

        var hash = Hasher.HashPassword(user, req.NewPassword);
        var stamp = Guid.NewGuid();
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        // Aynı anda yönetici sıfırladıysa veya hesap değiştiyse eski bilgiyle üzerine yazılmaz.
        // ExecuteUpdate interceptor çalıştırmaz; SessionStamp bu nedenle açıkça yenilenir.
        var changed = await _db.Users.Where(u => u.Id == user.Id && u.IsActive &&
                u.SessionStamp == user.SessionStamp && u.PasswordHash == user.PasswordHash)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(u => u.PasswordHash, hash)
                .SetProperty(u => u.MustChangePassword, false)
                .SetProperty(u => u.SessionStamp, stamp), ct);
        if (changed != 1)
            return Conflict(new { error = "Hesap başka bir işlemle değişti. Çıkış yapıp tekrar giriş yapın." });
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Username = user.Username,
            Level = "info",
            Message = "Kullanıcı kendi parolasını değiştirdi; eski oturumlar geçersiz kılındı.",
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
        });
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Ok(new { ok = true, requiresLogin = true });
    }
}
