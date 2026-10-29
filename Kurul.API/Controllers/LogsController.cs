using System.Globalization;
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
[Route("api/logs")]
public class LogsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _perms;

    public LogsController(
        AppDbContext db,
        PermissionService perms)
    {
        _db = db;
        _perms = perms;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        string? unit,
        string? level,
        string? user,
        string? from,
        string? to,
        int tz = 0,
        int page = 1,
        int pageSize = 25,
        long? snapshotId = null,
        CancellationToken cancellationToken = default)
    {
        if (!await _perms.CanAsync(User, Pages.Logs))
        {
            return StatusCode(403, new
            {
                error = "Log kayıtlarını görme yetkiniz yok."
            });
        }

        if (page < 1)
        {
            return BadRequest(new
            {
                error = "Sayfa numarası en az 1 olmalıdır."
            });
        }

        if (pageSize is not (10 or 25 or 50 or 100))
        {
            return BadRequest(new
            {
                error = "Sayfa boyutu 10, 25, 50 veya 100 olmalıdır."
            });
        }

        if (snapshotId < 0)
        {
            return BadRequest(new
            {
                error = "Geçersiz liste sınırı."
            });
        }

        if (tz < -840 || tz > 840)
        {
            return BadRequest(new
            {
                error = "Geçersiz saat dilimi farkı."
            });
        }

        var unitCode = unit?.Trim();
        var levelFilter = level?.Trim().ToLowerInvariant();
        var username = user?.Trim();

        if (unitCode?.Length > 50)
        {
            return BadRequest(new
            {
                error = "Kurul kodu geçersiz."
            });
        }

        if (username?.Length > 100)
        {
            return BadRequest(new
            {
                error = "Kullanıcı araması en fazla 100 karakter olabilir."
            });
        }

        if (!string.IsNullOrEmpty(levelFilter) &&
            levelFilter is not ("info" or "warn" or "error"))
        {
            return BadRequest(new
            {
                error = "Geçersiz log seviyesi."
            });
        }

        DateOnly? fromDate = null;
        DateOnly? toDate = null;

        if (!string.IsNullOrWhiteSpace(from))
        {
            if (!DateOnly.TryParseExact(
                    from,
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var parsedFrom))
            {
                return BadRequest(new
                {
                    error = "Başlangıç tarihi geçersiz."
                });
            }

            fromDate = parsedFrom;
        }

        if (!string.IsNullOrWhiteSpace(to))
        {
            if (!DateOnly.TryParseExact(
                    to,
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var parsedTo))
            {
                return BadRequest(new
                {
                    error = "Bitiş tarihi geçersiz."
                });
            }

            toDate = parsedTo;
        }

        if (fromDate.HasValue &&
            toDate.HasValue &&
            fromDate.Value > toDate.Value)
        {
            return BadRequest(new
            {
                error = "Başlangıç tarihi bitiş tarihinden sonra olamaz."
            });
        }

        var isAdmin =
            User.FindFirstValue(ClaimTypes.Role) == SystemRoles.Admin;

        var query = _db.AuditLogs.AsNoTracking();

        if (isAdmin)
        {
            if (!string.IsNullOrEmpty(unitCode) &&
                unitCode != "all")
            {
                var selectedUnitId = await _db.AcademicUnits
                    .AsNoTracking()
                    .Where(x => x.Code == unitCode)
                    .Select(x => (int?)x.Id)
                    .SingleOrDefaultAsync(cancellationToken);

                if (selectedUnitId == null)
                {
                    return NotFound(new
                    {
                        error = "Kurul bulunamadı."
                    });
                }

                query = query.Where(
                    x => x.AcademicUnitId == selectedUnitId.Value);
            }
        }
        else
        {
            if (!int.TryParse(
                    User.FindFirstValue("unitId"),
                    out var selectedUnitId) ||
                selectedUnitId <= 0)
            {
                return BadRequest(new
                {
                    error = "Önce bir kurul seçmelisiniz."
                });
            }

            // İstemcinin gönderdiği kurul filtresi yetkiyi genişletemez.
            query = query.Where(
                x => x.AcademicUnitId == selectedUnitId);
        }

        if (!string.IsNullOrEmpty(levelFilter))
        {
            query = query.Where(x => x.Level == levelFilter);
        }

        if (!string.IsNullOrEmpty(username))
        {
            query = query.Where(
                x => x.Username != null &&
                     x.Username.Contains(username));
        }

        try
        {
            // tz: yerel saatin UTC'ye göre dakika farkı.
            if (fromDate.HasValue)
            {
                var startUtc = DateTime.SpecifyKind(
                        fromDate.Value.ToDateTime(TimeOnly.MinValue),
                        DateTimeKind.Utc)
                    .AddMinutes(-tz);

                query = query.Where(x => x.CreatedAt >= startUtc);
            }

            if (toDate.HasValue)
            {
                var endUtc = DateTime.SpecifyKind(
                        toDate.Value
                            .AddDays(1)
                            .ToDateTime(TimeOnly.MinValue),
                        DateTimeKind.Utc)
                    .AddMinutes(-tz);

                query = query.Where(x => x.CreatedAt < endUtc);
            }
        }
        catch (ArgumentOutOfRangeException)
        {
            return BadRequest(new
            {
                error = "Tarih aralığı desteklenen sınırların dışında."
            });
        }

        // İlk istekte liste sınırı belirlenir.
        // Sonraki sayfalarda bu sınır kullanılarak yeni logların
        // mevcut sayfaları kaydırması engellenir.
        var upperId = snapshotId ??
            (await query.MaxAsync(
                x => (long?)x.Id,
                cancellationToken) ?? 0);

        query = query.Where(x => x.Id <= upperId);

        var total = await query.CountAsync(cancellationToken);

        var totalPages = Math.Max(
            1,
            (int)Math.Ceiling(total / (double)pageSize));

        page = Math.Min(page, totalPages);

        var rows = await query
            .OrderByDescending(x => x.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.AcademicUnitId,
                x.Level,
                x.CreatedAt,
                x.Message,
                x.Detail,
                x.Username,
                x.Ip
            })
            .ToListAsync(cancellationToken);

        var unitIds = rows
            .Where(x => x.AcademicUnitId.HasValue)
            .Select(x => x.AcademicUnitId!.Value)
            .Distinct()
            .ToArray();

        var unitNames = await _db.AcademicUnits
            .AsNoTracking()
            .Where(x => unitIds.Contains(x.Id))
            .ToDictionaryAsync(
                x => x.Id,
                x => x.BoardName,
                cancellationToken);

        var items = rows.Select(x => new
        {
            x.Id,
            x.Level,
            time = DateTime.SpecifyKind(
                x.CreatedAt,
                DateTimeKind.Utc),
            x.Message,
            x.Detail,
            x.Username,
            x.Ip,
            unitName =
                x.AcademicUnitId.HasValue &&
                unitNames.TryGetValue(
                    x.AcademicUnitId.Value,
                    out var name)
                    ? name
                    : null
        });

        return Ok(new
        {
            items,
            total,
            page,
            pageSize,
            totalPages,

            // JavaScript'te büyük long değerlerinde hassasiyet kaybolmasın.
            snapshotId = upperId.ToString(CultureInfo.InvariantCulture)
        });
    }
}