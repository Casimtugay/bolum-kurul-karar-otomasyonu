using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.RegularExpressions;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

[ApiController]
[Authorize]
[Route("api/admin/users")]
public class UserManagementController : ControllerBase
{
    private static readonly PasswordHasher<AppUser> Hasher = new();

    private static readonly Regex UsernameRx =
        new(@"^[a-z0-9._-]{3,50}$");

    private static readonly EmailAddressAttribute EmailValidator = new();

    private readonly AppDbContext _db;
    private readonly PermissionService _perms;

    public UserManagementController(
        AppDbContext db,
        PermissionService perms)
    {
        _db = db;
        _perms = perms;
    }

    public record CreateUserRequest(
        string Username,
        string? FullName,
        string? Title,
        string? Email,
        string? PhoneNumber,
        string? Password,
        int RoleId);

    public record UpdateUserRequest(
        int RoleId,
        string? FullName,
        string? Title,
        string? Email,
        string? PhoneNumber);

    public record PasswordRequest(string NewPassword);

    private record Ctx(
        AcademicUnit Unit,
        IReadOnlyDictionary<string, PagePerm> Perms);


    private int CurrentUserId =>
        int.TryParse(
            User.FindFirstValue(ClaimTypes.NameIdentifier),
            out var id)
            ? id
            : 0;

    private bool IsAdmin =>
        User.FindFirstValue(ClaimTypes.Role) == SystemRoles.Admin;

    private IActionResult Err(int code, string message) =>
        StatusCode(code, new { error = message });

    private static bool IsValidEmail(string email) =>
        email.Length <= 200 &&
        EmailValidator.IsValid(email);

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is SqlException
        {
            Number: 2601 or 2627
        };

    // Admin hedef kurulu seçebilir.
    // Diğer kullanıcılar yalnızca token'daki kurulu yönetebilir.
    private async Task<(Ctx? Ctx, IActionResult? Error)> GuardAsync(
        string? unitCode,
        bool write)
    {
        if (CurrentUserId <= 0)
            return (null, Err(401, "Oturum geçersiz. Tekrar giriş yapın."));

        var perms = await _perms.GetAsync(User);

        var allowed = perms.TryGetValue(Pages.Users, out var permission) &&
                      (write ? permission.Write : permission.Read);

        if (!allowed)
            return (null, Err(403, "Bu işlem için yetkiniz yok."));

        var requestedCode = unitCode?.Trim();
        AcademicUnit? unit = null;

        if (IsAdmin && !string.IsNullOrWhiteSpace(requestedCode))
        {
            unit = await _db.AcademicUnits
                .FirstOrDefaultAsync(a => a.Code == requestedCode);
        }
        else if (int.TryParse(
                     User.FindFirstValue("unitId"),
                     out var unitId))
        {
            unit = await _db.AcademicUnits.FindAsync(unitId);
        }

        if (unit == null)
            return (null, Err(400, "Geçerli bir kurul seçmelisiniz."));

        if (!IsAdmin &&
            !string.IsNullOrWhiteSpace(requestedCode) &&
            requestedCode != unit.Code)
        {
            return (null, Err(403, "Başka bir kurulu yönetme yetkiniz yok."));
        }

        return (new Ctx(unit, perms), null);
    }

    // Başkan rolünü yalnızca admin atayabilir.
    // Diğer kullanıcılar kendi yetkilerini aşan bir rol atayamaz.
    private bool CanAssign(
        RoleDefinition role,
        IReadOnlyDictionary<string, PagePerm> myPerms) =>
        IsAdmin ||
        (role.Kind != UnitRoles.Baskan &&
         PermissionJson.IsSubset(
             PermissionJson.Parse(role.PermissionsJson),
             myPerms));

    private IActionResult? AssignError(
        RoleDefinition role,
        IReadOnlyDictionary<string, PagePerm> myPerms)
    {
        if (CanAssign(role, myPerms))
            return null;

        return Err(
            403,
            role.Kind == UnitRoles.Baskan
                ? "Başkan rolünü yalnızca sistem yöneticisi atayabilir."
                : "Sahip olduğunuzdan fazla yetkisi olan bir rolü atayamazsınız.");
    }

    private bool CanManageMember(
        UserUnit membership,
        IReadOnlyDictionary<string, PagePerm> myPerms)
    {
        // Sistem yöneticisinin hesabı kurul yönetiminden değiştirilmez.
        if (membership.User.Role == SystemRoles.Admin)
            return false;

        if (IsAdmin)
            return true;

        return membership.UserId != CurrentUserId &&
               membership.UnitRole != UnitRoles.Baskan &&
               PermissionJson.IsSubset(
                   PermissionJson.Parse(membership.Role.PermissionsJson),
                   myPerms);
    }

    private async Task ApplyRoleAsync(
        UserUnit membership,
        RoleDefinition role,
        AcademicUnit unit)
    {
        membership.Role = role;
        membership.RoleId = role.Id;
        membership.UnitRole = role.Kind;
        membership.Duty = role.Name;
        membership.IsBoardMember =
            role.Kind is UnitRoles.Baskan or UnitRoles.Uye;

        if (!membership.IsBoardMember)
        {
            membership.SortOrder = 0;
        }
        else if (membership.SortOrder == 0)
        {
            var max = await _db.UserUnits
                .Where(x => x.AcademicUnitId == unit.Id)
                .MaxAsync(x => (int?)x.SortOrder) ?? 0;

            membership.SortOrder = max + 1;
        }
    }

    private Task<bool> HasChairAsync(
        int unitId,
        int exceptUserId = 0) =>
        _db.UserUnits.AnyAsync(x =>
            x.AcademicUnitId == unitId &&
            x.IsActive &&
            x.UnitRole == UnitRoles.Baskan &&
            x.UserId != exceptUserId);

    private Task<int> OtherUnitCountAsync(int userId, int unitId) =>
        _db.UserUnits.CountAsync(x =>
            x.UserId == userId &&
            x.IsActive &&
            x.AcademicUnitId != unitId);

    private void Log(
        AcademicUnit unit,
        string message,
        string? detail = null)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            AcademicUnitId = unit.Id,
            UserId = CurrentUserId,
            Username = User.Identity?.Name,
            Level = "info",
            Message = message,
            Detail = detail,
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
        });
    }

    // Yeni kullanıcılar için tahmin edilemez geçici parola.
    // Kullanıcı ilk girişte parolasını değiştirmek zorundadır (MustChangePassword).
    private static string GenerateTemporaryPassword()
    {
        const string chars =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

        var sb = new System.Text.StringBuilder("Kurul.");

        for (var i = 0; i < 12; i++)
        {
            sb.Append(
                chars[System.Security.Cryptography.RandomNumberGenerator
                    .GetInt32(chars.Length)]);
        }

        return sb.Append('!').ToString();
    }

    private static string NormalizeUsername(string raw)
    {
        var clean = raw.Trim().ToLowerInvariant()
            .Replace("ç", "c").Replace("ğ", "g")
            .Replace("ı", "i").Replace("ö", "o")
            .Replace("ş", "s").Replace("ü", "u");

        clean = Regex.Replace(clean, @"[^a-z0-9._-]", "");

        if (clean.Length > 50)
            clean = clean[..50];

        while (clean.Length < 3)
            clean += "1";

        return clean;
    }

    // ---------- Atanabilir roller ----------

    [HttpGet("roles")]
    public async Task<IActionResult> AssignableRoles(
        [FromQuery(Name = "unit")] string? unitCode)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: false);
        if (ctx == null)
            return error!;

        var roles = await _db.Roles
            .AsNoTracking()
            .Where(r => r.AcademicUnitId == ctx.Unit.Id)
            .OrderBy(r => r.Id)
            .ToListAsync();

        var hasWrite = ctx.Perms[Pages.Users].Write;

        return Ok(roles.Select(r => new
        {
            r.Id,
            r.Name,
            r.Kind,
            assignable = hasWrite && CanAssign(r, ctx.Perms)
        }));
    }

    // ---------- Liste ----------

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery(Name = "unit")] string? unitCode)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: false);
        if (ctx == null)
            return error!;

        var unit = ctx.Unit;
        var hasWrite = ctx.Perms[Pages.Users].Write;

        var members = await _db.UserUnits
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.Role)
            .Where(x =>
                x.AcademicUnitId == unit.Id &&
                x.IsActive)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.User.FullName)
            .ToListAsync();

        var ids = members.Select(m => m.UserId).ToList();

        var others = await _db.UserUnits
            .Where(x =>
                x.IsActive &&
                x.AcademicUnitId != unit.Id &&
                ids.Contains(x.UserId))
            .GroupBy(x => x.UserId)
            .Select(g => new
            {
                UserId = g.Key,
                Count = g.Count()
            })
            .ToDictionaryAsync(x => x.UserId, x => x.Count);

        return Ok(members.Select(m =>
        {
            var canManage =
                hasWrite && CanManageMember(m, ctx.Perms);

            var canEditProfile =
                canManage &&
                (IsAdmin || !others.ContainsKey(m.UserId));

            return new
            {
                userId = m.UserId,
                title = m.User.Title,
                fullName = m.User.FullName,
                username = m.User.Username,
                email = m.User.Email,
                phoneNumber = m.User.PhoneNumber,
                roleId = m.RoleId,
                roleName = m.Role.Name,
                unitRole = m.UnitRole,
                duty = m.Duty,
                isBoardMember = m.IsBoardMember,
                isActive = m.User.IsActive,
                isSelf = m.UserId == CurrentUserId,
                canManage,
                canEditProfile,
                canResetPassword = canEditProfile
            };
        }));
    }

    // ---------- Kurula ekle / eski üyeliği yeniden etkinleştir ----------

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromQuery(Name = "unit")] string? unitCode,
        CreateUserRequest req)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: true);
        if (ctx == null)
            return error!;

        var unit = ctx.Unit;

        var role = await _db.Roles.FirstOrDefaultAsync(r =>
            r.Id == req.RoleId &&
            r.AcademicUnitId == unit.Id);

        if (role == null)
            return Err(400, "Geçersiz rol.");

        var assignError = AssignError(role, ctx.Perms);
        if (assignError != null)
            return assignError;

        if (role.Kind == UnitRoles.Baskan &&
            await HasChairAsync(unit.Id))
        {
            return Err(
                400,
                "Bu kurulda zaten bir başkan var. Önce mevcut başkanın rolünü değiştirin.");
        }

        var username = (req.Username ?? "")
            .Trim()
            .ToLowerInvariant();

        if (!UsernameRx.IsMatch(username))
        {
            return Err(
                400,
                "Kullanıcı adı 3-50 karakter olmalı; küçük harf, rakam, nokta, tire veya alt çizgi içerebilir.");
        }

        var normalizedEmail = (req.Email ?? "").Trim().ToLowerInvariant();

        // Kullanıcı adı VEYA e-posta eşleşen mevcut bir hesap varsa onu kullan.
        var user = await _db.Users
            .FirstOrDefaultAsync(u =>
                u.Username == username ||
                (normalizedEmail != "" && u.Email == normalizedEmail));

        if (user != null)
        {
            if (!user.IsActive)
                return Err(400, "Bu kullanıcı hesabı devre dışı.");

            if (user.Role == SystemRoles.Admin)
            {
                return Err(
                    400,
                    "Sistem yöneticisi kurula üye olarak eklenemez.");
            }

            // Başka kurullarda da üye olan kişinin kişisel bilgilerini yalnızca sistem
            // yöneticisi değiştirebilir (Update ve Excel aktarımıyla aynı kural).
            if (IsAdmin ||
                await OtherUnitCountAsync(user.Id, unit.Id) == 0)
            {
                if (!string.IsNullOrWhiteSpace(req.PhoneNumber))
                    user.PhoneNumber = req.PhoneNumber.Trim();

                if (!string.IsNullOrWhiteSpace(req.Title))
                    user.Title = req.Title.Trim();

                if (!string.IsNullOrWhiteSpace(req.FullName))
                    user.FullName = req.FullName.Trim();
            }

        }

        else
        {
            var fullName = (req.FullName ?? "").Trim();
            var email = (req.Email ?? "").Trim().ToLowerInvariant();

            if (fullName.Length < 3)
                return Err(400, "Yeni kullanıcı için ad soyad gerekli.");

            if (!IsValidEmail(email))
                return Err(400, "Geçerli bir e-posta adresi girin.");

            if (string.IsNullOrWhiteSpace(req.Password) ||
                req.Password.Length < 8 || req.Password.Length > 128)
            {
                return Err(400, "Parola 8–128 karakter olmalıdır.");
            }

            if (await _db.Users.AnyAsync(u => u.Email == email))
            {
                return Err(
                    400,
                    "Bu e-posta adresi başka bir kullanıcıda kayıtlı.");
            }

            user = new AppUser
            {
                FullName = fullName,
                Title = (req.Title ?? "").Trim(),
                Username = username,
                Email = email,
                PhoneNumber = req.PhoneNumber?.Trim(),
                IsActive = true,
                MustChangePassword = true
            };

            user.PasswordHash =
                Hasher.HashPassword(user, req.Password);

            _db.Users.Add(user);
        }

        var membership = user.Id == 0
            ? null
            : await _db.UserUnits.FirstOrDefaultAsync(x =>
                x.UserId == user.Id &&
                x.AcademicUnitId == unit.Id);

        if (membership is { IsActive: true })
            return Err(400, "Bu kullanıcı zaten bu kurulun üyesi.");

        var reactivated = membership != null;

        if (membership == null)
        {
            membership = new UserUnit
            {
                User = user,
                AcademicUnitId = unit.Id
            };

            _db.UserUnits.Add(membership);
        }

        membership.IsActive = true;
        await ApplyRoleAsync(membership, role, unit);

        Log(
            unit,
            reactivated
                ? $"Kurul üyeliği yeniden etkinleştirildi: {username}"
                : $"Kurul üyesi eklendi: {username}",
            $"Rol: {role.Name}");

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            return Err(
                409,
                "Kullanıcı adı, e-posta veya kurul üyeliği başka bir kayıtla çakıştı. Listeyi yenileyin.");
        }

        return Ok(new { userId = user.Id });
    }

    // ---------- Düzenle ----------

    [HttpPut("{userId:int}")]
    public async Task<IActionResult> Update(
        int userId,
        [FromQuery(Name = "unit")] string? unitCode,
        UpdateUserRequest req)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: true);
        if (ctx == null)
            return error!;

        var unit = ctx.Unit;

        var membership = await _db.UserUnits
            .Include(x => x.User)
            .Include(x => x.Role)
            .FirstOrDefaultAsync(x =>
                x.UserId == userId &&
                x.AcademicUnitId == unit.Id &&
                x.IsActive);

        if (membership == null)
            return Err(404, "Üye bulunamadı.");

        if (!CanManageMember(membership, ctx.Perms))
        {
            return Err(
                403,
                userId == CurrentUserId
                    ? "Bu ekrandan kendi bilgilerinizi veya rolünüzü değiştiremezsiniz."
                    : "Bu kişinin bilgilerini veya rolünü değiştirme yetkiniz yok.");
        }

        var newName = req.FullName?.Trim() ?? membership.User.FullName;
        var newTitle = req.Title?.Trim() ?? membership.User.Title;
        var newEmail = req.Email?.Trim().ToLowerInvariant()
                       ?? membership.User.Email;
        var newPhone = req.PhoneNumber?.Trim() ?? membership.User.PhoneNumber;

        var profileChanged =
            newName != membership.User.FullName ||
            newTitle != membership.User.Title ||
            newEmail != membership.User.Email ||
            newPhone != membership.User.PhoneNumber;

        var roleChanged = req.RoleId != membership.RoleId;

        if (profileChanged)
        {
            if (!IsAdmin &&
                await OtherUnitCountAsync(userId, unit.Id) > 0)
            {
                return Err(
                    403,
                    "Bu kişi başka kurullarda da üye olduğu için kişisel bilgilerini yalnızca sistem yöneticisi değiştirebilir.");
            }

            if (string.IsNullOrWhiteSpace(newName) ||
                newName.Length < 3)
            {
                return Err(400, "Ad soyad en az 3 karakter olmalıdır.");
            }

            if (!IsValidEmail(newEmail))
                return Err(400, "Geçerli bir e-posta adresi girin.");

            if (await _db.Users.AnyAsync(u =>
                    u.Email == newEmail &&
                    u.Id != userId))
            {
                return Err(
                    400,
                    "Bu e-posta adresi başka bir kullanıcıda kayıtlı.");
            }
        }

        if (roleChanged)
        {
            var role = await _db.Roles.FirstOrDefaultAsync(r =>
                r.Id == req.RoleId &&
                r.AcademicUnitId == unit.Id);

            if (role == null)
                return Err(400, "Geçersiz rol.");

            var assignError = AssignError(role, ctx.Perms);
            if (assignError != null)
                return assignError;

            if (role.Kind == UnitRoles.Baskan &&
                await HasChairAsync(unit.Id, userId))
            {
                return Err(
                    400,
                    "Bu kurulda zaten bir başkan var. Önce mevcut başkanın rolünü değiştirin.");
            }

            await ApplyRoleAsync(membership, role, unit);
        }

        if (!profileChanged && !roleChanged)
            return Ok(new { ok = true });

        if (profileChanged)
        {
            membership.User.FullName = newName;
            membership.User.Title = newTitle;
            membership.User.Email = newEmail;
            membership.User.PhoneNumber = newPhone;
        }

        Log(
            unit,
            $"Kurul üyesi güncellendi: {membership.User.Username}",
            $"Rol: {membership.Duty}");

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Err(
                409,
                "Kayıt başka bir işlem sırasında değişti. Listeyi yenileyin.");
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            return Err(
                409,
                "Kayıt çakıştı. E-posta adresini kontrol edip listeyi yenileyin.");
        }

        return Ok(new { ok = true });
    }

    // ---------- Kuruldan çıkar ----------

    [HttpDelete("{userId:int}")]
    public async Task<IActionResult> Remove(
        int userId,
        [FromQuery(Name = "unit")] string? unitCode)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: true);
        if (ctx == null)
            return error!;

        var unit = ctx.Unit;

        var membership = await _db.UserUnits
            .Include(x => x.User)
            .Include(x => x.Role)
            .FirstOrDefaultAsync(x =>
                x.UserId == userId &&
                x.AcademicUnitId == unit.Id &&
                x.IsActive);

        if (membership == null)
            return Err(404, "Üye bulunamadı.");

        if (userId == CurrentUserId)
            return Err(400, "Kendinizi kuruldan çıkaramazsınız.");

        if (!CanManageMember(membership, ctx.Perms))
        {
            return Err(
                403,
                "Bu kişiyi kuruldan çıkarma yetkiniz yok.");
        }

        membership.IsActive = false;

        Log(
            unit,
            $"Kurul üyesi kuruldan çıkarıldı: {membership.User.Username}");

        await _db.SaveChangesAsync();

        return Ok(new { ok = true });
    }

    // ---------- Parola sıfırla ----------

    [HttpPost("{userId:int}/password")]
    public async Task<IActionResult> ResetPassword(
        int userId,
        [FromQuery(Name = "unit")] string? unitCode,
        PasswordRequest req)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: true);
        if (ctx == null)
            return error!;

        var unit = ctx.Unit;

        var membership = await _db.UserUnits
            .Include(x => x.User)
            .Include(x => x.Role)
            .FirstOrDefaultAsync(x =>
                x.UserId == userId &&
                x.AcademicUnitId == unit.Id &&
                x.IsActive);

        if (membership == null)
            return Err(404, "Üye bulunamadı.");

        if (!CanManageMember(membership, ctx.Perms))
        {
            return Err(
                403,
                "Bu kişinin parolasını sıfırlama yetkiniz yok.");
        }

        if (!IsAdmin &&
            await OtherUnitCountAsync(userId, unit.Id) > 0)
        {
            return Err(
                403,
                "Bu kişi başka kurullarda da üye olduğu için parolasını yalnızca sistem yöneticisi sıfırlayabilir.");
        }

        if (string.IsNullOrWhiteSpace(req.NewPassword) ||
            req.NewPassword.Length < 8 || req.NewPassword.Length > 128)
        {
            return Err(400, "Parola 8–128 karakter olmalıdır.");
        }

        membership.User.MustChangePassword = true;
        membership.User.SessionStamp = Guid.NewGuid();
        membership.User.PasswordHash =
            Hasher.HashPassword(membership.User, req.NewPassword);

        Log(
            unit,
            $"Parola sıfırlandı: {membership.User.Username}");

        await _db.SaveChangesAsync();

        return Ok(new { ok = true });
    }
}