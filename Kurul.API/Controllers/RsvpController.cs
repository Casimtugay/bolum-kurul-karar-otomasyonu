using System.Globalization;
using System.Text.Json;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

// E-postadaki kişiye özel bağlantıyla, giriş yapmadan katılım cevabı.
// Anahtar yalnızca kendi bildiriminin katılım cevabını okur/değiştirir;
// başka hiçbir kurul verisine erişim vermez.
[AllowAnonymous]
[ApiController]
[Route("api/rsvp")]
[EnableRateLimiting("rsvp")]
public class RsvpController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly RsvpTokenService _tokens;

    public RsvpController(AppDbContext db, RsvpTokenService tokens)
    {
        _db = db;
        _tokens = tokens;
    }

    public record RsvpRequest(string? Intent);

    // GET: api/rsvp/{token}
    [HttpGet("{token}")]
    public async Task<IActionResult> Get(string token, CancellationToken ct)
    {
        var notification = await FindAsync(token, ct);
        if (notification == null)
            return InvalidLink();

        return Ok(await DescribeAsync(notification, ct));
    }

    // POST: api/rsvp/{token}   { "intent": "Katilacak" | "Katilmayacak" }
    [HttpPost("{token}")]
    public async Task<IActionResult> Answer(string token, [FromBody] RsvpRequest req, CancellationToken ct)
    {
        if (req.Intent != AnnouncementAttendance.Katilacak &&
            req.Intent != AnnouncementAttendance.Katilmayacak)
            return BadRequest(new { error = "Katılım durumu Katilacak veya Katilmayacak olmalıdır." });

        var notification = await FindAsync(token, ct);
        if (notification == null)
            return InvalidLink();

        notification.AttendanceIntent = req.Intent;
        notification.IsRead = true;
        await _db.SaveChangesAsync(ct);

        return Ok(await DescribeAsync(notification, ct));
    }

    private IActionResult InvalidLink() =>
        NotFound(new { error = "Bağlantı geçersiz veya duyuru artık mevcut değil." });

    private async Task<Notification?> FindAsync(string token, CancellationToken ct)
    {
        if (!_tokens.TryRead(token, out var notificationId))
            return null;

        // Pasif üye veya pasif hesap cevap veremez.
        return await _db.Notifications
            .Where(n =>
                n.Id == notificationId &&
                n.CustomAnnouncementId != null &&
                n.User.IsActive &&
                _db.UserUnits.Any(m =>
                    m.UserId == n.UserId &&
                    m.AcademicUnitId == n.UnitId &&
                    m.IsActive))
            .SingleOrDefaultAsync(ct);
    }

    private async Task<object> DescribeAsync(Notification n, CancellationToken ct)
    {
        var info = await _db.CustomAnnouncements
            .AsNoTracking()
            .Where(a => a.Id == n.CustomAnnouncementId)
            .Select(a => new
            {
                a.Content,
                a.MeetingDate,
                a.MeetingTime,
                a.Location,
                a.OnlineLink,
                a.AgendaItemsJson,
                BoardName = a.Unit.BoardName,
                PublishedBy = a.PublishedBy.FullName
            })
            .SingleAsync(ct);

        var member = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == n.UserId)
            .Select(u => string.IsNullOrWhiteSpace(u.Title) ? u.FullName : u.Title + " " + u.FullName)
            .SingleAsync(ct);

        List<string> agenda;
        try
        {
            agenda = string.IsNullOrWhiteSpace(info.AgendaItemsJson)
                ? new List<string>()
                : JsonSerializer.Deserialize<List<string>>(info.AgendaItemsJson) ?? new List<string>();
        }
        catch (JsonException)
        {
            agenda = new List<string>();
        }

        return new
        {
            memberName = member,
            boardName = info.BoardName,
            publishedBy = info.PublishedBy,
            content = info.Content,
            meetingDate = info.MeetingDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            meetingTime = info.MeetingTime,
            location = info.Location,
            onlineLink = info.OnlineLink,
            agendaItems = agenda,
            intent = n.AttendanceIntent ?? AnnouncementAttendance.Belirsiz
        };
    }
}
