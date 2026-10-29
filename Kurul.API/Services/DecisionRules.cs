using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kurul.API.Models;

namespace Kurul.API.Services;

public record VoteResult(
    int Eligible,
    int Kabul,
    int Ret,
    int Pending,
    bool Complete,
    bool Accepted,
    bool TieBrokenByChair,
    string Outcome);

public static class DecisionRules
{
    public record MeetingEligibility(
        int Total,
        int Required,
        int Present,
        bool HasQuorum,
        bool ChairPresent,
        bool Valid,
        string? Error);

    private static string T(DateTime? value) =>
        value?.ToString(
            "yyyy-MM-ddTHH:mm:ss.fffffff",
            CultureInfo.InvariantCulture) ?? "";

    private static string Hash(object payload) =>
        Convert.ToHexString(
            SHA256.HashData(
                Encoding.UTF8.GetBytes(
                    JsonSerializer.Serialize(payload))))
            .ToLowerInvariant();

    public static MeetingEligibility GetEligibility(
        IEnumerable<DecisionParticipant> participants)
    {
        var all = participants.ToList();
        var present = all.Count(
            p => p.Attendance == AttendanceStatus.Katilir);

        // Toplantı yeter sayısı aranmaz: başkanın seçtiği katılımcılarla oylama yapılır.
        // Yalnızca başkanın katılması ve en az bir katılımcı bulunması gerekir.
        var required = 1;
        var chairs = all.Where(p => p.IsChair).ToList();

        var chairPresent =
            chairs.Count == 1 &&
            chairs[0].Attendance == AttendanceStatus.Katilir;

        var quorum = all.Count > 0 && present >= required;

        var error = chairs.Count != 1
            ? "Kararda tam olarak bir başkan tanımlanmalıdır."
            : !chairPresent
                ? "Başkan katılmadan oylama yapılamaz."
                : !quorum
                    ? "Oylama için en az bir üye katılmalıdır."
                    : null;

        return new(
            all.Count,
            required,
            present,
            quorum,
            chairPresent,
            error == null,
            error);
    }

    public static VoteResult Compute(
        IEnumerable<DecisionParticipant> participants)
    {
        var all = participants.ToList();
        var meeting = GetEligibility(all);

        var eligible = all
            .Where(p => p.Attendance == AttendanceStatus.Katilir)
            .ToList();

        var kabul = eligible.Count(p => p.Vote == VoteType.Kabul);
        var ret = eligible.Count(p => p.Vote == VoteType.Ret);
        var pending = eligible.Count - kabul - ret;

        var complete = meeting.Valid && pending == 0;
        var tie = complete && kabul == ret;

        var accepted = complete &&
            (kabul > ret ||
             (tie && eligible.Single(p => p.IsChair).Vote == VoteType.Kabul));

        var outcome = !complete
            ? ""
            : kabul == 0 || ret == 0
                ? "oy birliğiyle"
                : "oy çokluğuyla";

        return new(
            eligible.Count,
            kabul,
            ret,
            pending,
            complete,
            accepted,
            tie,
            outcome);
    }

    public static void RefreshStatus(Decision d)
    {
        if (d.Status is DecisionStatus.Imzalandi
                or DecisionStatus.IptalEdildi
                or DecisionStatus.Reddedildi ||
            d.SealedAt != null ||
            d.SignedAt != null ||
            d.DocumentHash != null)
        {
            return;
        }

        // Sabitlenen imza içeriği yeniden hesaplanıp değiştirilmez.
        if (d.SignatureVersion != null ||
            d.SigningContentHash != null ||
            d.SigningContentFrozenAt != null)
        {
            return;
        }

        var result = Compute(d.Participants);

        if (result.Complete)
        {
            d.Status = result.Accepted
                ? DecisionStatus.ImzaBekliyor
                : DecisionStatus.Reddedildi;

            d.VoteOutcome = result.Outcome;

            if (result.Accepted)
                FreezeSigningContent(d);
        }
        else
        {
            // Oylamaya sunulmuş karar, henüz oy gelmese de "Oylamada" kalır.
            d.Status = result.Kabul + result.Ret > 0 || d.SubmittedAt != null
                ? DecisionStatus.Oylamada
                : DecisionStatus.Taslak;

            d.VoteOutcome = null;
        }
    }

    // Yalnızca henüz hiçbir imzası bulunmayan, kabul edilmiş karar.
    public static void FreezeSigningContent(Decision d)
    {
        if (d.SignatureVersion != null ||
            d.SigningContentHash != null ||
            d.SigningContentFrozenAt != null)
        {
            throw new InvalidOperationException(
                "İmza içeriği zaten sabitlenmiş.");
        }

        if (d.Participants.Any(
                p => p.SignedAt != null ||
                     p.SignatureRef != null ||
                     p.SignedContentHash != null ||
                     p.SignatureData != null))
        {
            throw new InvalidOperationException(
                "Mevcut imzalar yeni yönteme dönüştürülemez.");
        }

        var result = Compute(d.Participants);

        if (d.Status != DecisionStatus.ImzaBekliyor ||
            !result.Complete ||
            !result.Accepted ||
            d.SignedAt != null ||
            d.SealedAt != null ||
            d.DocumentHash != null)
        {
            throw new InvalidOperationException(
                "Karar imza içeriğini sabitlemeye uygun değil.");
        }

        d.SignatureVersion = 1;
        d.SigningContentFrozenAt = DateTime.UtcNow;
        d.SigningContentHash = ComputeSigningContentHash(d);
    }

    // İmzalar ve hazırlık kayıtları dahil değildir.
    // Katılımcı, oy, metin veya ek listesi değişirse sonuç değişir.
    private static string ComputeSigningDataHashV1(Decision d)
    {
        return Hash(new
        {
            format = "kurul-signing-content-v1",
            decisionId = d.Id,
            unit = d.AcademicUnitId,
            year = d.MeetingYear,
            meetingNo = d.MeetingNo,
            decisionNo = d.DecisionNo,
            date = d.MeetingDate.ToString(
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture),
            reference = d.Reference,
            agenda = d.Agenda,
            content = d.Content,
            attachmentsNote = d.AttachmentsNote,
            columns = d.TableColumnsJson,
            rows = d.TableRowsJson,
            outcome = d.VoteOutcome ?? "",
            attachments = d.Attachments
                .OrderBy(a => a.Id)
                .Select(a => new
                {
                    a.Id,
                    a.OriginalName,
                    a.SizeBytes,
                    a.ContentType,
                    a.Sha256
                }),
            participants = d.Participants
                .OrderBy(p => p.SortOrder)
                .ThenBy(p => p.UserId)
                .Select(p => new
                {
                    p.UserId,
                    p.DisplayName,
                    p.Duty,
                    p.SortOrder,
                    p.IsChair,
                    p.Attendance,
                    vote = p.Vote ?? "",
                    reason = p.VoteReason ?? "",
                    votedAt = T(p.VotedAt)
                })
        });
    }

    public static string ComputeSigningContentHash(Decision d)
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

    public static string ComputeHash(Decision d)
    {
        var legacyHash = ComputeLegacyHash(d);

        // Eski tamamlanmış kararların hash biçimini değiştirme.
        if (d.SignatureVersion == null)
            return legacyHash;

        if (d.SignatureVersion is not (1 or 2))
            throw new InvalidOperationException("Bilinmeyen imza sürümü.");

        return Hash(new
        {
            format = d.SignatureVersion == 2
                ? "kurul-final-seal-v2"
                : "kurul-final-seal-v1",
            legacyHash,
            d.SignatureVersion,
            d.SigningContentHash,
            frozenAt = T(d.SigningContentFrozenAt),
            bindings = d.Participants
                .OrderBy(p => p.SortOrder)
                .ThenBy(p => p.UserId)
                .Select(p => new
                {
                    p.UserId,
                    p.SignedContentHash,
                    p.SignatureData,
                    challengeId = p.SignatureChallengeId?.ToString("N") ?? "",
                    challengeExpiresAt = T(p.SignatureChallengeExpiresAt)
                })
        });
    }

    // Eski kodun JSON alan adları, sırası ve tarih biçimi korunmuştur.
    private static string ComputeLegacyHash(Decision d)
    {
        var payload = new
        {
            unit = d.AcademicUnitId,
            year = d.MeetingYear,
            meetingNo = d.MeetingNo,
            decisionNo = d.DecisionNo,
            date = d.MeetingDate.ToString(
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture),
            reference = d.Reference,
            agenda = d.Agenda,
            content = d.Content,
            attachmentsNote = d.AttachmentsNote,
            columns = d.TableColumnsJson,
            rows = d.TableRowsJson,
            attachments = d.Attachments
                .OrderBy(a => a.Id)
                .Select(a => new
                {
                    OriginalName = a.OriginalName,
                    SizeBytes = a.SizeBytes,
                    Sha256 = a.Sha256
                }),
            outcome = d.VoteOutcome ?? "",
            participants = d.Participants
                .OrderBy(p => p.SortOrder)
                .ThenBy(p => p.UserId)
                .Select(p => new
                {
                    p.UserId,
                    p.DisplayName,
                    p.Duty,
                    p.Attendance,
                    vote = p.Vote ?? "",
                    reason = p.VoteReason ?? "",
                    votedAt = T(p.VotedAt),
                    signedAt = T(p.SignedAt),
                    signatureRef = p.SignatureRef ?? ""
                })
        };

        return Hash(payload);
    }
}