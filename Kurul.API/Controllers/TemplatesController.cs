using System.Security.Claims;
using System.Text.Json;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

// Kurulun kendi karar şablonları: Yeni Karar sihirbazında hazır şablonların yanında listelenir.
// Okuma ve yazma "Yeni Karar" yazma yetkisi ister (şablonu yalnızca kararı hazırlayan kullanır).
[ApiController]
[Authorize]
[Route("api/templates")]
public class TemplatesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _perms;

    public TemplatesController(AppDbContext db, PermissionService perms)
    {
        _db = db;
        _perms = perms;
    }

    public record TemplateRequest(
        string Name,
        string? Reference,
        string? Agenda,
        string? Content,
        string? AttachmentsNote,
        string? TableColumnsJson,
        bool IsDraft);

    private int? CurrentUnitId =>
        int.TryParse(User.FindFirstValue("unitId"), out var id) ? id : null;

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static object ToDto(DecisionTemplate t) => new
    {
        t.Id,
        t.Name,
        t.Reference,
        t.Agenda,
        t.Content,
        t.AttachmentsNote,
        t.TableColumnsJson,
        t.IsDraft,
        t.CreatedByName,
        t.CreatedAt,
        t.UpdatedAt
    };

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return BadRequest(new { error = "Önce bir kurul seçmelisiniz." });
        if (!await _perms.CanAsync(User, Pages.NewDecision, true))
            return StatusCode(403, new { error = "Şablonları görme yetkiniz yok." });

        var list = await _db.DecisionTemplates
            .AsNoTracking()
            .Where(t => t.AcademicUnitId == unitId)
            .OrderBy(t => t.IsDraft)
            .ThenBy(t => t.Name)
            .ToListAsync(ct);

        return Ok(list.Select(ToDto));
    }

    [HttpPost]
    public async Task<IActionResult> Create(TemplateRequest req, CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return BadRequest(new { error = "Önce bir kurul seçmelisiniz." });
        if (!await _perms.CanAsync(User, Pages.NewDecision, true))
            return StatusCode(403, new { error = "Şablon ekleme yetkiniz yok." });

        var error = Validate(req);
        if (error != null) return BadRequest(new { error });

        if (await NameTakenAsync(unitId, req.Name.Trim(), null, ct))
            return Conflict(new { error = "Bu kurulda aynı adlı bir şablon zaten var." });

        var user = await _db.Users.AsNoTracking().SingleAsync(u => u.Id == CurrentUserId, ct);
        var template = new DecisionTemplate
        {
            AcademicUnitId = unitId,
            CreatedById = user.Id,
            CreatedByName = string.IsNullOrWhiteSpace(user.Title) ? user.FullName : $"{user.Title} {user.FullName}"
        };
        Apply(template, req);

        _db.DecisionTemplates.Add(template);
        Log(unitId, $"Karar şablonu eklendi: {template.Name}" + (template.IsDraft ? " (taslak)" : ""));
        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(template));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, TemplateRequest req, CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return BadRequest(new { error = "Önce bir kurul seçmelisiniz." });
        if (!await _perms.CanAsync(User, Pages.NewDecision, true))
            return StatusCode(403, new { error = "Şablon düzenleme yetkiniz yok." });

        var template = await _db.DecisionTemplates
            .FirstOrDefaultAsync(t => t.Id == id && t.AcademicUnitId == unitId, ct);
        if (template == null) return NotFound(new { error = "Şablon bulunamadı." });

        var error = Validate(req);
        if (error != null) return BadRequest(new { error });

        if (await NameTakenAsync(unitId, req.Name.Trim(), id, ct))
            return Conflict(new { error = "Bu kurulda aynı adlı bir şablon zaten var." });

        Apply(template, req);
        template.UpdatedAt = DateTime.UtcNow;
        Log(unitId, $"Karar şablonu güncellendi: {template.Name}" + (template.IsDraft ? " (taslak)" : ""));
        await _db.SaveChangesAsync(ct);

        return Ok(ToDto(template));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return BadRequest(new { error = "Önce bir kurul seçmelisiniz." });
        if (!await _perms.CanAsync(User, Pages.NewDecision, true))
            return StatusCode(403, new { error = "Şablon silme yetkiniz yok." });

        var template = await _db.DecisionTemplates
            .FirstOrDefaultAsync(t => t.Id == id && t.AcademicUnitId == unitId, ct);
        if (template == null) return NotFound(new { error = "Şablon bulunamadı." });

        // Şablondan oluşturulan kararlar metnin kopyasını taşır; silmek kararları etkilemez.
        _db.DecisionTemplates.Remove(template);
        Log(unitId, $"Karar şablonu silindi: {template.Name}");
        await _db.SaveChangesAsync(ct);

        return Ok(new { ok = true });
    }

    private static string? Validate(TemplateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name)) return "Şablon adı zorunludur.";
        if (req.Name.Trim().Length > 200) return "Şablon adı en fazla 200 karakter olabilir.";
        if ((req.Reference?.Length ?? 0) > 2000 || (req.Agenda?.Length ?? 0) > 2000 ||
            (req.AttachmentsNote?.Length ?? 0) > 2000)
            return "İlgi, gündem ve ekler alanları en fazla 2000 karakter olabilir.";
        if ((req.Content?.Length ?? 0) > 20000) return "Karar metni en fazla 20.000 karakter olabilir.";
        if (!req.IsDraft && string.IsNullOrWhiteSpace(req.Content))
            return "Kullanıma açılacak şablonda karar metni boş olamaz.";

        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(req.TableColumnsJson) ? "[]" : req.TableColumnsJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() > 10)
                return "Tablo en fazla 10 sütun içerebilir.";
            foreach (var column in doc.RootElement.EnumerateArray())
            {
                if (column.ValueKind != JsonValueKind.Object ||
                    !column.TryGetProperty("key", out var key) || key.ValueKind != JsonValueKind.String ||
                    !column.TryGetProperty("label", out var label) || label.ValueKind != JsonValueKind.String)
                    return "Tablo sütunları geçersiz.";
            }
        }
        catch (JsonException)
        {
            return "Tablo sütunları geçersiz.";
        }

        return null;
    }

    private static void Apply(DecisionTemplate t, TemplateRequest req)
    {
        t.Name = req.Name.Trim();
        t.Reference = req.Reference?.Trim() ?? "";
        t.Agenda = req.Agenda?.Trim() ?? "";
        t.Content = req.Content?.Trim() ?? "";
        t.AttachmentsNote = req.AttachmentsNote?.Trim() ?? "";
        t.TableColumnsJson = string.IsNullOrWhiteSpace(req.TableColumnsJson) ? "[]" : req.TableColumnsJson;
        t.IsDraft = req.IsDraft;
    }

    private Task<bool> NameTakenAsync(int unitId, string name, int? exceptId, CancellationToken ct) =>
        _db.DecisionTemplates.AnyAsync(
            t => t.AcademicUnitId == unitId && t.Name == name && t.Id != exceptId, ct);

    private void Log(int unitId, string message) =>
        _db.AuditLogs.Add(new AuditLog
        {
            AcademicUnitId = unitId,
            UserId = CurrentUserId,
            Username = User.Identity?.Name,
            Level = "info",
            Message = message,
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
        });
}
