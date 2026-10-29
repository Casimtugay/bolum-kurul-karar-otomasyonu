using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

// Yayımlanan gündemin değişmez sürümü.
// Taslak (MeetingAgendas) sonradan değişse de üyelerin gördüğü duyuru bu kayıttan okunur.
public class MeetingAgendaPublication
{
    public int Id { get; set; }

    public int MeetingId { get; set; }
    public Meeting Meeting { get; set; } = null!;

    // Toplantı içinde 1'den başlayan sürüm numarası.
    public int Version { get; set; }

    // Yayımlanan maddelerin SHA-256 özeti. Aynı içerik ikinci kez yayımlanamaz.
    [Required]
    [MaxLength(64)]
    public string ContentHash { get; set; } = string.Empty;

    // [{ "title": "...", "description": "..." }, ...]
    [Required]
    public string ItemsJson { get; set; } = "[]";

    public int PublishedById { get; set; }
    public AppUser PublishedBy { get; set; } = null!;

    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;
}