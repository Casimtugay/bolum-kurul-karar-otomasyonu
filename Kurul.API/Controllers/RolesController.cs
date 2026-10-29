using System.Security.Claims;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

// Rol yönetimi: "roles" sayfası yetkisi olanlar. Admin tüm kurulları, diğerleri sadece kendi kurulunu yönetir.
[ApiController]
[Authorize]
[Route("api/admin/roles")]
public class RolesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _perms;

    public RolesController(AppDbContext db, PermissionService perms)
    {
        _db = db;
        _perms = perms;
    }

    public record SaveRoleRequest(string? Name, bool IsBoardMember, Dictionary<string, PagePerm>? Permissions);

    private record Ctx(AcademicUnit Unit, IReadOnlyDictionary<string, PagePerm> Perms);

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool IsAdmin => User.FindFirstValue(ClaimTypes.Role) == SystemRoles.Admin;

    private IActionResult Err(int code, string msg) => StatusCode(code, new { error = msg });

    private async Task<(Ctx? Ctx, IActionResult? Error)> GuardAsync(string? unitCode, bool write)
    {
        var perms = await _perms.GetAsync(User);
        var ok = perms.TryGetValue(Pages.Roles, out var p) && (write ? p.Write : p.Read);
        if (!ok) return (null, Err(403, "Bu işlem için yetkiniz yok."));

        AcademicUnit? unit = null;
        if (IsAdmin && !string.IsNullOrWhiteSpace(unitCode))
            unit = await _db.AcademicUnits.FirstOrDefaultAsync(a => a.Code == unitCode);
        else if (int.TryParse(User.FindFirstValue("unitId"), out var id))
            unit = await _db.AcademicUnits.FindAsync(id);

        return unit == null ? (null, Err(400, "Önce bir kurul seçmelisiniz.")) : (new Ctx(unit, perms), null);
    }

    private void Log(AcademicUnit unit, string message, string? detail = null) =>
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

    // ---------- Liste ----------

    [HttpGet]
    public async Task<IActionResult> List([FromQuery(Name = "unit")] string? unitCode)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: false);
        if (ctx == null) return error!;
        var hasWrite = ctx.Perms[Pages.Roles].Write;

        var roles = await _db.Roles.Where(r => r.AcademicUnitId == ctx.Unit.Id).OrderBy(r => r.Id).ToListAsync();
        var counts = await _db.UserUnits
            .Where(x => x.AcademicUnitId == ctx.Unit.Id && x.IsActive)
            .GroupBy(x => x.RoleId)
            .Select(g => new { RoleId = g.Key, N = g.Count() })
            .ToDictionaryAsync(x => x.RoleId, x => x.N);

        int Count(int roleId) => counts.TryGetValue(roleId, out var n) ? n : 0;

        return Ok(roles.Select(r =>
        {
            var perms = PermissionJson.Parse(r.PermissionsJson);
            var editable = hasWrite && (IsAdmin || PermissionJson.IsSubset(perms, ctx.Perms));
            return new
            {
                r.Id,
                r.Name,
                r.Kind,
                r.IsSystem,
                memberCount = Count(r.Id),
                permissions = perms,
                editable,
                deletable = editable && !r.IsSystem
            };
        }));
    }

    // ---------- Yeni rol ----------

    [HttpPost]
    public async Task<IActionResult> Create([FromQuery(Name = "unit")] string? unitCode, SaveRoleRequest req)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: true);
        if (ctx == null) return error!;

        var name = (req.Name ?? "").Trim();
        if (name.Length < 2 || name.Length > 100) return Err(400, "Rol adı 2-100 karakter olmalı.");
        if (await _db.Roles.AnyAsync(r => r.AcademicUnitId == ctx.Unit.Id && r.Name == name))
            return Err(400, "Bu isimde bir rol zaten var.");

        var perms = PermissionJson.Normalize(req.Permissions);
        if (!IsAdmin && !PermissionJson.IsSubset(perms, ctx.Perms))
            return Err(403, "Sahip olmadığınız bir yetkiyi bir role veremezsiniz.");

        var role = new RoleDefinition
        {
            AcademicUnitId = ctx.Unit.Id,
            Name = name,
            Kind = req.IsBoardMember ? UnitRoles.Uye : UnitRoles.OyKullanmayan,
            IsSystem = false,
            PermissionsJson = PermissionJson.Serialize(perms)
        };
        _db.Roles.Add(role);
        Log(ctx.Unit, $"Rol oluşturuldu: {name}");

        try { await _db.SaveChangesAsync(); }
        catch (DbUpdateException) { return Err(409, "Kayıt çakıştı. Tekrar deneyin."); }

        return Ok(new { id = role.Id });
    }

    // ---------- Düzenle (hazır rollerde sadece yetkiler; ad ve tür sabit) ----------

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromQuery(Name = "unit")] string? unitCode, SaveRoleRequest req)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: true);
        if (ctx == null) return error!;

        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id && r.AcademicUnitId == ctx.Unit.Id);
        if (role == null) return Err(404, "Rol bulunamadı.");

        var current = PermissionJson.Parse(role.PermissionsJson);
        if (!IsAdmin && !PermissionJson.IsSubset(current, ctx.Perms))
            return Err(403, "Sizden daha yetkili bir rolü değiştiremezsiniz.");

        var perms = PermissionJson.Normalize(req.Permissions);
        if (!IsAdmin && !PermissionJson.IsSubset(perms, ctx.Perms))
            return Err(403, "Sahip olmadığınız bir yetkiyi bir role veremezsiniz.");

        var renamed = false;
        if (!role.IsSystem)
        {
            var name = (req.Name ?? "").Trim();
            if (name.Length < 2 || name.Length > 100) return Err(400, "Rol adı 2-100 karakter olmalı.");
            if (name != role.Name)
            {
                if (await _db.Roles.AnyAsync(r => r.AcademicUnitId == ctx.Unit.Id && r.Name == name && r.Id != id))
                    return Err(400, "Bu isimde bir rol zaten var.");
                role.Name = name;
                renamed = true;
            }
        }

        role.PermissionsJson = PermissionJson.Serialize(perms);
        Log(ctx.Unit, $"Rol güncellendi: {role.Name}");

        try
        {
            await _db.SaveChangesAsync();
            // Ekranda görünen görev adı rolün adını izler
            if (renamed)
                await _db.UserUnits.Where(x => x.RoleId == role.Id)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.Duty, role.Name));
        }
        catch (DbUpdateException) { return Err(409, "Kayıt çakıştı. Tekrar deneyin."); }

        return Ok(new { ok = true });
    }

    // ---------- Sil (sadece sonradan eklenen roller; atanmış üye varsa silinmez) ----------

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, [FromQuery(Name = "unit")] string? unitCode)
    {
        var (ctx, error) = await GuardAsync(unitCode, write: true);
        if (ctx == null) return error!;

        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == id && r.AcademicUnitId == ctx.Unit.Id);
        if (role == null) return Err(404, "Rol bulunamadı.");
        if (role.IsSystem) return Err(400, "Hazır roller silinemez.");

        if (!IsAdmin && !PermissionJson.IsSubset(PermissionJson.Parse(role.PermissionsJson), ctx.Perms))
            return Err(403, "Sizden daha yetkili bir rolü silemezsiniz.");

        var activeCount = await _db.UserUnits.CountAsync(x => x.RoleId == id && x.IsActive);
        if (activeCount > 0)
            return Err(400, $"Bu role atanmış {activeCount} üye var. Önce üyelerin rolünü değiştirin.");

        // Daha önce kuruldan çıkarılmış (pasif) üyelerin kaydı hazır Üye rolüne taşınır;
        // oy hakkı verilmez (IsBoardMember=false), geçmiş kayıtlar bozulmaz.
        var fallback = await _db.Roles.FirstAsync(r =>
            r.AcademicUnitId == ctx.Unit.Id && r.IsSystem && r.Kind == UnitRoles.Uye);
        await _db.UserUnits.Where(x => x.RoleId == id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.RoleId, fallback.Id)
                .SetProperty(x => x.UnitRole, fallback.Kind)
                .SetProperty(x => x.Duty, fallback.Name)
                .SetProperty(x => x.IsBoardMember, false));

        _db.Roles.Remove(role);
        Log(ctx.Unit, $"Rol silindi: {role.Name}");
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }
}