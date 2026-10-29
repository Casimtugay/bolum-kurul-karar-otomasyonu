using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

// Bir kurulun toplantısı.
// Toplantıya bağlı kararların ortak tarih, numara ve katılım kaynağıdır.
public class Meeting
{
    public int Id { get; set; }

    public int AcademicUnitId { get; set; }
    public AcademicUnit AcademicUnit { get; set; } = null!;

    public DateOnly MeetingDate { get; set; }
    public int MeetingYear { get; set; }
    public int MeetingNo { get; set; }

    // Karar silinse bile kullanılan karar numarası tekrar verilmez.
    // Yeni karar eklenirken aynı transaction içinde artırılır.
    public int LastDecisionNo { get; set; }

    public int CreatedById { get; set; }
    public AppUser CreatedBy { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Toplantıdaki ilk başarılı oyla birlikte doldurulur.
    // Sonrasında toplantı tarihi ve katılım listesi değiştirilemez.
    // Karar iptal edilse veya silinse bile bu kilit kaldırılmaz.
    public DateTime? AttendanceLockedAt { get; set; }

    // --- YENİ EKLENEN DUYURU ALANLARI ---
    public bool IsPublished { get; set; } = false;
    public DateTime? PublishedAt { get; set; }

    [Timestamp]
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();

    public ICollection<MeetingParticipant> Participants { get; set; } =
        new List<MeetingParticipant>();

    public ICollection<Decision> Decisions { get; set; } =
        new List<Decision>();

    // Toplantıya bağlı gündem maddeleri
    public ICollection<MeetingAgenda> Agendas { get; set; } =
        new List<MeetingAgenda>();
}