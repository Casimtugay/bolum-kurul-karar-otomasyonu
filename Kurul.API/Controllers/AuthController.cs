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
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private static readonly PasswordHasher<AppUser> Hasher = new();

    private readonly AppDbContext _db;
    private readonly TokenService _tokens;

    public AuthController(AppDbContext db, TokenService tokens)
    {
        _db = db;
        _tokens = tokens;
    }

    // Güvenlik kodu kapalıyken CaptchaId/CaptchaAnswer gönderilmez.
    public record LoginRequest(
    string Username,
    string Password,
    Guid CaptchaId = default,
    string? CaptchaAnswer = null);
    public record SelectUnitRequest(string UnitCode);

    private record UnitDto(
        string Code,
        string Name,
        string BoardName,
        string ParentName,
        string UnitType,
        string UnitRole,
        string Duty);

    // Admin tüm kurulları, diğer kullanıcılar aktif üyeliklerini görür.
    private async Task<List<UnitDto>> GetUnitsAsync(AppUser user)
    {
        if (user.Role == SystemRoles.Admin)
        {
            return await _db.AcademicUnits
                .AsNoTracking()
                .OrderBy(a => a.Name)
                .Select(a => new UnitDto(
                    a.Code,
                    a.Name,
                    a.BoardName,
                    a.ParentName,
                    a.UnitType,
                    SystemRoles.Admin,
                    "Yönetici"))
                .ToListAsync();
        }

        return await _db.UserUnits
            .AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive)
            .OrderBy(x => x.AcademicUnit.Name)
            .Select(x => new UnitDto(
                x.AcademicUnit.Code,
                x.AcademicUnit.Name,
                x.AcademicUnit.BoardName,
                x.AcademicUnit.ParentName,
                x.AcademicUnit.UnitType,
                x.UnitRole,
                x.Duty))
            .ToListAsync();
    }

    private async Task WriteLogAsync(
        string level,
        string message,
        AppUser? user,
        string? username,
        int? unitId = null)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            AcademicUnitId = unitId,
            Level = level,
            Message = message,
            UserId = user?.Id,
            Username = username,
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
        });

        await _db.SaveChangesAsync();
    }

    [AllowAnonymous]
    [HttpGet("captcha")]
    [EnableRateLimiting("captcha")]
    public async Task<IActionResult> Captcha(
        [FromServices] LoginCaptchaService captcha,
        [FromServices] IConfiguration config,
        CancellationToken ct)
    {
        Response.Headers["Cache-Control"] = "no-store";

        // Kapalıyken giriş ekranı güvenlik kodu alanını göstermez.
        if (!CaptchaEnabled(config))
            return Ok(new { enabled = false });

        return Ok(await captcha.CreateAsync(ct));
    }

    // Giriş güvenlik kodu şimdilik kapalı. Açmak için appsettings: "LoginCaptcha": { "Enabled": true }.
    // Kapalıyken kaba kuvvet denemelerine karşı "login" hız sınırı (dakikada 10) devam eder.
    private static bool CaptchaEnabled(IConfiguration config) =>
        config.GetValue("LoginCaptcha:Enabled", false);


    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login(
          LoginRequest req,
          [FromServices] LoginCaptchaService captcha,
          [FromServices] IConfiguration config)
    {
        if (CaptchaEnabled(config) &&
            !await captcha.ConsumeAsync(
                req.CaptchaId,
                req.CaptchaAnswer,
                HttpContext.RequestAborted))
        {
            return BadRequest(new
            {
                error = "Güvenlik kodu hatalı, kullanılmış veya süresi dolmuş. Yeni kodla tekrar deneyin."
            });
        }

       var inputIdentifier = req.Username?.Trim();

        if (string.IsNullOrWhiteSpace(inputIdentifier) ||
            string.IsNullOrEmpty(req.Password))
        {
            return BadRequest(new
            {
                error = "E-posta adresi ve parola zorunludur."
            });
        }

        var normalizedInput = inputIdentifier.ToLowerInvariant();

        // Giriş yalnızca kurumsal adresle yapılır (admin dahil): "kullanıcıadı@selcuk.edu.tr".
        // Adresin @ öncesi kullanıcı adıdır; iletişim e-postası farklı olsa da (ör. Gmail) bu adresle girilir.
        const string LoginDomain = "@selcuk.edu.tr";
        if (!normalizedInput.EndsWith(LoginDomain, StringComparison.Ordinal) ||
            normalizedInput.Length == LoginDomain.Length)
        {
            return BadRequest(new
            {
                error = "Giriş için kurumsal e-posta adresinizi yazın (kullanıcıadı@selcuk.edu.tr)."
            });
        }

        var loginName = normalizedInput[..^LoginDomain.Length];

        var user = await _db.Users
            .FirstOrDefaultAsync(u =>
                (u.Username.ToLower() == loginName ||
                 (u.Email != null && u.Email.ToLower() == normalizedInput)) &&
                u.IsActive);

        if (user == null ||
            Hasher.VerifyHashedPassword(
                user,
                user.PasswordHash,
                req.Password) == PasswordVerificationResult.Failed)
        {
            await WriteLogAsync(
                "warn",
                "Başarısız giriş denemesi",
                null,
                inputIdentifier);

            return Unauthorized(new
            {
                error = "E-posta adresi veya parola hatalı."
            });
        }

        // Parola doğrulandıktan sonra aktif kurul üyeliğini kontrol et.
        // Sistem yöneticisinin kurul üyeliği bulunması gerekmez.
        var units = await GetUnitsAsync(user);

        if (user.Role != SystemRoles.Admin && units.Count == 0)
        {
            await WriteLogAsync(
                "warn",
                "Aktif kurul üyeliği bulunmadığı için giriş engellendi",
                user,
                user.Username);

            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Aktif kurul üyeliğiniz bulunmuyor. Sistem yöneticisine başvurun."
            });
        }

        await WriteLogAsync(
            "info",
            "Giriş yapıldı",
            user,
            user.Username);

        return Ok(new
        {
            token = _tokens.Create(user),
            user = new
            {
                user.Id,
                user.FullName,
                user.Title,
                user.Role
            },
            units
        });
    }

    [Authorize]
    [HttpPost("select-unit")]
    public async Task<IActionResult> SelectUnit(SelectUnitRequest req)
    {
        if (!int.TryParse(
                User.FindFirstValue(ClaimTypes.NameIdentifier),
                out var userId))
        {
            return Unauthorized(new
            {
                error = "Oturum geçersiz. Tekrar giriş yapın."
            });
        }

        var user = await _db.Users
            .FirstOrDefaultAsync(x => x.Id == userId && x.IsActive);

        if (user == null)
        {
            return Unauthorized(new
            {
                error = "Oturum geçersiz. Tekrar giriş yapın."
            });
        }

        var unitCode = req.UnitCode?.Trim();

        if (string.IsNullOrWhiteSpace(unitCode))
        {
            return BadRequest(new
            {
                error = "Lütfen bir kurul seçin."
            });
        }

        var unit = await _db.AcademicUnits
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Code == unitCode);

        if (unit == null)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Bu kurula erişim yetkiniz yok."
            });
        }

        UnitDto chosen;
        IReadOnlyDictionary<string, PagePerm> permissions;

        if (user.Role == SystemRoles.Admin)
        {
            chosen = new UnitDto(
                unit.Code,
                unit.Name,
                unit.BoardName,
                unit.ParentName,
                unit.UnitType,
                SystemRoles.Admin,
                "Yönetici");

            permissions = PermissionJson.AllTrue();
        }
        else
        {
            // Üyelik ve yetkileri aynı sorguda, güncel haliyle al.
            var membership = await _db.UserUnits
                .AsNoTracking()
                .Where(x =>
                    x.UserId == user.Id &&
                    x.AcademicUnitId == unit.Id &&
                    x.IsActive)
                .Select(x => new
                {
                    x.UnitRole,
                    x.Duty,
                    PermissionsJson = x.Role.PermissionsJson
                })
                .FirstOrDefaultAsync();

            if (membership == null)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    error = "Bu kurula erişim yetkiniz yok."
                });
            }

            chosen = new UnitDto(
                unit.Code,
                unit.Name,
                unit.BoardName,
                unit.ParentName,
                unit.UnitType,
                membership.UnitRole,
                membership.Duty);

            permissions = PermissionJson.Parse(
                membership.PermissionsJson);
        }

        await WriteLogAsync(
            "info",
            $"Kurul seçildi: {unit.BoardName}",
            user,
            user.Username,
            unit.Id);

        return Ok(new
        {
            token = _tokens.Create(user, unit, chosen.UnitRole),
            unit = chosen,
            permissions
        });
    }

    // Mevcut yanıt biçimi korunur.
    [Authorize]
    [HttpGet("me")]
    public IActionResult Me() =>
        Ok(User.Claims
            .GroupBy(c => c.Type.Split('/').Last())
            .ToDictionary(g => g.Key, g => g.First().Value));
}