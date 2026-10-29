using System.Security.Cryptography;
using Kurul.API.Models;

namespace Kurul.API.Services;

public static class SigningPdfBinding
{
    private static readonly SemaphoreSlim Slots = new(2, 2);

    public static async Task<bool> FreezeAsync(
        Decision d,
        IWebHostEnvironment environment,
        CancellationToken ct,
        string? publicBaseUrl = null)
    {
        if (!DecisionRules.SigningContentMatches(d))
        {
            throw new InvalidOperationException(
                "Karar içeriği doğrulanamadı.");
        }

        // Bir kez sabitlenen PDF yeniden üretilmez.
        if (d.SignatureVersion == 2) return false;

        // Kısmi v1 imzalar dönüştürülmez; eski yöntemle devam eder.
        if (d.Participants.Any(p => p.SignedAt != null))
            return false;

        var result = DecisionRules.Compute(d.Participants);

        if (d.SignatureVersion != 1 ||
            d.Status != DecisionStatus.ImzaBekliyor ||
            !result.Complete ||
            !result.Accepted ||
            d.SignedAt != null ||
            d.SealedAt != null ||
            d.DocumentHash != null ||
            d.Participants.Any(p =>
                p.SignatureRef != null ||
                p.SignatureData != null ||
                p.SignedContentHash != null))
        {
            throw new InvalidOperationException(
                "PDF sabitlemeye uygun değil.");
        }

        var logoFile = d.AcademicUnit.LogoPath switch
        {
            "/su_bilgisayar.png" => "su_bilgisayar.png",
            "/su_fbe.png" => "su_fbe.png",
            _ => throw new InvalidOperationException(
                "Kurul logosu tanımlı değil.")
        };

        await Slots.WaitAsync(ct);

        byte[] bytes;

        try
        {
            var path = Path.Combine(
                environment.ContentRootPath,
                "Assets",
                "Pdf",
                logoFile);

            var logo = await File.ReadAllBytesAsync(path, ct);

            ct.ThrowIfCancellationRequested();

            // Kod PDF'ye basılacağı için sabitlemeden önce üretilir.
            d.VerificationCode ??= DecisionVerification.NewCode();

            bytes = DecisionPdfRenderer.Render(
                d,
                logo,
                forSigning: true,
                verifyUrl: DecisionVerification.Url(publicBaseUrl, d.VerificationCode));

            ct.ThrowIfCancellationRequested();
        }
        finally
        {
            Slots.Release();
        }

        if (bytes.Length == 0 || bytes.Length > 10 * 1024 * 1024)
        {
            throw new InvalidOperationException(
                "PDF boş olmamalı ve 10 MB sınırını aşmamalı.");
        }

        d.SigningPdfBytes = bytes;

        d.SigningPdfHash = Convert.ToHexString(
            SHA256.HashData(bytes))
            .ToLowerInvariant();

        d.SigningPdfFrozenAt = DateTime.UtcNow;
        d.SignatureVersion = 2;

        d.SigningContentHash =
            DecisionRules.ComputeSigningContentHash(d);

        // Eski içeriğe ait hazırlıklar yeni PDF için kullanılamaz.
        foreach (var participant in d.Participants)
        {
            participant.SignatureChallengeId = null;
            participant.SignatureChallengeExpiresAt = null;
        }

        // Burada SaveChanges yok.
        // Controller'ın RowVersion kontrollü SaveChanges'i PDF,
        // hazırlık ve logları birlikte kaydeder.
        return true;
    }
}
