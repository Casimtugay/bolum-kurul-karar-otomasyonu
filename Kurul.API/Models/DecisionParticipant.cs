using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

public class DecisionParticipant
{
    public int Id { get; set; }

    public int DecisionId { get; set; }
    public Decision Decision { get; set; } = null!;

    public int UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public string DisplayName { get; set; } = string.Empty;
    public string Duty { get; set; } = string.Empty;

    public int SortOrder { get; set; }
    public bool IsChair { get; set; }

    public string Attendance { get; set; } = AttendanceStatus.Katilir;

    public string? Vote { get; set; }
    public string? VoteReason { get; set; }
    public DateTime? VotedAt { get; set; }

    public DateTime? SignedAt { get; set; }
    public string? SignatureRef { get; set; }

    // Bu katılımcının onayladığı sabit içerik özeti.
    // Eski imza kayıtlarında null kalır.
    [MaxLength(64)]
    public string? SignedContentHash { get; set; }

    // Demo istemcisinin ürettiği içerik bağlantılı yanıt.
    // Gerçek sertifika imzası değildir.
    [MaxLength(64)]
    public string? SignatureData { get; set; }

    // Üyenin imza görüntüsü (şeffaf PNG); PDF'te üyenin kutusuna yerleştirilir.
    public byte[]? SignatureImagePng { get; set; }

    // Hazırlık kimliği imza tamamlandıktan sonra da saklanır.
    // Aynı tamamlama isteğinin ikinci kayıt oluşturmamasını sağlar.
    public Guid? SignatureChallengeId { get; set; }

    public DateTime? SignatureChallengeExpiresAt { get; set; }

    // Oy kullandıktan sonra, oylama tamamlanmadan verilen imza (parola + imza görüntüsü).
    // Oylama kabulle tamamlanıp imzaya esas PDF sabitlenince sistem bu imzayı karara bağlar.
    public DateTime? PreSignedAt { get; set; }
    public byte[]? PreSignatureImagePng { get; set; }
}