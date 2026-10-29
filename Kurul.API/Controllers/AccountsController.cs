using System.Data;
using System.Security.Claims;
using Kurul.API.Data;
using Kurul.API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

[ApiController]
[Authorize]
[Route("api/admin/accounts")]
public class AccountsController : ControllerBase
{
    private readonly AppDbContext _db;

    public AccountsController(AppDbContext db)
    {
        _db = db;
    }

    public record DeleteAccountRequest(string Username);

    private async Task<(AppUser? Actor, IActionResult? Error)> GuardAsync()
    {
        if (!int.TryParse(
                User.FindFirstValue(ClaimTypes.NameIdentifier),
                out var currentUserId))
        {
            return (null, Unauthorized(new
            {
                error = "Oturum geçersiz. Tekrar giriş yapın."
            }));
        }

        var actor = await _db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == currentUserId &&
                x.IsActive);

        if (actor == null)
        {
            return (null, Unauthorized(new
            {
                error = "Oturum geçersiz. Tekrar giriş yapın."
            }));
        }

        if (actor.Role != SystemRoles.Admin)
        {
            return (null, StatusCode(403, new
            {
                error = "Bu işlem yalnızca sistem yöneticisine açıktır."
            }));
        }

        return (actor, null);
    }

    private static string? DeleteReason(
        bool isSelf,
        bool isAdmin,
        bool hasMembership,
        bool hasDecision,
        bool hasParticipation,
        bool hasAttachment)
    {
        if (isSelf)
            return "Kendi hesabınızı silemezsiniz.";

        if (isAdmin)
            return "Sistem yöneticisi hesabı bu ekrandan silinemez.";

        if (hasMembership)
            return "Aktif kurul üyeliği var. Önce ilgili kurullardan çıkarın.";

        if (hasDecision)
            return "Karar oluşturmuş bir hesap silinemez. Hesabı pasife alabilirsiniz.";

        if (hasParticipation)
            return "Karar katılımcısı olarak kayıtlı. Geçmiş kayıtları korumak için silinemez.";

        if (hasAttachment)
            return "Dosya yükleme kaydı var. Hesabı pasife alabilirsiniz.";

        return null;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] string status = "all",
        [FromQuery] int page = 1,
        CancellationToken cancellationToken = default)
    {
        var (actor, error) = await GuardAsync();
        if (actor == null)
            return error!;

        var term = (search ?? "").Trim();
        status = (status ?? "all").Trim().ToLowerInvariant();

        if (term.Length > 100)
        {
            return BadRequest(new
            {
                error = "Arama metni en fazla 100 karakter olabilir."
            });
        }

        if (status is not ("all" or "active" or "inactive"))
        {
            return BadRequest(new
            {
                error = "Geçersiz hesap durumu filtresi."
            });
        }

        if (page < 1)
        {
            return BadRequest(new
            {
                error = "Sayfa numarası en az 1 olmalıdır."
            });
        }

        const int pageSize = 20;

        var query = _db.Users.AsNoTracking();

        if (term.Length > 0)
        {
            query = query.Where(x =>
                x.Username.Contains(term) ||
                x.FullName.Contains(term) ||
                x.Email.Contains(term));
        }

        if (status == "active")
            query = query.Where(x => x.IsActive);
        else if (status == "inactive")
            query = query.Where(x => !x.IsActive);

        var total = await query.CountAsync(cancellationToken);

        var totalPages = Math.Max(
            1,
            (int)Math.Ceiling(total / (double)pageSize));

        page = Math.Min(page, totalPages);

        var users = await query
            .OrderBy(x => x.FullName)
            .ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.FullName,
                x.Username,
                x.Email,
                x.Role,
                x.IsActive,

                HasMembership = _db.UserUnits.Any(m =>
                    m.UserId == x.Id && m.IsActive),

                HasDecision = _db.Decisions.Any(d =>
                    d.CreatedById == x.Id),

                HasParticipation = _db.DecisionParticipants.Any(p =>
                    p.UserId == x.Id),

                HasAttachment = _db.Attachments.Any(a =>
                    a.UploadedById == x.Id)
            })
            .ToListAsync(cancellationToken);

        var userIds = users.Select(x => x.Id).ToArray();

        var memberships = await _db.UserUnits
            .AsNoTracking()
            .Where(x =>
                userIds.Contains(x.UserId) &&
                x.IsActive)
            .OrderBy(x => x.AcademicUnit.BoardName)
            .Select(x => new
            {
                x.UserId,
                code = x.AcademicUnit.Code,
                boardName = x.AcademicUnit.BoardName,
                duty = x.Duty
            })
            .ToListAsync(cancellationToken);

        var membershipsByUser = memberships.ToLookup(x => x.UserId);

        var items = users.Select(x =>
        {
            var reason = DeleteReason(
                x.Id == actor.Id,
                x.Role == SystemRoles.Admin,
                x.HasMembership,
                x.HasDecision,
                x.HasParticipation,
                x.HasAttachment);

            return new
            {
                userId = x.Id,
                title = x.Title,
                fullName = x.FullName,
                username = x.Username,
                email = x.Email,
                systemRole = x.Role,
                isActive = x.IsActive,
                isSelf = x.Id == actor.Id,

                canChangeStatus =
                    x.Id != actor.Id &&
                    x.Role != SystemRoles.Admin,

                canDelete = reason == null,
                deleteBlockedReason = reason,

                memberships = membershipsByUser[x.Id].Select(m => new
                {
                    m.code,
                    m.boardName,
                    m.duty
                }).ToList()
            };
        }).ToList();

        return Ok(new
        {
            items,
            total,
            page,
            pageSize,
            totalPages
        });
    }

    [HttpPost("{userId:int}/deactivate")]
    public Task<IActionResult> Deactivate(int userId) =>
        SetActiveAsync(userId, false);

    [HttpPost("{userId:int}/activate")]
    public Task<IActionResult> Activate(int userId) =>
        SetActiveAsync(userId, true);

    private async Task<IActionResult> SetActiveAsync(
        int userId,
        bool active)
    {
        var (actor, error) = await GuardAsync();
        if (actor == null)
            return error!;

        if (userId == actor.Id)
        {
            return BadRequest(new
            {
                error = "Kendi hesabınızın durumunu bu ekrandan değiştiremezsiniz."
            });
        }

        var target = await _db.Users
            .FirstOrDefaultAsync(x => x.Id == userId);

        if (target == null)
        {
            return NotFound(new
            {
                error = "Kullanıcı bulunamadı."
            });
        }

        if (target.Role == SystemRoles.Admin)
        {
            return BadRequest(new
            {
                error = "Sistem yöneticisi hesabının durumu bu işlemle değiştirilemez."
            });
        }

        if (target.IsActive == active)
            return Ok(new { ok = true, isActive = active });

        target.IsActive = active;

        // SessionStampInterceptor eski oturumları geçersiz kılar.
        _db.AuditLogs.Add(new AuditLog
        {
            UserId = actor.Id,
            Username = actor.Username,
            Level = "info",
            Message = active
                ? $"Kullanıcı hesabı aktifleştirildi: {target.Username}"
                : $"Kullanıcı hesabı pasife alındı: {target.Username}",
            Detail = $"Hedef kullanıcı ID: {target.Id}",
            Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
        });

        await _db.SaveChangesAsync();

        return Ok(new { ok = true, isActive = active });
    }

    [HttpDelete("{userId:int}")]
    public async Task<IActionResult> Delete(
        int userId,
        [FromBody] DeleteAccountRequest req,
        CancellationToken cancellationToken)
    {
        try
        {
            // Kontrol ile silme arasındaki eşzamanlı değişiklikleri sınırlar.
            await using var transaction =
                await _db.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable,
                    cancellationToken);

            var (actor, error) = await GuardAsync();
            if (actor == null)
                return error!;

            var target = await _db.Users
                .FirstOrDefaultAsync(
                    x => x.Id == userId,
                    cancellationToken);

            if (target == null)
            {
                return NotFound(new
                {
                    error = "Kullanıcı bulunamadı. Listeyi yenileyin."
                });
            }

            var hasMembership = await _db.UserUnits.AnyAsync(
                x => x.UserId == userId && x.IsActive,
                cancellationToken);

            var hasDecision = await _db.Decisions.AnyAsync(
                x => x.CreatedById == userId,
                cancellationToken);

            var hasParticipation = await _db.DecisionParticipants.AnyAsync(
                x => x.UserId == userId,
                cancellationToken);

            var hasAttachment = await _db.Attachments.AnyAsync(
                x => x.UploadedById == userId,
                cancellationToken);

            var reason = DeleteReason(
                target.Id == actor.Id,
                target.Role == SystemRoles.Admin,
                hasMembership,
                hasDecision,
                hasParticipation,
                hasAttachment);

            if (reason != null)
            {
                return StatusCode(409, new
                {
                    error = reason
                });
            }

            if (!string.Equals(
                    req.Username?.Trim(),
                    target.Username,
                    StringComparison.Ordinal))
            {
                return BadRequest(new
                {
                    error = "Silme onayı için kullanıcı adını aynen yazın."
                });
            }

            // Sadece kapatılmış kurul üyeliklerini kaldır.
            var inactiveMemberships = await _db.UserUnits
                .Where(x => x.UserId == userId && !x.IsActive)
                .ToListAsync(cancellationToken);

            _db.UserUnits.RemoveRange(inactiveMemberships);

            // Logun UserId'si işlemi yapan admindir.
            // Silinen hesabın kimliği açıklamada tutulur.
            _db.AuditLogs.Add(new AuditLog
            {
                UserId = actor.Id,
                Username = actor.Username,
                Level = "info",
                Message = $"Kullanıcı hesabı kalıcı silindi: {target.Username}",
                Detail =
                    $"Silinen kullanıcı ID: {target.Id}; " +
                    $"Ad soyad: {target.FullName}; " +
                    $"Kaldırılan pasif üyelik sayısı: {inactiveMemberships.Count}",
                Ip = HttpContext.Connection.RemoteIpAddress?.ToString()
            });

            // Eski AuditLog kayıtları silinmez veya değiştirilmez.
            _db.Users.Remove(target);

            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Ok(new { ok = true });
        }
        catch (DbUpdateConcurrencyException)
        {
            return StatusCode(409, new
            {
                error = "Hesap başka bir işlem sırasında değişti. Listeyi yenileyin."
            });
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is SqlException { Number: 547 })
        {
            return StatusCode(409, new
            {
                error = "Hesabın bağlı kayıtları var. Silinmedi; hesabı pasife alabilirsiniz."
            });
        }
        catch (DbUpdateException ex)
            when (ex.InnerException is SqlException { Number: 1205 })
        {
            return StatusCode(409, new
            {
                error = "Eşzamanlı bir işlem nedeniyle silme tamamlanamadı. Listeyi yenileyip tekrar deneyin."
            });
        }
        catch (SqlException ex) when (ex.Number == 1205)
        {
            return StatusCode(409, new
            {
                error = "Eşzamanlı bir işlem nedeniyle silme tamamlanamadı. Listeyi yenileyip tekrar deneyin."
            });
        }
    }
}