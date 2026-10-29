using System.Globalization;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class AnnouncementsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PermissionService _perms;
    private readonly IEmailQueue _emailQueue;
    private readonly RsvpTokenService _rsvpTokens;
    private readonly IConfiguration _config;
    private readonly ILogger<AnnouncementsController> _logger;

    public AnnouncementsController(
        AppDbContext db,
        PermissionService perms,
        IEmailQueue emailQueue,
        RsvpTokenService rsvpTokens,
        IConfiguration config,
        ILogger<AnnouncementsController> logger)
    {
        _db = db;
        _perms = perms;
        _emailQueue = emailQueue;
        _rsvpTokens = rsvpTokens;
        _config = config;
        _logger = logger;
    }

    private int? CurrentUnitId =>
        int.TryParse(User.FindFirstValue("unitId"), out var id) ? id : null;

    private int? CurrentUserId =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    // Duyuruları yönetebilen veya oylama sayfasını görebilen kullanıcı okuyabilir.
    private async Task<bool> CanReadAsync() =>
        await _perms.CanAsync(User, Pages.NewDecision, true) ||
        await _perms.CanAsync(User, Pages.Voting);

    private IActionResult Denied() =>
        StatusCode(403, new { error = "Bu sayfayı görüntüleme yetkiniz yok." });

    // GET: api/announcements
    // Seçili kurulun yayımlanmış duyuruları. İçerik, yayımlanan son sürümden okunur;
    // taslakta yapılan değişiklikler yayımlanana kadar üyeleri etkilemez.
    [HttpGet]
    public async Task<IActionResult> GetAnnouncements(CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return Ok(Array.Empty<object>());

        if (!await CanReadAsync())
            return Denied();

        var latest = await _db.MeetingAgendaPublications
            .AsNoTracking()
            .Where(p =>
                p.Meeting.AcademicUnitId == unitId &&
                p.Meeting.IsPublished &&
                p.Version == _db.MeetingAgendaPublications
                    .Where(x => x.MeetingId == p.MeetingId)
                    .Max(x => x.Version))
            .Select(p => new
            {
                p.MeetingId,
                p.Version,
                p.PublishedAt,
                PublishedBy = p.PublishedBy.FullName,
                p.ItemsJson,
                p.Meeting.MeetingYear,
                p.Meeting.MeetingNo,
                p.Meeting.MeetingDate
            })
            .ToListAsync(ct);

        var unreadMeetingIds = new HashSet<int>();

        if (CurrentUserId is int userId)
        {
            unreadMeetingIds = (await _db.Notifications
                .AsNoTracking()
                .Where(n =>
                    n.UserId == userId &&
                    n.UnitId == unitId &&
                    !n.IsRead &&
                    n.MeetingId != null)
                .Select(n => n.MeetingId!.Value)
                .Distinct()
                .ToListAsync(ct)).ToHashSet();
        }

        var result = latest
            .OrderByDescending(p => p.MeetingDate)
            .ThenByDescending(p => p.MeetingNo)
            .Select(p => new
            {
                meetingId = p.MeetingId,
                meetingYear = p.MeetingYear,
                meetingNo = p.MeetingNo,
                meetingDate = p.MeetingDate.ToString("yyyy-MM-dd"),
                publishedAt = p.PublishedAt,
                publishedBy = p.PublishedBy ?? "",
                version = p.Version,
                isRead = !unreadMeetingIds.Contains(p.MeetingId),
                agenda = AgendaSnapshot.Deserialize(p.ItemsJson)
                    .Select((a, i) => new
                    {
                        id = i + 1,
                        title = a.Title,
                        description = a.Description,
                        orderNo = i + 1
                    })
                    .ToList()
            })
            .ToList();

        return Ok(result);
    }

    // POST: api/announcements/{meetingId}/read
    // Kullanıcının kendi bildirimlerini, yalnızca seçili kurulun bu toplantısı için okundu yapar.
    [HttpPost("{meetingId:int}/read")]
    public async Task<IActionResult> MarkRead(int meetingId, CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return BadRequest(new { error = "Önce bir kurul seçin." });

        if (CurrentUserId is not int userId)
            return Unauthorized();

        if (!await CanReadAsync())
            return Denied();

        var exists = await _db.Meetings
            .AsNoTracking()
            .AnyAsync(m =>
                m.Id == meetingId &&
                m.AcademicUnitId == unitId &&
                m.IsPublished, ct);

        if (!exists)
            return NotFound(new { error = "Duyuru bulunamadı." });

        var unread = await _db.Notifications
            .Where(n =>
                n.UserId == userId &&
                n.UnitId == unitId &&
                n.MeetingId == meetingId &&
                !n.IsRead)
            .ToListAsync(ct);

        foreach (var n in unread)
            n.IsRead = true;

        await _db.SaveChangesAsync(ct);

        return Ok(new { success = true, marked = unread.Count });
    }


    /* ------------------------------------------------------------------ */
    /* Kurul Başkanı'nın özel duyuruları ve katılım cevapları             */
    /* ------------------------------------------------------------------ */

    // Özel duyuruyu yalnızca seçili kurulun Başkanı (veya sistem yöneticisi) yönetir.
    private bool CanManageCustom()
    {
        var unitRole = User.FindFirstValue("unitRole");
        return unitRole == UnitRoles.Baskan || unitRole == SystemRoles.Admin;
    }

    public record CustomAnnouncementRequest(
        string? Content,
        string? MeetingDate,
        string? MeetingTime,
        string? Location,
        string? OnlineLink,
        List<string>? AgendaItems,
        List<int>? RecipientIds);

    // POST: api/announcements/custom-publish
    // Kurul her zaman token'daki seçili kuruldur; istemciden kurul bilgisi alınmaz.
    [HttpPost("custom-publish")]
    public async Task<IActionResult> CustomPublish(
        [FromBody] CustomAnnouncementRequest req,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return BadRequest(new { error = "Önce bir kurul seçin." });

        if (CurrentUserId is not int userId)
            return Unauthorized();

        if (!CanManageCustom())
            return StatusCode(403, new { error = "Bu işlem yalnızca Kurul Başkanı tarafından yapılabilir." });

        var content = req.Content?.Trim() ?? "";
        if (content.Length == 0)
            return BadRequest(new { error = "Duyuru metni boş olamaz." });
        if (content.Length > CustomAnnouncement.MaxContentLength)
            return BadRequest(new { error = $"Duyuru metni en fazla {CustomAnnouncement.MaxContentLength} karakter olabilir." });

        DateOnly? meetingDate = null;
        if (!string.IsNullOrWhiteSpace(req.MeetingDate))
        {
            if (!DateOnly.TryParseExact(req.MeetingDate.Trim(), "yyyy-MM-dd",
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
                return BadRequest(new { error = "Toplantı tarihi geçersiz." });
            meetingDate = parsedDate;
        }

        string? meetingTime = null;
        if (!string.IsNullOrWhiteSpace(req.MeetingTime))
        {
            if (!TimeOnly.TryParseExact(req.MeetingTime.Trim(), "HH:mm",
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedTime))
                return BadRequest(new { error = "Toplantı saati SS:dd biçiminde olmalıdır." });
            meetingTime = parsedTime.ToString("HH:mm", CultureInfo.InvariantCulture);
        }

        var location = NullIfEmpty(req.Location);
        if (location?.Length > 200)
            return BadRequest(new { error = "Toplantı yeri en fazla 200 karakter olabilir." });

        var onlineLink = NullIfEmpty(req.OnlineLink);
        if (onlineLink != null &&
            (onlineLink.Length > 500 ||
             !Uri.TryCreate(onlineLink, UriKind.Absolute, out var linkUri) ||
             (linkUri.Scheme != Uri.UriSchemeHttps && linkUri.Scheme != Uri.UriSchemeHttp)))
            return BadRequest(new { error = "Çevrimiçi bağlantı http:// veya https:// ile başlayan geçerli bir adres olmalıdır." });

        var agendaItems = (req.AgendaItems ?? new List<string>())
            .Select(i => i?.Trim() ?? "")
            .Where(i => i.Length > 0)
            .ToList();
        if (agendaItems.Count > CustomAnnouncement.MaxAgendaItems)
            return BadRequest(new { error = $"En fazla {CustomAnnouncement.MaxAgendaItems} gündem maddesi eklenebilir." });
        if (agendaItems.Any(i => i.Length > CustomAnnouncement.MaxAgendaItemLength))
            return BadRequest(new { error = $"Gündem maddeleri en fazla {CustomAnnouncement.MaxAgendaItemLength} karakter olabilir." });

        var members = await _db.UserUnits
            .AsNoTracking()
            .Where(u =>
                u.AcademicUnitId == unitId &&
                u.IsActive &&
                u.IsBoardMember &&
                u.User.IsActive)
            .Select(u => new { u.UserId, u.User.Email })
            .ToListAsync(ct);

        var recipients = members;
        if (req.RecipientIds is { Count: > 0 } ids)
        {
            var memberIds = members.Select(m => m.UserId).ToHashSet();
            if (ids.Any(id => !memberIds.Contains(id)))
                return BadRequest(new { error = "Seçilen alıcılardan bazıları bu kurulun aktif üyesi değil. Listeyi yenileyip tekrar deneyin." });

            var selected = ids.ToHashSet();
            recipients = members.Where(m => selected.Contains(m.UserId)).ToList();
        }

        if (recipients.Count == 0)
            return BadRequest(new { error = "Duyuruyu alacak aktif kurul üyesi bulunamadı." });

        var announcement = new CustomAnnouncement
        {
            UnitId = unitId,
            PublishedById = userId,
            Content = content,
            MeetingDate = meetingDate,
            MeetingTime = meetingTime,
            Location = location,
            OnlineLink = onlineLink,
            AgendaItemsJson = agendaItems.Count > 0 ? JsonSerializer.Serialize(agendaItems) : null,
            CreatedAt = DateTime.UtcNow
        };

        // Duyuru ve bildirimler tek SaveChanges ile birlikte kaydedilir.
        var message = content.Length > 200 ? content[..200] + "…" : content;
        foreach (var r in recipients)
        {
            announcement.Notifications.Add(new Notification
            {
                UserId = r.UserId,
                UnitId = unitId,
                Title = "Kurul Duyurusu",
                Message = message,
                AttendanceIntent = AnnouncementAttendance.Belirsiz,
                CreatedAt = announcement.CreatedAt
            });
        }

        _db.CustomAnnouncements.Add(announcement);
        await _db.SaveChangesAsync(ct);

        // Varsayılan olarak yalnızca kurumsal (.edu.tr) adreslere e-posta gönderilir;
        // geliştirmede Announcements:EmailDomain boş bırakılarak her alan adına açılır.
        // Her üye, girişsiz cevap verebilmesi için kendine özel bağlantılı ayrı e-posta alır.
        var emailDomain = EmailAddressPolicy.RequiredSuffix(_config);
        var emailById = recipients.ToDictionary(r => r.UserId, r => r.Email?.Trim() ?? "");
        var mails = announcement.Notifications
            .Select(n => (Email: emailById[n.UserId], NotificationId: n.Id))
            .Where(m => EmailAddressPolicy.IsDeliverable(m.Email, emailDomain))
            .DistinctBy(m => m.Email, StringComparer.OrdinalIgnoreCase)
            .ToList();

        string? emailWarning = null;
        var emailCount = 0;

        if (mails.Count > 0 && !_emailQueue.IsConfigured)
        {
            emailWarning = "E-posta sunucusu yapılandırılmadığı için e-posta gönderilmedi.";
        }
        else if (mails.Count > 0)
        {
            var baseUrl = DecisionVerification.PublicBaseUrl(_config);
            foreach (var m in mails)
            {
                var html = BuildAnnouncementHtml(
                    announcement, agendaItems, baseUrl, _rsvpTokens.Create(m.NotificationId));
                _emailQueue.Enqueue(new OutgoingEmail(m.Email, "Kurul Duyurusu", html));
            }
            emailCount = mails.Count;
        }

        return Ok(new
        {
            success = true,
            announcementId = announcement.Id,
            recipientCount = recipients.Count,
            emailCount,
            emailWarning,
            message = emailCount > 0
                ? $"Duyuru {recipients.Count} üyeye yayımlandı; {emailCount} adrese e-posta gönderiliyor."
                : $"Duyuru {recipients.Count} üyeye sistem içinde yayımlandı."
        });
    }

    // POST: api/announcements/{announcementId}/attendance
    // Üye yalnızca kendisine gönderilmiş, seçili kurula ait duyuruya cevap verebilir.
    public record AttendanceRequest(string? Intent);

    [HttpPost("{announcementId:int}/attendance")]
    public async Task<IActionResult> UpdateAttendance(
        int announcementId,
        [FromBody] AttendanceRequest req,
        CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return BadRequest(new { error = "Önce bir kurul seçin." });

        if (CurrentUserId is not int userId)
            return Unauthorized();

        if (req.Intent != AnnouncementAttendance.Katilacak &&
            req.Intent != AnnouncementAttendance.Katilmayacak)
            return BadRequest(new { error = "Katılım durumu Katilacak veya Katilmayacak olmalıdır." });

        var notification = await _db.Notifications
            .FirstOrDefaultAsync(n =>
                n.UserId == userId &&
                n.UnitId == unitId &&
                n.CustomAnnouncementId == announcementId,
                ct);

        if (notification == null)
            return NotFound(new { error = "Bu duyuru size gönderilmemiş veya bulunamadı." });

        notification.AttendanceIntent = req.Intent;
        notification.IsRead = true;
        await _db.SaveChangesAsync(ct);

        return Ok(new { success = true, intent = req.Intent });
    }

    // POST: api/announcements/custom/{announcementId}/read
    [HttpPost("custom/{announcementId:int}/read")]
    public async Task<IActionResult> MarkCustomRead(int announcementId, CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return BadRequest(new { error = "Önce bir kurul seçin." });

        if (CurrentUserId is not int userId)
            return Unauthorized();

        var notification = await _db.Notifications
            .FirstOrDefaultAsync(n =>
                n.UserId == userId &&
                n.UnitId == unitId &&
                n.CustomAnnouncementId == announcementId,
                ct);

        if (notification == null)
            return NotFound(new { error = "Duyuru bulunamadı." });

        notification.IsRead = true;
        await _db.SaveChangesAsync(ct);

        return Ok(new { success = true });
    }

    // GET: api/announcements/custom
    // Üye kendisine gönderilen duyuruları ve kendi cevabını görür.
    // Başkan kurulun tüm özel duyurularını, katılım sayılarını ve kişi bazında cevapları görür.
    [HttpGet("custom")]
    public async Task<IActionResult> GetCustomAnnouncements(CancellationToken ct)
    {
        if (CurrentUnitId is not int unitId)
            return Ok(Array.Empty<object>());

        if (CurrentUserId is not int userId)
            return Unauthorized();

        if (!await CanReadAsync())
            return Denied();

        var manage = CanManageCustom();

        var rows = await _db.CustomAnnouncements
            .AsNoTracking()
            .Where(a =>
                a.UnitId == unitId &&
                (manage || a.Notifications.Any(n => n.UserId == userId)))
            .OrderByDescending(a => a.CreatedAt)
            .Take(100)
            .Select(a => new
            {
                a.Id,
                a.Content,
                a.MeetingDate,
                a.MeetingTime,
                a.Location,
                a.OnlineLink,
                a.AgendaItemsJson,
                a.CreatedAt,
                PublishedBy = a.PublishedBy.FullName,
                Mine = a.Notifications
                    .Where(n => n.UserId == userId)
                    .Select(n => new { n.AttendanceIntent, n.IsRead })
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        // Kişi bazında cevaplar yalnızca Başkan'a gösterilir.
        var responses = new Dictionary<int, List<(string Name, string? Intent)>>();
        if (manage && rows.Count > 0)
        {
            var ids = rows.Select(r => r.Id).ToList();
            var list = await _db.Notifications
                .AsNoTracking()
                .Where(n => n.CustomAnnouncementId != null && ids.Contains(n.CustomAnnouncementId.Value))
                .OrderBy(n => n.User.FullName)
                .Select(n => new
                {
                    AnnouncementId = n.CustomAnnouncementId!.Value,
                    n.User.Title,
                    n.User.FullName,
                    n.AttendanceIntent
                })
                .ToListAsync(ct);

            responses = list
                .GroupBy(n => n.AnnouncementId)
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(n => (
                        string.IsNullOrWhiteSpace(n.Title) ? n.FullName : $"{n.Title} {n.FullName}",
                        n.AttendanceIntent)).ToList());
        }

        var result = rows.Select(a =>
        {
            var answers = manage ? responses.GetValueOrDefault(a.Id) ?? new() : null;
            return new
            {
            id = a.Id,
            content = a.Content,
            meetingDate = a.MeetingDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            meetingTime = a.MeetingTime,
            location = a.Location,
            onlineLink = a.OnlineLink,
            agendaItems = DeserializeAgendaItems(a.AgendaItemsJson),
            createdAt = a.CreatedAt,
            publishedBy = a.PublishedBy,
            isRecipient = a.Mine != null,
            isRead = a.Mine?.IsRead ?? true,
            myIntent = a.Mine?.AttendanceIntent ?? AnnouncementAttendance.Belirsiz,
            stats = answers == null ? null : new
            {
                total = answers.Count,
                katilacak = answers.Count(r => r.Intent == AnnouncementAttendance.Katilacak),
                katilmayacak = answers.Count(r => r.Intent == AnnouncementAttendance.Katilmayacak),
                belirsiz = answers.Count(r =>
                    r.Intent != AnnouncementAttendance.Katilacak &&
                    r.Intent != AnnouncementAttendance.Katilmayacak),
                details = answers.Select(r => new
                {
                    fullName = r.Name,
                    intent = r.Intent ?? AnnouncementAttendance.Belirsiz
                })
            }
            };
        });

        return Ok(result);
    }

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string BuildAnnouncementHtml(
        CustomAnnouncement a,
        IReadOnlyList<string> agendaItems,
        string baseUrl,
        string rsvpToken)
    {
        static string E(string? s) => WebUtility.HtmlEncode(s ?? "");

        var sb = new StringBuilder();
        sb.Append("<!DOCTYPE html><html><head><meta charset='utf-8'/></head>");
        sb.Append("<body style='font-family:Segoe UI,Arial,sans-serif;background:#f4f6fb;padding:32px'>");
        sb.Append("<div style='max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0'>");
        sb.Append("<h2 style='color:#1e3a5f;margin:0 0 16px'>Kurul Duyurusu</h2>");
        sb.Append("<hr style='border:none;border-top:2px solid #2563eb;margin:0 0 20px'/>");
        sb.Append($"<p style='color:#334155;font-size:15px;line-height:1.6;white-space:pre-line'>{E(a.Content)}</p>");

        if (a.MeetingDate != null || a.Location != null || a.OnlineLink != null)
        {
            sb.Append("<table style='width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc'>");
            sb.Append("<tr><td colspan='2' style='padding:12px;font-weight:700;color:#1e3a5f;border-bottom:1px solid #e2e8f0'>Toplantı Bilgileri</td></tr>");

            if (a.MeetingDate is DateOnly date)
            {
                var when = date.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture) +
                           (a.MeetingTime != null ? $" {a.MeetingTime}" : "");
                sb.Append($"<tr><td style='padding:8px 12px;color:#64748b;width:120px'>Tarih:</td><td style='padding:8px 12px;color:#334155'>{E(when)}</td></tr>");
            }

            if (a.Location != null)
                sb.Append($"<tr><td style='padding:8px 12px;color:#64748b'>Yer:</td><td style='padding:8px 12px;color:#334155'>{E(a.Location)}</td></tr>");

            // Bağlantı yayımlamada http/https olarak doğrulandı.
            if (a.OnlineLink != null)
                sb.Append($"<tr><td style='padding:8px 12px;color:#64748b'>Çevrimiçi:</td><td style='padding:8px 12px'><a href='{E(a.OnlineLink)}' style='color:#2563eb'>{E(a.OnlineLink)}</a></td></tr>");

            sb.Append("</table>");
        }

        if (agendaItems.Count > 0)
        {
            sb.Append("<h3 style='color:#1e3a5f;margin:16px 0 8px'>Gündem Maddeleri</h3>");
            sb.Append("<ol style='color:#334155;padding-left:20px;margin:0'>");
            foreach (var item in agendaItems)
                sb.Append($"<li style='margin-bottom:6px'>{E(item)}</li>");
            sb.Append("</ol>");
        }

        // Kişiye özel bağlantı: tıklamak cevabı giriş yapmadan kaydeder (RsvpController).
        if (!string.IsNullOrEmpty(baseUrl))
        {
            var link = $"{baseUrl}/katilim/{Uri.EscapeDataString(rsvpToken)}?yanit=";
            sb.Append("<hr style='border:none;border-top:1px solid #e2e8f0;margin:24px 0'/>");
            sb.Append("<p style='color:#64748b;font-size:13px;margin:0 0 12px'>Katılım durumunuzu tek tıkla bildirin (giriş gerekmez):</p>");
            sb.Append("<div style='text-align:center'>");
            sb.Append($"<a href='{E(link)}Katilacak' style='display:inline-block;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;margin:0 8px'>Katılıyorum</a>");
            sb.Append($"<a href='{E(link)}Katilmayacak' style='display:inline-block;padding:12px 28px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;margin:0 8px'>Katılamayacağım</a>");
            sb.Append("</div>");
        }

        sb.Append("<p style='color:#94a3b8;font-size:11px;margin:20px 0 0;text-align:center'>Bu e-posta Kurul Otomasyon Sistemi tarafından otomatik gönderilmiştir.</p>");
        sb.Append("</div></body></html>");
        return sb.ToString();
    }

    private List<string> DeserializeAgendaItems(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<string>();

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Özel duyuru gündem verisi okunamadı.");
            return new List<string>();
        }
    }
}
