using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

/// <summary>
/// Kurul Başkanı'nın yayımladığı özel (toplantı gündeminden bağımsız) duyurular.
/// Alıcılar ve katılım cevapları Notification kayıtlarında tutulur.
/// </summary>
public class CustomAnnouncement
{
    public const int MaxContentLength = 4000;
    public const int MaxAgendaItems = 30;
    public const int MaxAgendaItemLength = 300;

    public int Id { get; set; }

    public int UnitId { get; set; }
    public AcademicUnit Unit { get; set; } = null!;

    public int PublishedById { get; set; }
    public AppUser PublishedBy { get; set; } = null!;

    [Required]
    [MaxLength(MaxContentLength)]
    public string Content { get; set; } = string.Empty;

    // Toplantı bilgileri (opsiyonel)
    public DateOnly? MeetingDate { get; set; }

    [MaxLength(5)]
    public string? MeetingTime { get; set; }

    [MaxLength(200)]
    public string? Location { get; set; }

    [MaxLength(500)]
    public string? OnlineLink { get; set; }

    // Gündem maddeleri JSON dizi olarak saklanır.
    public string? AgendaItemsJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<Notification> Notifications { get; set; } = new();
}
