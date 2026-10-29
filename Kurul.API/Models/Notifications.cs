using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

public class Notification
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public int? UnitId { get; set; }
    public int? MeetingId { get; set; }

    // Oylamaya sunulan karar bildirimi ise ilgili karar (zil tıklanınca karar açılır).
    public int? DecisionId { get; set; }

    // Bildirimin hangi yayın sürümü için oluşturulduğu.
    // (UserId, PublicationId) tekil olduğundan aynı sürüm için ikinci bildirim yazılamaz.
    public int? PublicationId { get; set; }
    public MeetingAgendaPublication? Publication { get; set; }

    // Özel duyuru bildirimi ise ilgili duyuru ve üyenin katılım cevabı.
    public int? CustomAnnouncementId { get; set; }
    public CustomAnnouncement? CustomAnnouncement { get; set; }

    [MaxLength(20)]
    public string? AttendanceIntent { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Message { get; set; }

    public bool IsRead { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}