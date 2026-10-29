using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Kurul.API.Models;

namespace Kurul.API.Services;

public record SignatureResult(
    bool Ok,
    string? Error,
    string? Reference,
    DateTime SignedAt);

public record SignaturePreparation(
    string Scheme,
    int DecisionId,
    int UserId,
    Guid ChallengeId,
    string ContentHash,
    DateTime ExpiresAt,
    string Payload);

// Password: imzalarken tekrar sorulan hesap parolası.
// SignatureImage: "data:image/png;base64,..." biçiminde imza görüntüsü.
// SaveSignature: görüntü profilde kayıtlı imza olarak da saklansın mı.
public record SignatureCompletion(
    Guid ChallengeId,
    string ContentHash,
    string SignatureData,
    string? Password = null,
    string? SignatureImage = null,
    bool SaveSignature = false);

public interface ISignatureService
{
    Task<SignaturePreparation> PrepareAsync(
        Decision decision,
        DecisionParticipant participant,
        CancellationToken ct = default);

    Task<SignatureResult> CompleteAsync(
        Decision decision,
        DecisionParticipant participant,
        SignatureCompletion completion,
        CancellationToken ct = default);

    // Eski çağrıların sessizce yeni akışı atlamasını engeller.
    Task<SignatureResult> SignAsync(
        Decision decision,
        DecisionParticipant participant,
        string credential,
        CancellationToken ct = default);
}

// Bu sınıf sertifikalı e-imza üretmez.
// Demo istemci yanıtı, kullanıcı/karar/hazırlık/içerik bağlantısını sınar.
// Kullanıcı yetkilendirmesi API'nin JWT kontrolleriyle yapılır.
public class DemoSignatureService : ISignatureService
{
    public const string Scheme = "DEMO-SHA256-V1";

    public static string CreatePayload(
        int decisionId,
        int userId,
        Guid challengeId,
        string contentHash)
    {
        return string.Join("\n",
            Scheme,
            decisionId.ToString(CultureInfo.InvariantCulture),
            userId.ToString(CultureInfo.InvariantCulture),
            challengeId.ToString("N"),
            contentHash);
    }

    // Oylama sırasında önceden verilen imzayı, sabitlenen içeriğe sunucuda bağlar.
    // Üye kimliği ve parolası ön imza alınırken doğrulanmıştır.
    public static void BindPreSignature(
        Decision decision,
        DecisionParticipant participant,
        DateTime now)
    {
        if (string.IsNullOrWhiteSpace(decision.SigningContentHash) ||
            participant.PreSignedAt == null ||
            participant.PreSignatureImagePng == null ||
            participant.SignedAt != null)
            throw new InvalidOperationException("Ön imza bağlanamaz.");

        var challenge = Guid.NewGuid();
        participant.SignatureChallengeId = challenge;
        participant.SignatureChallengeExpiresAt = now.AddMinutes(10);
        participant.SignedContentHash = decision.SigningContentHash;
        participant.SignatureData = CreateResponse(CreatePayload(
            decision.Id, participant.UserId, challenge, decision.SigningContentHash));
        participant.SignatureRef = $"DEMO-PRESIGN-V1-{participant.UserId}-{challenge:N}";
        participant.SignatureImagePng = participant.PreSignatureImagePng;
        participant.SignedAt = now;
    }

    private static string CreateResponse(string payload) =>
        Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(payload)))
            .ToLowerInvariant();

    public static bool IsValidResponse(
        Decision decision,
        DecisionParticipant participant,
        Guid challengeId,
        string? response)
    {
        if (string.IsNullOrWhiteSpace(decision.SigningContentHash) ||
            response == null ||
            response.Length != 64)
        {
            return false;
        }

        var expected = CreateResponse(CreatePayload(
            decision.Id,
            participant.UserId,
            challengeId,
            decision.SigningContentHash));

        return string.Equals(
            expected,
            response,
            StringComparison.Ordinal);
    }

    public static bool HasValidBinding(
        Decision decision,
        DecisionParticipant participant)
    {
        return participant.SignedAt != null &&
               !string.IsNullOrWhiteSpace(participant.SignatureRef) &&
               participant.SignatureChallengeId is Guid challenge &&
               participant.SignatureChallengeExpiresAt != null &&
               participant.SignedAt <= participant.SignatureChallengeExpiresAt &&
               string.Equals(
                   participant.SignedContentHash,
                   decision.SigningContentHash,
                   StringComparison.Ordinal) &&
               IsValidResponse(
                   decision,
                   participant,
                   challenge,
                   participant.SignatureData);
    }

    public Task<SignaturePreparation> PrepareAsync(
        Decision decision,
        DecisionParticipant participant,
        CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();

        if (!DecisionRules.SigningContentMatches(decision))
            throw new InvalidOperationException("İmza içeriği doğrulanamadı.");

        if (participant.SignedAt != null)
            throw new InvalidOperationException("Üye zaten imzaladı.");

        var now = DateTime.UtcNow;

        // Süresi dolmamış hazırlık tekrar kullanılabilir.
        if (participant.SignatureChallengeId == null ||
            participant.SignatureChallengeExpiresAt == null ||
            participant.SignatureChallengeExpiresAt <= now)
        {
            participant.SignatureChallengeId = Guid.NewGuid();
            participant.SignatureChallengeExpiresAt = now.AddMinutes(10);
        }

        var challenge = participant.SignatureChallengeId.Value;
        var hash = decision.SigningContentHash!;

        return Task.FromResult(new SignaturePreparation(
            Scheme,
            decision.Id,
            participant.UserId,
            challenge,
            hash,
            DateTime.SpecifyKind(
                participant.SignatureChallengeExpiresAt.Value,
                DateTimeKind.Utc),
            CreatePayload(
                decision.Id,
                participant.UserId,
                challenge,
                hash)));
    }

    public Task<SignatureResult> CompleteAsync(
        Decision decision,
        DecisionParticipant participant,
        SignatureCompletion completion,
        CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();

        SignatureResult Fail(string message) =>
            new(false, message, null, default);

        if (!DecisionRules.SigningContentMatches(decision))
        {
            return Task.FromResult(
                Fail("Karar içeriği sabitlenen özetle eşleşmiyor."));
        }

        if (participant.SignatureChallengeId != completion.ChallengeId ||
            completion.ChallengeId == Guid.Empty)
        {
            return Task.FromResult(
                Fail("İmza hazırlığı geçersiz. Süreci yeniden başlatın."));
        }

        if (!string.Equals(
                completion.ContentHash,
                decision.SigningContentHash,
                StringComparison.Ordinal))
        {
            return Task.FromResult(
                Fail("İmzalanacak içerik özeti eşleşmiyor."));
        }

        if (!IsValidResponse(
                decision,
                participant,
                completion.ChallengeId,
                completion.SignatureData))
        {
            return Task.FromResult(
                Fail("Demo imza yanıtı doğrulanamadı."));
        }

        var now = DateTime.UtcNow;

        if (participant.SignatureChallengeExpiresAt == null ||
            participant.SignatureChallengeExpiresAt <= now)
        {
            return Task.FromResult(
                Fail("İmza hazırlığının süresi doldu. Süreci yeniden başlatın."));
        }

        return Task.FromResult(new SignatureResult(
            true,
            null,
            $"DEMO-CONTENT-V1-{participant.UserId}-{completion.ChallengeId:N}",
            now));
    }

    public Task<SignatureResult> SignAsync(
        Decision decision,
        DecisionParticipant participant,
        string credential,
        CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();

        return Task.FromResult(new SignatureResult(
            false,
            "Eski imza yöntemi kapatıldı. Önce imzayı hazırlayın.",
            null,
            default));
    }
}