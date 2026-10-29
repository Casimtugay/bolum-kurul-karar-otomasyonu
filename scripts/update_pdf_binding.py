from pathlib import Path
from datetime import datetime, timezone
import shutil
import sys

ROOT = Path.cwd()
changes = {}
originals = {}


def read(name):
    path = ROOT / name
    if not path.is_file():
        raise RuntimeError(f"Dosya bulunamadı: {name}")

    text = path.read_text(encoding="utf-8-sig")
    originals[name] = text
    return text


def replace(text, old, new, name):
    if text.count(old) != 1:
        raise RuntimeError(
            f"{name}: beklenen kod tam bir kez bulunamadı. "
            "Hiçbir dosya değiştirilmedi."
        )

    return text.replace(old, new, 1)


def edit(name, pairs):
    text = read(name)

    for old, new in pairs:
        text = replace(text, old, new, name)

    changes[name] = text


MODEL = "Kurul.API/Models/Decision.cs"
RULES = "Kurul.API/Services/DecisionRules.cs"
CONTROLLER = "Kurul.API/Controllers/DecisionsController.cs"
RENDERER = "Kurul.API/Services/DecisionPdfRenderer.cs"
PDF_CONTROLLER = "Kurul.API/Controllers/DecisionPdfController.cs"
HELPER = "Kurul.API/Services/SigningPdfBinding.cs"


def prepare():
    if (ROOT / HELPER).exists():
        raise RuntimeError(
            "SigningPdfBinding.cs zaten var; güncelleme tekrar uygulanmadı."
        )

    edit(MODEL, [
        (
            "public int Id { get; set; }",
            """public int Id { get; set; }

    // PDF v2: ilk imza hazırlığında, hazırlık kaydıyla birlikte saklanır.
    public byte[]? SigningPdfBytes { get; set; }

    [System.ComponentModel.DataAnnotations.MaxLength(64)]
    public string? SigningPdfHash { get; set; }

    public DateTime? SigningPdfFrozenAt { get; set; }"""
        )
    ])

    text = read(RULES)

    text = replace(
        text,
        "public static string ComputeSigningContentHash(Decision d)",
        "private static string ComputeSigningDataHashV1(Decision d)",
        RULES
    )

    start = text.index(
        "    public static bool SigningContentMatches(Decision d) =>"
    )
    end = text.index(
        "    public static string ComputeHash(Decision d)",
        start
    )

    text = text[:start] + """    public static string ComputeSigningContentHash(Decision d)
    {
        var dataHash = ComputeSigningDataHashV1(d);

        // Eski v1 kararlarının özet biçimi aynen korunur.
        if (d.SignatureVersion != 2) return dataHash;

        return Hash(new
        {
            format = "kurul-signing-content-v2",
            dataHash,
            pdfHash = d.SigningPdfHash,
            pdfFrozenAt = T(d.SigningPdfFrozenAt)
        });
    }

    public static bool SigningPdfMatches(Decision d)
    {
        if (d.SignatureVersion != 2 ||
            d.SigningPdfBytes == null ||
            d.SigningPdfBytes.Length == 0 ||
            d.SigningPdfHash == null ||
            d.SigningPdfFrozenAt == null)
        {
            return false;
        }

        var actual = Convert.ToHexString(
            SHA256.HashData(d.SigningPdfBytes))
            .ToLowerInvariant();

        return string.Equals(
            actual,
            d.SigningPdfHash,
            StringComparison.Ordinal);
    }

    public static bool SigningContentMatches(Decision d) =>
        d.SignatureVersion is (1 or 2) &&
        d.SigningContentFrozenAt != null &&
        !string.IsNullOrWhiteSpace(d.SigningContentHash) &&
        (d.SignatureVersion == 2
            ? SigningPdfMatches(d)
            : d.SigningPdfBytes == null &&
              d.SigningPdfHash == null &&
              d.SigningPdfFrozenAt == null) &&
        string.Equals(
            d.SigningContentHash,
            ComputeSigningContentHash(d),
            StringComparison.Ordinal);

""" + text[end:]

    text = replace(
        text,
        "if (d.SignatureVersion != 1)",
        "if (d.SignatureVersion is not (1 or 2))",
        RULES
    )

    text = replace(
        text,
        'format = "kurul-final-seal-v1",',
        """format = d.SignatureVersion == 2
                ? "kurul-final-seal-v2"
                : "kurul-final-seal-v1",""",
        RULES
    )

    changes[RULES] = text

    edit(CONTROLLER, [
        (
            "            var prepared = await _signatures.PrepareAsync(d, p, ct);",
            """            bool frozePdf;

            try
            {
                frozePdf = await SigningPdfBinding.FreezeAsync(d, _env, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "PDF sabitlenemedi: {DecisionId}",
                    d.Id);

                return Conflict(new
                {
                    error = "İmzaya esas PDF oluşturulamadı. Hiçbir imza hazırlığı kaydedilmedi. Sunucu kaydını kontrol edin."
                });
            }

            if (frozePdf)
            {
                Log(
                    "İmzaya esas PDF sabitlendi; demo imza yöntemi v2",
                    d);
            }

            var prepared = await _signatures.PrepareAsync(d, p, ct);"""
        ),
        (
            "            d.SigningContentFrozenAt,",
            """            d.SigningContentFrozenAt,
            d.SigningPdfHash,
            d.SigningPdfFrozenAt,"""
        ),
        (
            "if (d.SignatureVersion is not (null or 1))",
            "if (d.SignatureVersion is not (null or 1 or 2))"
        ),
        (
            "            signingContentHash = d.SigningContentHash,",
            """            signingContentHash = d.SigningContentHash,
            pdfBound = d.SignatureVersion == 2,
            pdfValid = d.SignatureVersion == 2
                ? (bool?)DecisionRules.SigningPdfMatches(d)
                : null,
            pdfHash = d.SigningPdfHash,"""
        )
    ])

    edit(RENDERER, [
        (
            "public static byte[] Render(Decision decision, byte[] logo)",
            """public static byte[] Render(
        Decision decision,
        byte[] logo,
        bool forSigning = false)"""
        ),
        (
            "var statusLabel = decision.Status switch",
            """var statusLabel = forSigning
            ? "İMZAYA ESAS KARAR METNİ"
            : decision.Status switch"""
        ),
        (
            "if (participant.SignedAt != null)",
            "if (!forSigning && participant.SignedAt != null)"
        ),
        (
            """body.Item().Text(
                        "Bu PDF, sistem kayıtlarından oluşturulan görüntüleme " +""",
            """body.Item().Text(forSigning
                        ? "Bu dosya demo imzaya esas sabit karar metnidir. " +
                          "İmza ve iptal durumları sistemden kontrol edilir. " +
                          "Nitelikli elektronik imzalı PDF değildir."
                        : "Bu PDF, sistem kayıtlarından oluşturulan görüntüleme " +"""
        ),
        (
            "if (!string.IsNullOrWhiteSpace(decision.DocumentHash))",
            "if (!forSigning && !string.IsNullOrWhiteSpace(decision.DocumentHash))"
        )
    ])

    anchor = "            var logoFile = decision.AcademicUnit.LogoPath switch"

    edit(PDF_CONTROLLER, [
        (
            anchor,
            """            if (decision.SignatureVersion == 2)
            {
                if (!DecisionRules.SigningContentMatches(decision))
                {
                    return Conflict(new
                    {
                        error = "Sabit PDF veya bağlı karar içeriği doğrulanamadı."
                    });
                }

                Response.Headers["Cache-Control"] = "no-store";

                return File(
                    decision.SigningPdfBytes!,
                    "application/pdf",
                    $"Kurul-Karari-{decision.MeetingYear}-{decision.MeetingNo}-{decision.DecisionNo}.pdf");
            }

""" + anchor
        )
    ])

    preview = "kurul-client/src/pages/PdfPreview.jsx"

    edit(preview, [
        (
            """          Bu dosya, karar kayıtlarından sunucuda oluşturulan çıktıdır.
          PDF dosyasının kendisi elektronik olarak imzalanmış değildir.
          Ek dosyaların adları listelenir; içerikleri PDF’ye birleştirilmez.""",
            """          PDF v2 kullanılan kararlarda ilk imza hazırlığında saklanan
          dosya gösterilir. İmza ve iptal durumunu karar sayfasından kontrol edin.
          Bu sistem demo imza kullanır; PDF nitelikli elektronik imzalı değildir.
          Ek dosyaların içerikleri PDF’ye birleştirilmez."""
        )
    ])

    changes[HELPER] = """using System.Security.Cryptography;
using Kurul.API.Models;

namespace Kurul.API.Services;

public static class SigningPdfBinding
{
    private static readonly SemaphoreSlim Slots = new(2, 2);

    public static async Task<bool> FreezeAsync(
        Decision d,
        IWebHostEnvironment environment,
        CancellationToken ct)
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

            bytes = DecisionPdfRenderer.Render(
                d,
                logo,
                forSigning: true);

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
"""


def main():
    # Bütün kaynak eşleşmeleri, herhangi bir dosya yazılmadan kontrol edilir.
    prepare()

    if "--check" in sys.argv:
        print("Kod eşleşmeleri uygun. Hiçbir dosya değiştirilmedi.")
        return

    backup = ROOT / (
        "pdf-v2-code-backup-" +
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    )

    backup.mkdir()

    for name in originals:
        destination = backup / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)

    try:
        for name, text in changes.items():
            path = ROOT / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

    except Exception:
        # Yazma sırasında hata olursa bu betiğin değişikliklerini geri al.
        for name in changes:
            if name in originals:
                shutil.copy2(backup / name, ROOT / name)
            else:
                (ROOT / name).unlink(missing_ok=True)

        raise

    print("PDF v2 kod güncellemesi tamamlandı.")
    print("Kod yedeği:", backup)
    print("Henüz migration veya veritabanı işlemi yapılmadı.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("HATA:", error, file=sys.stderr)
        sys.exit(1)