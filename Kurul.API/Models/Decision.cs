using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

public class Decision
{
    public int Id { get; set; }

    // PDF v2: ilk imza hazırlığında, hazırlık kaydıyla birlikte saklanır.
    public byte[]? SigningPdfBytes { get; set; }

    [System.ComponentModel.DataAnnotations.MaxLength(64)]
    public string? SigningPdfHash { get; set; }

    public DateTime? SigningPdfFrozenAt { get; set; }

    public int AcademicUnitId { get; set; }
    public AcademicUnit AcademicUnit { get; set; } = null!;

    // Eski kararlar otomatik olarak toplantılara birleştirilmez.
    // Yeni toplantı akışında oluşturulan kararlar bu bağlantıyı kullanır.
    public int? MeetingId { get; set; }
    public Meeting? Meeting { get; set; }

    public DateOnly MeetingDate { get; set; }
    public int MeetingYear { get; set; }
    public int MeetingNo { get; set; }
    public int DecisionNo { get; set; }

    public string Reference { get; set; } = string.Empty;
    public string Agenda { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string AttachmentsNote { get; set; } = string.Empty;

    public string TableColumnsJson { get; set; } = "[]";
    public string TableRowsJson { get; set; } = "[]";

    public string Status { get; set; } = DecisionStatus.Taslak;
    public string? VoteOutcome { get; set; }

    // Başkan "Oylamaya Sun" dediği an. Doluysa karar oy gelmeden de "Oylamada" görünür
    // ve metni, ekleri değiştirilemez (geri çekmek için iptal kullanılır).
    public DateTime? SubmittedAt { get; set; }

    public int CreatedById { get; set; }
    public AppUser CreatedBy { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Timestamp]
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();

    public DateTime? CancelledAt { get; set; }
    public int? CancelledById { get; set; }

    [MaxLength(300)]
    public string? CancelledByName { get; set; }

    [MaxLength(2000)]
    public string? CancellationReason { get; set; }

    public int? SourceDecisionId { get; set; }
    public int? ReconsiderationDecisionId { get; set; }

    // null: eski imza yöntemi.
    // 1: sabit içerik özetine bağlı demo imza yöntemi.
    // 2: saklanan PDF'ye ve sabit içerik özetine bağlı demo imza yöntemi.
    public int? SignatureVersion { get; set; }

    // İmza tarihleri ve imza referansları bu özete dahil değildir.
    [MaxLength(64)]
    public string? SigningContentHash { get; set; }

    public DateTime? SigningContentFrozenAt { get; set; }

    public DateTime? SignedAt { get; set; }

    // Tüm imzalar tamamlandığında hesaplanan son belge özeti.
    public string? DocumentHash { get; set; }

    public DateTime? SealedAt { get; set; }

    // PDF'deki QR ve "Belge Doğrula" sayfası için tahmin edilemez kod.
    // İmzaya esas PDF sabitlenirken üretilir ve PDF'ye basılır.
    [MaxLength(20)]
    public string? VerificationCode { get; set; }

    // Tüm imzalar tamamlandığında üretilen, sistem sertifikasıyla mühürlenmiş son PDF.
    public byte[]? FinalPdfBytes { get; set; }

    [MaxLength(64)]
    public string? FinalPdfHash { get; set; }

    public DateTime? FinalPdfSealedAt { get; set; }

    public ICollection<DecisionParticipant> Participants { get; set; } =
        new List<DecisionParticipant>();

    public ICollection<Attachment> Attachments { get; set; } =
        new List<Attachment>();
}