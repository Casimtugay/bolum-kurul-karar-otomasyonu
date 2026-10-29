using System.Security.Claims;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

[ApiController]
[Authorize]
[Route("api/units")]
public class UnitsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _permissions;

    public UnitsController(
        AppDbContext db,
        PermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    private int? CurrentUnitId =>
        int.TryParse(User.FindFirstValue("unitId"), out var id)
        && id > 0
            ? id
            : null;

    private static object ToDto(AcademicUnit unit) => new
    {
        unit.Id,
        unit.Code,
        unit.Name,
        unit.UnitType,
        unit.ParentName,
        unit.BoardName,
        unit.TitleLine1,
        unit.TitleLine2,
        unit.MembersLabel,
        logo = unit.LogoPath
    };

    private static bool PresentationIsComplete(AcademicUnit unit) =>
        !string.IsNullOrWhiteSpace(unit.ParentName) &&
        !string.IsNullOrWhiteSpace(unit.BoardName) &&
        !string.IsNullOrWhiteSpace(unit.TitleLine1) &&
        !string.IsNullOrWhiteSpace(unit.TitleLine2) &&
        !string.IsNullOrWhiteSpace(unit.MembersLabel) &&
        !string.IsNullOrWhiteSpace(unit.LogoPath);

    private IActionResult PresentationResponse(AcademicUnit unit)
    {
        if (!PresentationIsComplete(unit))
        {
            return Conflict(new
            {
                error =
                    "Kurulun başlık veya logo bilgileri eksik. " +
                    "Sistem yöneticisine başvurun."
            });
        }

        return Ok(ToDto(unit));
    }

    // Seçili kurulun güncel ekran ve antet bilgileri.
    [HttpGet("current")]
    public async Task<IActionResult> Current(CancellationToken ct)
    {
        var unitId = CurrentUnitId;

        if (unitId == null)
        {
            return BadRequest(new
            {
                error = "Önce bir kurul seçmelisiniz."
            });
        }

        var unit = await _db.AcademicUnits
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == unitId.Value, ct);

        if (unit == null)
        {
            return NotFound(new
            {
                error = "Seçili kurul bulunamadı."
            });
        }

        return PresentationResponse(unit);
    }

    // PDF anteti, istemcinin gönderdiği kurul adına göre değil,
    // veritabanındaki kararın bağlı olduğu kurula göre belirlenir.
    [HttpGet("for-decision/{decisionId:int}")]
    public async Task<IActionResult> ForDecision(
        int decisionId,
        CancellationToken ct)
    {
        var unitId = CurrentUnitId;

        if (unitId == null)
        {
            return BadRequest(new
            {
                error = "Önce bir kurul seçmelisiniz."
            });
        }

        var decision = await _db.Decisions
            .AsNoTracking()
            .Include(x => x.AcademicUnit)
            .SingleOrDefaultAsync(
                x => x.Id == decisionId &&
                     x.AcademicUnitId == unitId.Value,
                ct);

        if (decision == null)
        {
            return NotFound(new
            {
                error = "Karar bulunamadı."
            });
        }

        var archived = decision.Status is
            DecisionStatus.Imzalandi or
            DecisionStatus.Reddedildi or
            DecisionStatus.IptalEdildi;

        var allowed =
            await _permissions.CanAsync(User, "oylama", false) ||
            (archived &&
             await _permissions.CanAsync(User, "arsiv", false));

        if (!allowed)
        {
            return StatusCode(403, new
            {
                error = "Bu kararı görüntüleme yetkiniz yok."
            });
        }

        return PresentationResponse(decision.AcademicUnit);
    }

    [HttpGet("current/members")]
    public async Task<IActionResult> Members(CancellationToken ct)
    {
        var unitId = CurrentUnitId;

        if (unitId == null)
        {
            return BadRequest(new
            {
                error = "Önce bir kurul seçmelisiniz."
            });
        }

        var allowed =
            await _permissions.CanAsync(User, "oylama", false) ||
            await _permissions.CanAsync(User, "arsiv", false);

        if (!allowed)
        {
            return StatusCode(403, new
            {
                error = "Kurul üyelerini görüntüleme yetkiniz yok."
            });
        }

        var list = await _db.UserUnits
            .AsNoTracking()
            .Where(x =>
                x.AcademicUnitId == unitId.Value &&
                x.IsBoardMember &&
                x.IsActive &&
                x.User.IsActive)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.UserId)
            .Select(x => new
            {
                x.UserId,
                x.User.Title,
                x.User.FullName,
                x.Duty,
                IsChair = x.UnitRole == UnitRoles.Baskan
            })
            .ToListAsync(ct);

        return Ok(list.Select(x => new
        {
            userId = x.UserId,
            displayName = string.IsNullOrWhiteSpace(x.Title)
                ? x.FullName
                : $"{x.Title} {x.FullName}",
            duty = x.Duty,
            isChair = x.IsChair
        }));
    }
}