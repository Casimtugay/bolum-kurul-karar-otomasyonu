using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Kurul.API.Data;

namespace Kurul.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _context;

    public NotificationsController(AppDbContext context)
    {
        _context = context;
    }

    private int? GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(claim, out var id) ? id : null;
    }

    // Bildirimler seçili kurula aittir; başka kurulun bildirimi görünmez.
    private int? GetCurrentUnitId()
    {
        var claim = User.FindFirst("unitId")?.Value;
        return int.TryParse(claim, out var id) ? id : null;
    }

    // GET: api/notifications
    [HttpGet]
    public async Task<IActionResult> GetNotifications(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var unitId = GetCurrentUnitId();
        if (unitId == null)
            return Ok(new { unreadCount = 0, items = Array.Empty<object>() });

        var query = _context.Notifications
            .AsNoTracking()
            .Where(n => n.UserId == userId.Value && n.UnitId == unitId.Value);

        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Take(20)
            .Select(n => new
            {
                id = n.Id,
                meetingId = n.MeetingId,
                announcementId = n.CustomAnnouncementId,
                decisionId = n.DecisionId,
                title = n.Title,
                message = n.Message,
                isRead = n.IsRead,
                createdAt = n.CreatedAt
            })
            .ToListAsync(ct);

        var unreadCount = await query.CountAsync(n => !n.IsRead, ct);

        return Ok(new { unreadCount, items });
    }

    // POST: api/notifications/{id}/read
    [HttpPost("{id:int}/read")]
    public async Task<IActionResult> MarkRead(int id, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var unitId = GetCurrentUnitId();
        if (unitId == null)
            return BadRequest(new { error = "Önce bir kurul seçin." });

        var item = await _context.Notifications
            .FirstOrDefaultAsync(n =>
                n.Id == id &&
                n.UserId == userId.Value &&
                n.UnitId == unitId.Value, ct);

        if (item == null)
            return NotFound(new { error = "Bildirim bulunamadı." });

        if (!item.IsRead)
        {
            item.IsRead = true;
            await _context.SaveChangesAsync(ct);
        }

        return Ok(new { success = true });
    }

    // POST: api/notifications/read-all
    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (userId == null) return Unauthorized();

        var unitId = GetCurrentUnitId();
        if (unitId == null)
            return BadRequest(new { error = "Önce bir kurul seçin." });

        var unread = await _context.Notifications
            .Where(n =>
                n.UserId == userId.Value &&
                n.UnitId == unitId.Value &&
                !n.IsRead)
            .ToListAsync(ct);

        foreach (var notif in unread)
            notif.IsRead = true;

        await _context.SaveChangesAsync(ct);

        return Ok(new { success = true, marked = unread.Count });
    }
}