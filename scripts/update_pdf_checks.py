from pathlib import Path
from datetime import datetime, timezone
import shutil
import sys

path = Path("Kurul.Checks/Program.cs")
text = path.read_text(encoding="utf-8-sig")

if "// PDF_V2_CHECKS" in text:
    raise SystemExit("PDF v2 test güncellemesi zaten uygulanmış.")


def change(old, new):
    global text

    if text.count(old) != 1:
        raise SystemExit(
            "Beklenen test kodu eşleşmedi; dosya değiştirilmedi:\n"
            + old[:120]
        )

    text = text.replace(old, new, 1)


change(
    "using System.Data.Common;",
    "// PDF_V2_CHECKS\nusing System.Data.Common;"
)

change(
    "    ObjectResult o => o.StatusCode ?? 200,",
    "    FileResult => 200,\n    ObjectResult o => o.StatusCode ?? 200,"
)

change(
    "    Directory.CreateDirectory(storageRoot);",
    """    Directory.CreateDirectory(storageRoot);

    var testLogoDirectory = Path.Combine(testRoot, "Assets", "Pdf");
    Directory.CreateDirectory(testLogoDirectory);

    var sourceLogo = Path.Combine(
        Directory.GetCurrentDirectory(),
        "Kurul.API", "Assets", "Pdf", "su_bilgisayar.png");

    if (!File.Exists(sourceLogo))
        throw new InvalidOperationException(
            "Testi KurulOtomasyonu kökünde çalıştırın. API PDF logosu bulunamadı.");

    var testLogoPath = Path.Combine(
        testLogoDirectory, "su_bilgisayar.png");

    File.Copy(sourceLogo, testLogoPath);"""
)

change(
    '        UnitType = "BOLUM"',
    """        UnitType = "BOLUM",
        TitleLine1 = "TEST KURULU",
        TitleLine2 = "KURUL KARARI",
        MembersLabel = "Test Kurulu Üyeleri",
        LogoPath = "/su_bilgisayar.png" """
)

change(
    "    var originalContentHash = ready.SigningContentHash;",
    "    var beforePdfHash = ready.SigningContentHash;"
)

change(
    "    await SignOne(voteId, 0);",
    """    var firstPreparation = await Prepare(voteId, 0);
    var frozen = await Read(voteId);

    var originalContentHash = frozen.SigningContentHash;
    var originalPdf = frozen.SigningPdfBytes!.ToArray();

    Check(
        frozen.SignatureVersion == 2 &&
        originalPdf.Length > 5 &&
        Encoding.ASCII.GetString(originalPdf, 0, 5) == "%PDF-" &&
        frozen.SigningPdfHash == Sha256(originalPdf) &&
        frozen.SigningPdfFrozenAt != null &&
        originalContentHash != beforePdfHash &&
        DecisionRules.SigningContentMatches(frozen),
        "İlk hazırlık gerçek PDF üretir ve özeti PDF v2'ye bağlar");

    ExpectStatus(
        await Complete(voteId, 0, Completion(firstPreparation)),
        200,
        "İlk PDF bağlantılı imza");"""
)

change(
    "        migratedUnsigned.SignatureVersion == 1 &&",
    """        migratedUnsigned.SignatureVersion == 2 &&
        DecisionRules.SigningPdfMatches(migratedUnsigned) &&"""
)

change(
    "        reopened.SigningContentFrozenAt == null &&",
    """        reopened.SigningContentFrozenAt == null &&
        reopened.SigningPdfBytes == null &&
        reopened.SigningPdfHash == null &&
        reopened.SigningPdfFrozenAt == null &&"""
)

change(
    "    var sealedVersion = sealedDecision.RowVersion.ToArray();",
    """    Check(
        sealedDecision.SigningPdfBytes!.SequenceEqual(originalPdf) &&
        verification.GetProperty("pdfBound").GetBoolean() &&
        verification.GetProperty("pdfValid").GetBoolean(),
        "Tüm imzalardan sonra PDF baytları aynıdır ve PDF bağlantısı doğrulanır");

    var sealedVersion = sealedDecision.RowVersion.ToArray();"""
)

change(
    "    // ---------- Eski tek aşamalı uç nokta ----------",
    """    // ---------- PDF v2 ek kontrolleri ----------

    async Task<IActionResult> DownloadPdf(int id)
    {
        await using var db = Context();

        var controller = new DecisionPdfController(
            db,
            new PermissionService(db),
            new CheckEnvironment
            {
                ContentRootPath = testRoot,
                WebRootPath = testRoot
            },
            NullLogger<DecisionPdfController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = Controller(db, users[0].Id, unit.Id).User
                }
            }
        };

        return await controller.Download(id, default);
    }

    var download = await DownloadPdf(voteId);

    Check(
        download is FileContentResult pdf &&
        pdf.ContentType == "application/pdf" &&
        pdf.FileContents.SequenceEqual(originalPdf),
        "PDF indirme uç noktası veritabanındaki aynı dosyayı verir");

    var logoBackup = testLogoPath + ".hidden";
    File.Move(testLogoPath, logoBackup);

    try
    {
        var noLogoDownload = await DownloadPdf(voteId);

        Check(
            noLogoDownload is FileContentResult savedPdf &&
            savedPdf.FileContents.SequenceEqual(originalPdf),
            "Sabit PDF indirilirken logo veya yeniden üretim gerekmez");

        var missingLogoId = await AddDecision();
        var beforeFailure = await Read(missingLogoId);

        await using var db = Context();

        var failure = await Controller(db, users[0].Id, unit.Id)
            .PrepareSignature(
                missingLogoId,
                new(beforeFailure.RowVersion),
                default);

        var afterFailure = await Read(missingLogoId);

        Check(
            Status(failure) == 409 &&
            afterFailure.RowVersion.SequenceEqual(beforeFailure.RowVersion) &&
            afterFailure.SignatureVersion == 1 &&
            afterFailure.SigningPdfBytes == null &&
            afterFailure.SigningPdfHash == null &&
            afterFailure.SigningPdfFrozenAt == null &&
            afterFailure.Participants.All(
                p => p.SignatureChallengeId == null),
            "PDF üretimi başarısızsa yarım PDF veya hazırlık kaydı kalmaz");
    }
    finally
    {
        File.Move(logoBackup, testLogoPath);
    }

    // Aynı sürümden iki ilk hazırlık: yalnız biri kayıt yapabilir.
    var prepareRaceId = await AddDecision();
    var prepareRaceVersion = (await Read(prepareRaceId)).RowVersion;
    var prepareGate = new TwoReadersGate();

    await using (var a = Context(prepareGate))
    await using (var b = Context(prepareGate))
    {
        var results = await Task.WhenAll(
            Controller(a, users[0].Id, unit.Id).PrepareSignature(
                prepareRaceId, new(prepareRaceVersion), default),
            Controller(b, users[1].Id, unit.Id).PrepareSignature(
                prepareRaceId, new(prepareRaceVersion), default));

        Check(
            results.Count(r => Status(r) == 200) == 1 &&
            results.Count(r => Status(r) == 409) == 1,
            "Eşzamanlı ilk PDF hazırlığında tek işlem kaydedilir");
    }

    var raceFrozen = await Read(prepareRaceId);

    await Prepare(prepareRaceId, 0);
    await Prepare(prepareRaceId, 1);

    var afterPrepareRace = await Read(prepareRaceId);

    await using (var db = Context())
    {
        var detail =
            $"Karar #{prepareRaceId} " +
            $"({raceFrozen.MeetingYear}/{raceFrozen.MeetingNo}-{raceFrozen.DecisionNo})";

        var freezeLogCount = await db.AuditLogs.CountAsync(
            l => l.Detail == detail &&
                 l.Message == "İmzaya esas PDF sabitlendi; demo imza yöntemi v2");

        Check(
            DecisionRules.SigningPdfMatches(afterPrepareRace) &&
            raceFrozen.SigningPdfBytes!.SequenceEqual(
                afterPrepareRace.SigningPdfBytes!) &&
            freezeLogCount == 1,
            "Hazırlık tekrarı PDF'yi değiştirmez ve tek sabitleme logu vardır");
    }

    // Sabit PDF'nin aynı boyutta bozulması.
    var tamperedPdfId = await AddDecision();
    var tamperedPreparation = await Prepare(tamperedPdfId, 0);
    var beforePdfTamper = await Read(tamperedPdfId);

    var cleanPdf = beforePdfTamper.SigningPdfBytes!.ToArray();
    var dirtyPdf = cleanPdf.ToArray();
    dirtyPdf[^1] ^= 1;

    await using (var db = Context())
    {
        var d = await db.Decisions.SingleAsync(
            x => x.Id == tamperedPdfId);

        d.SigningPdfBytes = dirtyPdf;
        await db.SaveChangesAsync();
    }

    Check(
        Status(await Complete(
            tamperedPdfId, 0, Completion(tamperedPreparation))) == 409,
        "Sabit PDF'nin aynı boyutta değişmesi imzayı engeller");

    Check(
        Status(await DownloadPdf(tamperedPdfId)) == 409,
        "Değiştirilmiş sabit PDF indirme uç noktasından verilmez");

    await using (var db = Context())
    {
        var current = await Read(tamperedPdfId);

        var result = await Controller(db, users[1].Id, unit.Id)
            .PrepareSignature(
                tamperedPdfId, new(current.RowVersion), default);

        Check(
            Status(result) == 409,
            "Değişmiş sabit PDF için yeni imza hazırlığı yapılamaz");
    }

    // PDF hash'ini de değiştirerek bağlı içerik özeti aşılamaz.
    await using (var db = Context())
    {
        var d = await db.Decisions.SingleAsync(
            x => x.Id == tamperedPdfId);

        d.SigningPdfHash = Sha256(dirtyPdf);
        await db.SaveChangesAsync();
    }

    Check(
        Status(await Complete(
            tamperedPdfId, 0, Completion(tamperedPreparation))) == 409,
        "PDF ve PDF hash'i birlikte değişse de imza içerik bağı uyuşmaz");

    Check(
        (await Read(tamperedPdfId)).Participants.All(
            p => p.SignedAt == null),
        "Bozuk PDF denemeleri imza kaydı oluşturmaz");

    // Eski doğru dosya geri konunca aynı hazırlık çalışabilir.
    await using (var db = Context())
    {
        var d = await db.Decisions.SingleAsync(
            x => x.Id == tamperedPdfId);

        d.SigningPdfBytes = cleanPdf;
        d.SigningPdfHash = beforePdfTamper.SigningPdfHash;
        await db.SaveChangesAsync();
    }

    ExpectStatus(
        await Complete(
            tamperedPdfId, 0, Completion(tamperedPreparation)),
        200,
        "Doğru PDF ile imza");

    await SignOne(tamperedPdfId, 1);
    await SignOne(tamperedPdfId, 2);

    await using (var db = Context())
    {
        var d = await db.Decisions.SingleAsync(
            x => x.Id == tamperedPdfId);

        d.SigningPdfBytes = dirtyPdf;
        await db.SaveChangesAsync();
    }

    var damagedSeal = await Verify(tamperedPdfId);

    Check(
        !damagedSeal.GetProperty("valid").GetBoolean() &&
        !damagedSeal.GetProperty("pdfValid").GetBoolean(),
        "Mühürden sonra PDF değişikliği doğrulamada yakalanır");

    Check(
        cancelled.SigningPdfBytes!.SequenceEqual(
            beforeCancel.SigningPdfBytes!) &&
        cancelled.SigningPdfHash == beforeCancel.SigningPdfHash,
        "İptal edilen kararın imzaya esas PDF'si geçmiş için korunur");

    // PDF öncesi v1 kısmi imzayı geçmiş kayıt olarak oluştur.
    var v1Id = await AddDecision();
    string v1ContentHash;
    string? v1FirstReference;

    await using (var db = Context())
    {
        var d = await db.Decisions
            .Include(x => x.Participants)
            .Include(x => x.Attachments)
            .SingleAsync(x => x.Id == v1Id);

        var p = d.Participants.Single(x => x.IsChair);
        var service = new DemoSignatureService();

        var preparation = await service.PrepareAsync(d, p);
        var response = Completion(preparation);
        var signature = await service.CompleteAsync(d, p, response);

        if (!signature.Ok)
            throw new InvalidOperationException(signature.Error);

        p.SignedAt = signature.SignedAt;
        p.SignatureRef = signature.Reference;
        p.SignedContentHash = response.ContentHash;
        p.SignatureData = response.SignatureData;

        v1ContentHash = d.SigningContentHash!;
        v1FirstReference = p.SignatureRef;

        await db.SaveChangesAsync();
    }

    await SignOne(v1Id, 1);
    await SignOne(v1Id, 2);

    var v1Sealed = await Read(v1Id);
    var v1Verified = await Verify(v1Id);

    Check(
        v1Sealed.SignatureVersion == 1 &&
        v1Sealed.SigningPdfBytes == null &&
        v1Sealed.SigningContentHash == v1ContentHash &&
        v1Sealed.Participants.Single(
            p => p.IsChair).SignatureRef == v1FirstReference &&
        v1Verified.GetProperty("valid").GetBoolean() &&
        !v1Verified.GetProperty("pdfBound").GetBoolean(),
        "Eski kısmi v1 imzalar PDF'ye dönüştürülmeden tamamlanır ve doğrulanır");

    // ---------- Eski tek aşamalı uç nokta ----------"""
)

change(
    "SQL yarış, içerik bağlantısı, dosya bütünlüğü ve geçiş kontrolleri tamamlandı.",
    "SQL yarış, PDF v2, dosya bütünlüğü ve eski imza geçiş kontrolleri tamamlandı."
)

if "--check" in sys.argv:
    print("Test kodu eşleşmeleri uygun. Dosya değiştirilmedi.")
else:
    backup = path.with_name(
        "Program.cs."
        + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        + ".bak"
    )

    shutil.copy2(path, backup)
    path.write_text(text, encoding="utf-8")

    print("Testler güncellendi. Yedek:", backup)