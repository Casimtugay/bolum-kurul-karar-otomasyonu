// PDF_V2_CHECKS
using System.Data.Common;
using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kurul.API.Controllers;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

// ---------- Ortak kontrol yardımcıları ----------

static void Check(bool condition, string message)
{
    if (!condition)
        throw new InvalidOperationException("FAIL: " + message);

    Console.WriteLine("PASS: " + message);
}

static int Status(IActionResult result) => result switch
{
    FileResult => 200,
    ObjectResult o => o.StatusCode ?? 200,
    StatusCodeResult s => s.StatusCode,
    _ => throw new InvalidOperationException(
        "Beklenmeyen sonuç türü: " + result.GetType().Name)
};

static void ExpectStatus(
    IActionResult result,
    int expected,
    string operation)
{
    if (Status(result) == expected)
        return;

    var detail = result is ObjectResult o
        ? JsonSerializer.Serialize(o.Value)
        : "";

    throw new InvalidOperationException(
        $"FAIL: {operation}. Beklenen HTTP {expected}, " +
        $"gelen HTTP {Status(result)}. {detail}");
}

static JsonElement Body(IActionResult result)
{
    if (result is not ObjectResult o || o.Value == null)
        throw new InvalidOperationException("Yanıt gövdesi bulunamadı.");

    return JsonSerializer.SerializeToElement(o.Value);
}

static string Sha256(byte[] bytes) =>
    Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

static List<DecisionParticipant> Members(int count) =>
    Enumerable.Range(1, count)
        .Select(i => new DecisionParticipant
        {
            UserId = i,
            IsChair = i == 1,
            Attendance = AttendanceStatus.Katilir
        })
        .ToList();

// Üretim servisinin yanıt üretme metodunu çağırmıyoruz.
// Test, istemci gibi hazırlanmış metnin SHA-256 yanıtını hesaplıyor.
// İmzalarken parola ve imza görüntüsü zorunludur; test kullanıcılarının parolası CheckPassword'dür.
const string CheckPassword = "Kontrol-Parola-1";
const string CheckSignaturePng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAeCAYAAABwmH1PAAAALUlEQVR4nO3QQQ0AMAzEsINQFIM3/r8VxirVlkIgCQAAACR17tvU798AAAAzNZEeYjU+kYa0AAAAAElFTkSuQmCC";

static SignatureCompletion Completion(SignaturePreparation prepared) =>
    new(
        prepared.ChallengeId,
        prepared.ContentHash,
        Sha256(Encoding.UTF8.GetBytes(prepared.Payload)),
        CheckPassword,
        CheckSignaturePng);

// Eski uygulamanın hash biçimi.
// Geriye uyumluluk testi için yeni ComputeHash'ten bağımsız tutulur.
static string LegacyHash(Decision d)
{
    static string T(DateTime? value) =>
        value?.ToString(
            "yyyy-MM-ddTHH:mm:ss.fffffff",
            CultureInfo.InvariantCulture) ?? "";

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

    return Sha256(
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload)));
}

// ---------- Veritabanı gerektirmeyen iş kuralı kontrolleri ----------

var members = Members(5);
members[3].Attendance = AttendanceStatus.Izinli;
members[4].Attendance = AttendanceStatus.Gorevli;

Check(
    DecisionRules.GetEligibility(members).Valid,
    "5 üyeden başkan dahil 3 katılım yeterli");

members[2].Attendance = AttendanceStatus.Izinli;

// Toplantı yeter sayısı aranmaz: başkan katıldığı sürece seçilen katılımcılarla oylama yapılır.
Check(
    DecisionRules.GetEligibility(members).Valid,
    "5 üyeden başkan dahil 2 katılım da yeterli (yeter sayısı aranmaz)");

members = Members(5);
members[0].Attendance = AttendanceStatus.Izinli;

foreach (var m in members.Skip(1))
    m.Vote = VoteType.Kabul;

Check(
    !DecisionRules.Compute(members).Complete,
    "Başkan yokken çoğunluk olsa da karar tamamlanmaz");

members = Members(5);
members[4].Attendance = AttendanceStatus.Izinli;

members[0].Vote = members[1].Vote = VoteType.Kabul;
members[2].Vote = members[3].Vote = VoteType.Ret;

Check(
    DecisionRules.Compute(members).Accepted &&
    DecisionRules.Compute(members).TieBrokenByChair,
    "2–2 eşitlikte başkanın kabul oyu belirler");

members[0].Vote = VoteType.Ret;
members[2].Vote = VoteType.Kabul;

Check(
    !DecisionRules.Compute(members).Accepted &&
    DecisionRules.Compute(members).TieBrokenByChair,
    "2–2 eşitlikte başkanın ret oyu belirler");

members = Members(3);

foreach (var m in members)
    m.Vote = VoteType.Ret;

Check(
    DecisionRules.Compute(members).Outcome == "oy birliğiyle",
    "Oybirliğiyle ret sonucu");

members[2].Vote = null;

Check(
    !DecisionRules.Compute(members).Complete &&
    DecisionRules.Compute(members).Outcome == "",
    "Eksik oyda sonuç açıklanmaz");

members[1].IsChair = true;

Check(
    !DecisionRules.GetEligibility(members).Valid,
    "Birden fazla başkan reddedilir");

// Sabit örnek, eski hash biçimindeki alan/sıra değişimini yakalar.
var legacyFixture = new Decision
{
    AcademicUnitId = 9,
    MeetingYear = 2026,
    MeetingNo = 2,
    DecisionNo = 1,
    MeetingDate = new DateOnly(2026, 10, 1),
    Reference = "R",
    Agenda = "Legacy",
    Content = "Text",
    VoteOutcome = "unanimous",
    Participants = new List<DecisionParticipant>
    {
        new()
        {
            UserId = 3,
            DisplayName = "Member",
            Duty = "Chair",
            Attendance = AttendanceStatus.Katilir,
            Vote = VoteType.Kabul,
            VotedAt = new DateTime(
                2026, 10, 1, 10, 0, 0, DateTimeKind.Utc),
            SignedAt = new DateTime(
                2026, 10, 1, 10, 1, 0, DateTimeKind.Utc),
            SignatureRef = "DEMO-legacy"
        }
    }
};

const string expectedLegacyHash =
    "e97c57517c21b9abff5af3e83367f256734bd0e928879fbcb4c2c14d6c6982b4";

Check(
    LegacyHash(legacyFixture) == expectedLegacyHash &&
    DecisionRules.ComputeHash(legacyFixture) == expectedLegacyHash,
    "Eski hash biçimi sabit örnekle uyumlu");

// ---------- İzole SQL test ortamı ----------

var password =
    Environment.GetEnvironmentVariable("KURUL_TEST_SQL_PASSWORD");

// Docker SQL Server yerine Windows'taki LocalDB ile çalıştırmak için KURUL_TEST_LOCALDB=1.
var useLocalDb =
    Environment.GetEnvironmentVariable("KURUL_TEST_LOCALDB") == "1";

if (string.IsNullOrWhiteSpace(password) && !useLocalDb)
{
    Console.WriteLine(
        "SKIP: SQL ve dosya testleri çalıştırılmadı. " +
        "KURUL_TEST_SQL_PASSWORD veya KURUL_TEST_LOCALDB=1 ayarlayın.");
    return;
}

var runId = Guid.NewGuid().ToString("N");
var database = "KurulChecks_" + runId;

var testRoot = Path.Combine(
    Path.GetTempPath(),
    "KurulChecks_" + runId);

var storageRoot = Path.Combine(testRoot, "Storage");

var connectionString = useLocalDb
    ? new SqlConnectionStringBuilder
    {
        DataSource = @"(localdb)\MSSQLLocalDB",
        InitialCatalog = database,
        IntegratedSecurity = true,
        TrustServerCertificate = true,
        ConnectTimeout = 30
    }.ConnectionString
    : new SqlConnectionStringBuilder
    {
        DataSource = "localhost,1433",
        InitialCatalog = database,
        UserID = "sa",
        Password = password,
        TrustServerCertificate = true,
        ConnectTimeout = 15
    }.ConnectionString;

password = null;

var configuration = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Storage:Root"] = storageRoot,
        ["Jwt:Key"] = "checks-muhur-anahtari-0123456789abcdef",
        ["App:PublicUrl"] = "https://kurul.example"
    })
    .Build();

// Karar imzası makbuz e-postaları ve son PDF mührü için ortak test nesneleri.
var decisionEmail = new RecordingEmailQueue();
var sealService = new DecisionSealService(configuration, NullLogger<DecisionSealService>.Instance);

AppDbContext Context(DbCommandInterceptor? gate = null)
{
    var options = new DbContextOptionsBuilder<AppDbContext>()
        .UseSqlServer(connectionString);

    if (gate != null)
        options.AddInterceptors(gate);

    return new AppDbContext(options.Options);
}

DecisionsController Controller(
    AppDbContext db,
    int userId,
    int unitId,
    bool admin = true)
{
    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
        new Claim(ClaimTypes.Name, "kontrol"),
        new Claim("fullName", "Kontrol Kullanıcısı"),
        new Claim(
            ClaimTypes.Role,
            admin ? SystemRoles.Admin : SystemRoles.User),
        new Claim("unitId", unitId.ToString()),
        new Claim("unitCode", "checks"),
        new Claim(
            "unitRole",
            admin ? SystemRoles.Admin : UnitRoles.Uye)
    };

    return new DecisionsController(
        db,
        new DemoSignatureService(),
        new PermissionService(db),
        new CheckEnvironment
        {
            ContentRootPath = testRoot,
            WebRootPath = testRoot
        },
        configuration,
        NullLogger<DecisionsController>.Instance,
        sealService,
        decisionEmail)
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(
                    new ClaimsIdentity(claims, "checks"))
            }
        }
    };
}

await using var setup = Context();
var created = false;

try
{
    Directory.CreateDirectory(storageRoot);

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

    File.Copy(sourceLogo, testLogoPath);

    created = await setup.Database.EnsureCreatedAsync();

    if (!created)
        throw new InvalidOperationException(
            "Yeni test veritabanı oluşturulamadı.");

    var unit = new AcademicUnit
    {
        Code = "checks",
        Name = "Kontrol",
        BoardName = "Kontrol Kurulu",
        ParentName = "Test",
        UnitType = "BOLUM",
        TitleLine1 = "TEST KURULU",
        TitleLine2 = "KURUL KARARI",
        MembersLabel = "Test Kurulu Üyeleri",
        LogoPath = "/su_bilgisayar.png"
    };

    var users = Enumerable.Range(1, 3)
        .Select(i => new AppUser
        {
            Username = "check" + i,
            Email = $"check{i}@example.invalid",
            FullName = "Kontrol " + i,
            PasswordHash = new Microsoft.AspNetCore.Identity.PasswordHasher<AppUser>()
                .HashPassword(null!, CheckPassword),
            Role = SystemRoles.Admin,
            IsActive = true
        })
        .ToArray();

    setup.AcademicUnits.Add(unit);
    setup.Users.AddRange(users);
    await setup.SaveChangesAsync();

    var role = new RoleDefinition
    {
        AcademicUnitId = unit.Id,
        Name = "Kontrol Üyesi",
        Kind = UnitRoles.Uye,
        PermissionsJson = PermissionJson.Serialize(
            PermissionJson.DefaultsFor(UnitRoles.Uye))
    };

    setup.Roles.Add(role);
    await setup.SaveChangesAsync();

    setup.UserUnits.AddRange(users.Select((u, i) => new UserUnit
    {
        AcademicUnitId = unit.Id,
        UserId = u.Id,
        RoleId = role.Id,
        IsActive = true,
        IsBoardMember = true,
        SortOrder = i,
        UnitRole = i == 0 ? UnitRoles.Baskan : UnitRoles.Uye
    }));

    await setup.SaveChangesAsync();

    var nextDecisionNo = 0;

    // Her yardımcı ayrı DbContext kullanır.
    // Böylece testler bellekteki eski kayıtlarla yanlışlıkla geçmez.
    async Task<Decision> Read(int id)
    {
        await using var db = Context();

        return await db.Decisions
            .AsNoTracking()
            .Include(d => d.Participants)
            .Include(d => d.Attachments)
            .SingleAsync(d => d.Id == id);
    }

    async Task<int> AddDecision(
        bool approved = true,
        bool legacy = false,
        bool withAttachment = false,
        bool dissent = false)
    {
        await using var db = Context();

        var d = new Decision
        {
            AcademicUnitId = unit.Id,
            CreatedById = users[0].Id,
            MeetingDate = new DateOnly(2026, 10, 15),
            MeetingYear = 2026,
            MeetingNo = 1,
            DecisionNo = ++nextDecisionNo,
            Agenda = "İmza ve eşzamanlılık testi",
            Content = "Test karar metni",
            Status = DecisionStatus.Taslak,
            Participants = users.Select((u, i) =>
                new DecisionParticipant
                {
                    UserId = u.Id,
                    DisplayName = u.FullName,
                    Duty = i == 0 ? "Başkan" : "Üye",
                    IsChair = i == 0,
                    SortOrder = i,
                    Attendance = AttendanceStatus.Katilir
                }).ToList()
        };

        db.Decisions.Add(d);

        // İçerik hash'i karar ve ek kimliklerini içerir.
        // Önce gerçek kimlikleri oluştur.
        await db.SaveChangesAsync();

        if (withAttachment)
        {
            var relative = $"{d.Id}/test.pdf";
            var full = Path.Combine(
                storageRoot,
                relative.Replace('/', Path.DirectorySeparatorChar));

            Directory.CreateDirectory(Path.GetDirectoryName(full)!);

            var bytes = Encoding.ASCII.GetBytes(
                "%PDF-1.4\nKurul checks attachment A\n");

            await File.WriteAllBytesAsync(full, bytes);

            d.Attachments.Add(new Attachment
            {
                OriginalName = "test.pdf",
                StoredPath = relative,
                ContentType = "application/pdf",
                SizeBytes = bytes.Length,
                Sha256 = Sha256(bytes),
                UploadedById = users[0].Id
            });
        }

        if (approved)
        {
            foreach (var p in d.Participants)
            {
                p.Vote = dissent && p.UserId == users[2].Id
                    ? VoteType.Ret
                    : VoteType.Kabul;

                p.VoteReason = p.Vote == VoteType.Ret
                    ? "Karşı görüş"
                    : null;

                p.VotedAt = DateTime.UtcNow;
            }
        }

        // Eklerin gerçek Id değerleri de hash'ten önce oluşsun.
        await db.SaveChangesAsync();

        if (approved)
        {
            if (legacy)
            {
                d.Status = DecisionStatus.ImzaBekliyor;
                d.VoteOutcome =
                    DecisionRules.Compute(d.Participants).Outcome;
            }
            else
            {
                DecisionRules.RefreshStatus(d);
            }

            await db.SaveChangesAsync();
        }

        return d.Id;
    }

    async Task<SignaturePreparation> Prepare(int id, int userIndex)
    {
        var current = await Read(id);

        await using var db = Context();

        var response = await Controller(
            db, users[userIndex].Id, unit.Id)
            .PrepareSignature(
                id,
                new(current.RowVersion),
                default);

        ExpectStatus(response, 200, "İmza hazırlama");

        if (response is not ObjectResult
            {
                Value: SignaturePreparation prepared
            })
        {
            throw new InvalidOperationException(
                "İmza hazırlama yanıtının tipi geçersiz.");
        }

        return prepared;
    }

    async Task<IActionResult> Complete(
        int id,
        int userIndex,
        SignatureCompletion request)
    {
        await using var db = Context();

        return await Controller(db, users[userIndex].Id, unit.Id)
            .CompleteSignature(id, request, default);
    }

    async Task<SignatureCompletion> SignOne(int id, int userIndex)
    {
        var prepared = await Prepare(id, userIndex);
        var request = Completion(prepared);

        ExpectStatus(
            await Complete(id, userIndex, request),
            200,
            "Demo imzayı tamamlama");

        return request;
    }

    async Task<JsonElement> Verify(int id)
    {
        await using var db = Context();

        var response = await Controller(db, users[0].Id, unit.Id)
            .Verify(id);

        ExpectStatus(response, 200, "Belge doğrulama");
        return Body(response);
    }

    // ---------- Son iki oy yarışı ----------

    var voteId = await AddDecision(approved: false);

    await using (var db = Context())
    {
        var d = await db.Decisions
            .Include(x => x.Participants)
            .SingleAsync(x => x.Id == voteId);

        var chair = d.Participants.Single(p => p.IsChair);
        chair.Vote = VoteType.Kabul;
        chair.VotedAt = DateTime.UtcNow;

        d.Status = DecisionStatus.Oylamada;
        d.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
    }

    var voteVersion = (await Read(voteId)).RowVersion.ToArray();
    var voteGate = new TwoReadersGate();

    await using (var v1 = Context(voteGate))
    await using (var v2 = Context(voteGate))
    {
        var votes = await Task.WhenAll(
            Controller(v1, users[1].Id, unit.Id).Vote(
                voteId,
                new(VoteType.Kabul, null, voteVersion)),
            Controller(v2, users[2].Id, unit.Id).Vote(
                voteId,
                new(VoteType.Kabul, null, voteVersion)));

        Check(
            votes.Count(r => Status(r) == 200) == 1 &&
            votes.Count(r => Status(r) == 409) == 1,
            "Aynı sürümden son iki oy: biri kaydolur, diğeri 409 alır");
    }

    await using (var db = Context())
    {
        var d = await Read(voteId);
        var pending = d.Participants.Single(p => p.Vote == null);

        var result = await Controller(db, pending.UserId, unit.Id)
            .Vote(d.Id, new(VoteType.Kabul, null, d.RowVersion));

        Check(
            Status(result) == 200,
            "Çakışan oy güncel sürümle kaydedilebilir");
    }

    var ready = await Read(voteId);

    Check(
        ready.Status == DecisionStatus.ImzaBekliyor &&
        ready.Participants.All(p => p.Vote != null),
        "Son oy sonrası karar takılmadan ImzaBekliyor olur");

    Check(
        ready.SignatureVersion == 1 &&
        ready.SigningContentFrozenAt != null &&
        DecisionRules.SigningContentMatches(ready),
        "Son kabul oyuyla içerik özeti sabitlenir");

    var beforePdfHash = ready.SigningContentHash;

    // ---------- Oy sonrası, oylama bitmeden imza (ön imza) ----------

    var preId = await AddDecision(approved: false);

    await using (var db = Context())
    {
        var d = await db.Decisions
            .Include(x => x.Participants)
            .SingleAsync(x => x.Id == preId);

        var chair = d.Participants.Single(x => x.IsChair);
        chair.Vote = VoteType.Kabul;
        chair.VotedAt = DateTime.UtcNow;
        d.Status = DecisionStatus.Oylamada;
        d.SubmittedAt = DateTime.UtcNow;
        d.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
    }

    async Task<IActionResult> PreSign(int id, int userIndex, string password)
    {
        var current = await Read(id);
        await using var db = Context();
        return await Controller(db, users[userIndex].Id, unit.Id).PreSign(
            id,
            new(password, CheckSignaturePng, false, current.RowVersion),
            default);
    }

    async Task<IActionResult> CastVote(int id, int userIndex)
    {
        var current = await Read(id);
        await using var db = Context();
        return await Controller(db, users[userIndex].Id, unit.Id)
            .Vote(id, new(VoteType.Kabul, null, current.RowVersion));
    }

    ExpectStatus(await PreSign(preId, 1, CheckPassword), 409, "Oy kullanmadan ön imza");
    ExpectStatus(await PreSign(preId, 0, "yanlis-parola"), 422, "Hatalı parolayla ön imza");
    ExpectStatus(await PreSign(preId, 0, CheckPassword), 200, "Oy kullanan başkanın ön imzası");
    ExpectStatus(await PreSign(preId, 0, CheckPassword), 409, "Aynı üyenin ikinci ön imzası");

    var afterPre = await Read(preId);
    var chairPre = afterPre.Participants.Single(x => x.IsChair);
    Check(
        afterPre.Status == DecisionStatus.Oylamada &&
        chairPre.PreSignedAt != null &&
        chairPre.PreSignatureImagePng != null &&
        chairPre.SignedAt == null &&
        afterPre.SigningContentHash == null,
        "Ön imza oylama sürerken kaydedilir, içerik sabitlenmez");

    ExpectStatus(await CastVote(preId, 1), 200, "İkinci üyenin oyu");
    ExpectStatus(await PreSign(preId, 1, CheckPassword), 200, "İkinci üyenin ön imzası");
    ExpectStatus(await CastVote(preId, 2), 200, "Son oy");

    var bound = await Read(preId);
    var boundSigners = bound.Participants.Where(x => x.PreSignedAt != null).ToList();
    Check(
        bound.Status == DecisionStatus.ImzaBekliyor &&
        bound.SignatureVersion == 2 &&
        bound.SigningPdfHash != null &&
        boundSigners.Count == 2 &&
        boundSigners.All(x =>
            x.SignedAt != null &&
            x.SignatureImagePng != null &&
            DemoSignatureService.HasValidBinding(bound, x)) &&
        bound.Participants.Single(x => x.PreSignedAt == null).SignedAt == null,
        "Son oyla PDF sabitlenir ve ön imzalar karara geçerli olarak bağlanır");

    await SignOne(preId, 2);

    var preDone = await Read(preId);
    Check(
        preDone.Status == DecisionStatus.Imzalandi &&
        preDone.DocumentHash == DecisionRules.ComputeHash(preDone) &&
        preDone.Participants.All(x => DemoSignatureService.HasValidBinding(preDone, x)),
        "Ön imzalı karar, son üyenin imzasıyla tamamlanır ve mühürlenir");

    // ---------- Son iki imza yarışı ----------

    var firstPreparation = await Prepare(voteId, 0);
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
        "İlk PDF bağlantılı imza");

    var prepared1 = await Prepare(voteId, 1);
    var prepared2 = await Prepare(voteId, 2);

    Check(
        prepared1.ContentHash == originalContentHash &&
        prepared2.ContentHash == originalContentHash,
        "İmza ve hazırlık kayıtları sabit içerik özetini değiştirmez");

    var completion1 = Completion(prepared1);
    var completion2 = Completion(prepared2);
    var signGate = new TwoReadersGate();

    await using (var s1 = Context(signGate))
    await using (var s2 = Context(signGate))
    {
        var results = await Task.WhenAll(
            Controller(s1, users[1].Id, unit.Id)
                .CompleteSignature(voteId, completion1, default),
            Controller(s2, users[2].Id, unit.Id)
                .CompleteSignature(voteId, completion2, default));

        Check(
            results.All(r => Status(r) == 200),
            "Son iki içerik bağlantılı demo imza eşzamanlı tamamlanır");
    }

    var sealedDecision = await Read(voteId);

    Check(
        sealedDecision.Status == DecisionStatus.Imzalandi &&
        sealedDecision.SealedAt != null &&
        sealedDecision.Participants.All(
            p => DemoSignatureService.HasValidBinding(sealedDecision, p)),
        "Son imzalar sonrası tüm içerik bağlantıları geçerlidir ve karar mühürlenir");

    Check(
        sealedDecision.SigningContentHash == originalContentHash &&
        sealedDecision.DocumentHash ==
            DecisionRules.ComputeHash(sealedDecision),
        "Veritabanından yeniden okunan içerik ve son belge özetleri doğrulanır");

    var verification = await Verify(voteId);

    Check(
        verification.GetProperty("valid").GetBoolean() &&
        !verification.GetProperty("legacy").GetBoolean(),
        "Yeni imza yöntemi doğrulama uç noktasından geçer");

    Check(
        sealedDecision.SigningPdfBytes!.SequenceEqual(originalPdf) &&
        verification.GetProperty("pdfBound").GetBoolean() &&
        verification.GetProperty("pdfValid").GetBoolean(),
        "Tüm imzalardan sonra PDF baytları aynıdır ve PDF bağlantısı doğrulanır");

    var sealedVersion = sealedDecision.RowVersion.ToArray();

    var repeated = await Complete(voteId, 2, completion2);
    var afterRepeated = await Read(voteId);

    Check(
        Status(repeated) == 200 &&
        afterRepeated.RowVersion.SequenceEqual(sealedVersion) &&
        afterRepeated.DocumentHash == sealedDecision.DocumentHash,
        "Tamamlanmış imza isteğini tekrar göndermek belgeyi değiştirmez");

    await using (var db = Context())
    {
        var result = await Controller(db, users[0].Id, unit.Id)
            .Cancel(voteId, new("Test", afterRepeated.RowVersion));

        Check(
            Status(result) == 409,
            "İmzalanmış karar iptal edilemez");
    }

    // ---------- Aynı üyenin aynı isteği eşzamanlı göndermesi ----------

    var duplicateId = await AddDecision();
    var duplicatePreparation = await Prepare(duplicateId, 0);
    var duplicateRequest = Completion(duplicatePreparation);
    var duplicateGate = new TwoReadersGate();

    await using (var d1 = Context(duplicateGate))
    await using (var d2 = Context(duplicateGate))
    {
        var results = await Task.WhenAll(
            Controller(d1, users[0].Id, unit.Id)
                .CompleteSignature(duplicateId, duplicateRequest, default),
            Controller(d2, users[0].Id, unit.Id)
                .CompleteSignature(duplicateId, duplicateRequest, default));

        Check(
            results.All(r => Status(r) == 200),
            "Aynı imza isteğinin eşzamanlı tekrarı güvenle sonuçlanır");
    }

    var duplicateDecision = await Read(duplicateId);

    await using (var db = Context())
    {
        var detail =
            $"Karar #{duplicateId} " +
            $"({duplicateDecision.MeetingYear}/" +
            $"{duplicateDecision.MeetingNo}-{duplicateDecision.DecisionNo})";

        var logCount = await db.AuditLogs.CountAsync(l =>
            l.Detail == detail &&
            l.Message.StartsWith("İmza kaydedildi:"));

        Check(
            duplicateDecision.Participants.Count(
                p => p.SignedAt != null) == 1 &&
            logCount == 1,
            "Tekrarlanan istek yalnızca bir imza ve bir imza logu oluşturur");
    }

    // ---------- Yanlış kullanıcı, karar, özet ve yanıt ----------

    var invalidId = await AddDecision();
    var invalidPreparation = await Prepare(invalidId, 0);
    var validRequest = Completion(invalidPreparation);

    Check(
        Status(await Complete(invalidId, 1, validRequest)) == 400,
        "Başka üyeye ait hazırlıkla imza atılamaz");

    var otherDecisionId = await AddDecision();

    Check(
        Status(await Complete(otherDecisionId, 0, validRequest)) == 400,
        "Hazırlık başka bir karar için kullanılamaz");

    Check(
        Status(await Complete(
            invalidId,
            0,
            validRequest with { ContentHash = new string('0', 64) })) == 400,
        "Yanlış içerik özeti reddedilir");

    Check(
        Status(await Complete(
            invalidId,
            0,
            validRequest with { SignatureData = new string('0', 64) })) == 400,
        "Değiştirilmiş demo yanıtı reddedilir");

    Check(
        Status(await Complete(
            invalidId,
            0,
            validRequest with { ChallengeId = Guid.NewGuid() })) == 400,
        "Bilinmeyen hazırlık kimliği reddedilir");

    Check(
        (await Read(invalidId)).Participants.All(p => p.SignedAt == null) &&
        (await Read(otherDecisionId)).Participants.All(p => p.SignedAt == null),
        "Reddedilen tamamlama istekleri imza kaydı oluşturmaz");

    // ---------- Süresi dolmuş hazırlık ----------

    var expiredId = await AddDecision();
    var expiredPreparation = await Prepare(expiredId, 0);

    await using (var db = Context())
    {
        var p = await db.DecisionParticipants.SingleAsync(x =>
            x.DecisionId == expiredId &&
            x.UserId == users[0].Id);

        p.SignatureChallengeExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
    }

    Check(
        Status(await Complete(
            expiredId, 0, Completion(expiredPreparation))) == 400,
        "Süresi dolmuş hazırlıkla imza tamamlanamaz");

    var renewed = await Prepare(expiredId, 0);

    Check(
        renewed.ChallengeId != expiredPreparation.ChallengeId &&
        renewed.ExpiresAt > DateTime.UtcNow,
        "Süresi dolan hazırlık yeni kimlikle yenilenir");

    Check(
        Status(await Complete(
            expiredId, 0, Completion(renewed))) == 200,
        "Yenilenen hazırlıkla imza tamamlanabilir");

    // ---------- Hazırlık sonrasında karar metninin değişmesi ----------

    var changedTextId = await AddDecision();
    var textPreparation = await Prepare(changedTextId, 0);

    await using (var db = Context())
    {
        var d = await db.Decisions.SingleAsync(x => x.Id == changedTextId);
        d.Content += " Değiştirilmiş içerik.";
        await db.SaveChangesAsync();
    }

    Check(
        Status(await Complete(
            changedTextId, 0, Completion(textPreparation))) == 409,
        "Hazırlıktan sonra karar metni değişirse imza engellenir");

    Check(
        (await Read(changedTextId)).Participants.All(p => p.SignedAt == null),
        "İçeriği değişen karara imza yazılmaz");

    // ---------- Gerçek dosya bütünlüğü ----------

    var fileId = await AddDecision(withAttachment: true);
    var filePreparation = await Prepare(fileId, 0);

    var fileDecision = await Read(fileId);
    var attachment = fileDecision.Attachments.Single();

    var filePath = Path.Combine(
        storageRoot,
        attachment.StoredPath.Replace('/', Path.DirectorySeparatorChar));

    var originalBytes = await File.ReadAllBytesAsync(filePath);
    var changedBytes = originalBytes.ToArray();

    // Boyutu aynı tut: sadece boyut kontrolünün yeterli olmadığını sınar.
    changedBytes[^2] ^= 1;
    await File.WriteAllBytesAsync(filePath, changedBytes);

    Check(
        Status(await Complete(
            fileId, 0, Completion(filePreparation))) == 409,
        "Ek dosyanın aynı boyuttaki içerik değişikliği imzayı engeller");

    await using (var db = Context())
    {
        var current = await Read(fileId);

        var result = await Controller(db, users[1].Id, unit.Id)
            .PrepareSignature(
                fileId,
                new(current.RowVersion),
                default);

        Check(
            Status(result) == 409,
            "Değiştirilmiş ek dosya varken yeni hazırlık da yapılamaz");
    }

    File.Delete(filePath);

    Check(
        Status(await Complete(
            fileId, 0, Completion(filePreparation))) == 409,
        "Eksik ek dosya imzayı engeller");

    await File.WriteAllBytesAsync(filePath, originalBytes);

    ExpectStatus(
        await Complete(fileId, 0, Completion(filePreparation)),
        200,
        "Doğru ek geri geldikten sonra imza");

    await SignOne(fileId, 1);
    await SignOne(fileId, 2);

    Check(
        (await Verify(fileId)).GetProperty("valid").GetBoolean(),
        "Ekli kararın tamamlanmış imzası doğrulanır");

    await File.WriteAllBytesAsync(filePath, changedBytes);

    var brokenFileVerification = await Verify(fileId);

    Check(
        !brokenFileVerification.GetProperty("valid").GetBoolean() &&
        !brokenFileVerification.GetProperty("attachmentsValid").GetBoolean(),
        "Mühürden sonraki fiziksel dosya değişikliği doğrulamada bulunur");

    await File.WriteAllBytesAsync(filePath, originalBytes);

    // ---------- Eski kararların geçiş davranışı ----------

    var legacyUnsignedId = await AddDecision(legacy: true);

    Check(
        (await Read(legacyUnsignedId)).SignatureVersion == null,
        "Eski imzasız karar başlangıçta eski yöntem olarak durur");

    await Prepare(legacyUnsignedId, 0);
    var migratedUnsigned = await Read(legacyUnsignedId);

    Check(
        migratedUnsigned.SignatureVersion == 2 &&
        DecisionRules.SigningPdfMatches(migratedUnsigned) &&
        migratedUnsigned.SigningContentFrozenAt != null &&
        DecisionRules.SigningContentMatches(migratedUnsigned),
        "Eski imzasız karar hazırlık sırasında yeni yönteme alınabilir");

    var legacyPartialId = await AddDecision(legacy: true);

    await using (var db = Context())
    {
        var d = await db.Decisions
            .Include(x => x.Participants)
            .SingleAsync(x => x.Id == legacyPartialId);

        var chair = d.Participants.Single(p => p.IsChair);
        chair.SignedAt = DateTime.UtcNow;
        chair.SignatureRef = "DEMO-old-partial";

        await db.SaveChangesAsync();
    }

    await using (var db = Context())
    {
        var current = await Read(legacyPartialId);

        var result = await Controller(db, users[1].Id, unit.Id)
            .PrepareSignature(
                legacyPartialId,
                new(current.RowVersion),
                default);

        Check(
            Status(result) == 409,
            "Eski kısmi imzalar yeni yöntemle karıştırılamaz");
    }

    var unchangedLegacy = await Read(legacyPartialId);

    Check(
        unchangedLegacy.SignatureVersion == null &&
        unchangedLegacy.SigningContentHash == null &&
        unchangedLegacy.Participants.Single(p => p.IsChair).SignatureRef ==
            "DEMO-old-partial",
        "Reddedilen geçiş eski imza geçmişini değiştirmez");

    var legacySealedId = await AddDecision(legacy: true);

    await using (var db = Context())
    {
        var d = await db.Decisions
            .Include(x => x.Participants)
            .Include(x => x.Attachments)
            .SingleAsync(x => x.Id == legacySealedId);

        var now = DateTime.UtcNow;

        foreach (var p in d.Participants)
        {
            p.SignedAt = now;
            p.SignatureRef = $"DEMO-old-{p.UserId}";
        }

        d.Status = DecisionStatus.Imzalandi;
        d.SignedAt = now;
        d.SealedAt = now;

        // Üretimdeki yeni hash metodunu kullanmadan eski belgeyi oluştur.
        d.DocumentHash = LegacyHash(d);

        await db.SaveChangesAsync();
    }

    var legacyVerification = await Verify(legacySealedId);

    Check(
        legacyVerification.GetProperty("valid").GetBoolean() &&
        legacyVerification.GetProperty("legacy").GetBoolean(),
        "Eski tamamlanmış karar eski hash yöntemiyle doğrulanır");

    // ---------- İptal ve yeniden değerlendirme ----------

    var cancelledId = await AddDecision();
    var firstSignature = await SignOne(cancelledId, 0);
    var pendingPreparation = await Prepare(cancelledId, 2);
    var beforeCancel = await Read(cancelledId);

    var oldChair = beforeCancel.Participants.Single(p => p.IsChair);

    await using (var db = Context())
    {
        var denied = await Controller(
            db, users[1].Id, unit.Id, admin: false)
            .Cancel(cancelledId, new("Test", beforeCancel.RowVersion));

        Check(
            Status(denied) == 403,
            "Normal üye süreci iptal edemez");
    }

    await using (var db = Context())
    {
        var result = await Controller(db, users[0].Id, unit.Id)
            .Cancel(
                cancelledId,
                new("Üye görevden ayrıldı", beforeCancel.RowVersion));

        Check(
            Status(result) == 200,
            "Admin gerekçeli iptal yapabilir");
    }

    var cancelled = await Read(cancelledId);
    var cancelledChair = cancelled.Participants.Single(p => p.IsChair);

    Check(
        cancelled.Status == DecisionStatus.IptalEdildi &&
        cancelled.Participants.All(p => p.Vote == VoteType.Kabul) &&
        cancelledChair.SignatureRef == oldChair.SignatureRef &&
        cancelledChair.SignedContentHash == oldChair.SignedContentHash &&
        cancelled.SigningContentHash == beforeCancel.SigningContentHash,
        "İptalde oylar, kısmi imzalar ve sabit içerik özeti korunur");

    Check(
        Status(await Complete(
            cancelledId, 2, Completion(pendingPreparation))) == 409,
        "İptalden önce hazırlanmış imza iptalden sonra tamamlanamaz");

    Check(
        Status(await Complete(cancelledId, 0, firstSignature)) == 409,
        "Eski başarılı imzayı tekrar göndererek iptal aşılamaz");

    int reopenedId;

    await using (var db = Context())
    {
        var current = await Read(cancelledId);

        var response = await Controller(db, users[0].Id, unit.Id)
            .Reconsider(
                cancelledId,
                new(new DateOnly(2026, 10, 16), null, current.RowVersion));

        Check(
            Status(response) == 201,
            "İptal edilen karardan yeni taslak oluşturulur");
    }

    var sourceAfterReopen = await Read(cancelledId);
    reopenedId = sourceAfterReopen.ReconsiderationDecisionId!.Value;

    var reopened = await Read(reopenedId);

    Check(
        reopened.SourceDecisionId == cancelledId &&
        reopened.Status == DecisionStatus.Taslak &&
        reopened.SignatureVersion == null &&
        reopened.SigningContentHash == null &&
        reopened.SigningContentFrozenAt == null &&
        reopened.SigningPdfBytes == null &&
        reopened.SigningPdfHash == null &&
        reopened.SigningPdfFrozenAt == null &&
        reopened.Participants.All(p =>
            p.Vote == null &&
            p.SignedAt == null &&
            p.SignatureRef == null &&
            p.SignedContentHash == null &&
            p.SignatureData == null &&
            p.SignatureChallengeId == null &&
            p.SignatureChallengeExpiresAt == null),
        "Yeni taslak oy, imza, içerik özeti ve hazırlık kayıtlarını devralmaz");

    await using (var db = Context())
    {
        var again = await Controller(db, users[0].Id, unit.Id)
            .Reconsider(
                cancelledId,
                new(
                    new DateOnly(2026, 10, 16),
                    null,
                    sourceAfterReopen.RowVersion));

        Check(
            Status(again) == 200 &&
            await db.Decisions.CountAsync(
                x => x.SourceDecisionId == cancelledId) == 1,
            "Tekrarlanan yeniden değerlendirme ikinci taslak oluşturmaz");
    }

    await using (var db = Context())
    {
        var deletion = await Controller(db, users[0].Id, unit.Id)
            .DeleteDraft(reopenedId, new(reopened.RowVersion));

        Check(
            Status(deletion) == 200 &&
            (await Read(cancelledId)).ReconsiderationDecisionId == null,
            "Bağlı taslak silinirse kaynak bağlantısı temizlenir");
    }

    // ---------- Son imza ile iptal yarışı ----------

    var racingId = await AddDecision();

    await SignOne(racingId, 0);
    await SignOne(racingId, 1);

    var racingPreparation = await Prepare(racingId, 2);
    var racingRequest = Completion(racingPreparation);

    // Hazırlık da RowVersion değiştirdiği için sürümü bundan sonra al.
    var racingVersion = (await Read(racingId)).RowVersion;
    var cancelGate = new TwoReadersGate();

    await using (var c1 = Context(cancelGate))
    await using (var c2 = Context(cancelGate))
    {
        var competing = await Task.WhenAll(
            Controller(c1, users[0].Id, unit.Id)
                .Cancel(racingId, new("İptal yarışı", racingVersion)),
            Controller(c2, users[2].Id, unit.Id)
                .CompleteSignature(racingId, racingRequest, default));

        Check(
            competing.Count(r => Status(r) == 200) == 1 &&
            competing.Count(r => Status(r) == 409) == 1,
            "Son imza ile iptal yarışında yalnızca biri başarılı olur");
    }

    var racing = await Read(racingId);

    Check(
        (racing.Status == DecisionStatus.Imzalandi &&
         racing.CancelledAt == null &&
         racing.DocumentHash == DecisionRules.ComputeHash(racing) &&
         racing.Participants.All(
             p => DemoSignatureService.HasValidBinding(racing, p))) ||
        (racing.Status == DecisionStatus.IptalEdildi &&
         racing.DocumentHash == null &&
         racing.SealedAt == null &&
         racing.Participants.Count(p => p.SignedAt != null) == 2),
        "İptal/imza yarışından tutarlı tek son durum çıkar");

    // ---------- Ret oyu veren üyenin imzası ----------

    var dissentId = await AddDecision(dissent: true);

    await SignOne(dissentId, 0);
    await SignOne(dissentId, 1);
    await SignOne(dissentId, 2);

    var dissentDecision = await Read(dissentId);
    var dissentingMember = dissentDecision.Participants.Single(
        p => p.UserId == users[2].Id);

    Check(
        dissentDecision.Status == DecisionStatus.Imzalandi &&
        dissentingMember.Vote == VoteType.Ret &&
        DemoSignatureService.HasValidBinding(
            dissentDecision, dissentingMember),
        "Ret oyu veren üye kabul edilmiş kararı imzalayabilir");

    // ---------- PDF v2 ek kontrolleri ----------

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
            NullLogger<DecisionPdfController>.Instance,
            configuration)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = Controller(db, users[0].Id, unit.Id).User
                }
            }
        };

        // İmzaya esas sabit PDF (imzalı kopya ayrıca üretilir).
        return await controller.Download(id, default, original: true);
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

    // ---------- Eski tek aşamalı uç nokta ----------

    await using (var db = Context())
    {
        var response = await Controller(db, users[0].Id, unit.Id)
            .Sign(invalidId, new("1234"), default);

        Check(
            Status(response) == 410,
            "Eski tek aşamalı imza uç noktası yeni akışı atlayamaz");
    }

    // ---------- Toplantı yönetimi ----------

    MeetingsController MeetingController(
        AppDbContext db, int userId, int unitId) =>
        new MeetingsController(db, new PermissionService(db))
        {
            ControllerContext = Controller(db, userId, unitId).ControllerContext
        };

    async Task<Meeting> ReadMeeting(int id)
    {
        await using var db = Context();

        return await db.Meetings
            .AsNoTracking()
            .Include(m => m.Participants)
            .SingleAsync(m => m.Id == id);
    }

    async Task<int> CreateMeeting(DateOnly date)
    {
        await using var db = Context();

        var response = await MeetingController(db, users[0].Id, unit.Id)
            .Create(new(date, null), default);

        ExpectStatus(response, 201, "Toplantı oluşturma");
        return Body(response).GetProperty("Id").GetInt32();
    }

    async Task<(int Id, int No)> AddMeetingDecision(
        int targetMeetingId, string agenda)
    {
        await using var db = Context();

        var response = await Controller(db, users[0].Id, unit.Id)
            .Create(new(default, null, agenda, null, null, null, null, null,
                targetMeetingId));

        ExpectStatus(response, 201, "Toplantıya karar ekleme");

        var body = Body(response);

        return (
            body.GetProperty("Id").GetInt32(),
            body.GetProperty("DecisionNo").GetInt32());
    }

    var meetingDate = new DateOnly(2027, 3, 1);
    var meetingId = await CreateMeeting(meetingDate);
    var createdMeeting = await ReadMeeting(meetingId);

    Check(
        createdMeeting.MeetingYear == 2027 &&
        createdMeeting.MeetingNo == 1 &&
        createdMeeting.MeetingDate == meetingDate &&
        createdMeeting.Participants.Count == 3 &&
        createdMeeting.Participants.Count(p => p.IsChair) == 1 &&
        createdMeeting.LastDecisionNo == 0 &&
        createdMeeting.AttendanceLockedAt == null,
        "Toplantı güncel kurul üyeleriyle ve tek başkanla oluşturulur");

    await using (var db = Context())
    {
        var duplicate = await MeetingController(db, users[0].Id, unit.Id)
            .Create(new(meetingDate, 1), default);

        Check(
            Status(duplicate) == 409,
            "Aynı kurul, yıl ve numarayla ikinci toplantı oluşturulamaz");
    }

    await using (var db = Context())
    {
        // 2026/1 numarası geçmiş kararlarda kullanılıyor.
        var oldNumber = await MeetingController(db, users[0].Id, unit.Id)
            .Create(new(new DateOnly(2026, 10, 20), 1), default);

        Check(
            Status(oldNumber) == 409,
            "Geçmiş kararların kullandığı numara yeni toplantıya verilmez");
    }

    var first = await AddMeetingDecision(meetingId, "Toplantı kararı 1");
    var second = await AddMeetingDecision(meetingId, "Toplantı kararı 2");

    var firstDecision = await Read(first.Id);

    Check(
        first.No == 1 &&
        second.No == 2 &&
        firstDecision.MeetingId == meetingId &&
        firstDecision.MeetingYear == 2027 &&
        firstDecision.MeetingNo == createdMeeting.MeetingNo &&
        firstDecision.MeetingDate == meetingDate &&
        firstDecision.Participants.Count == 3 &&
        (await ReadMeeting(meetingId)).LastDecisionNo == 2,
        "Aynı toplantıya bağlı kararlar tarih, numara ve katılımı toplantıdan alır");

    await using (var db = Context())
    {
        var legacy = await Controller(db, users[0].Id, unit.Id)
            .Create(new(meetingDate, 1, "Toplantısız deneme",
                null, null, null, null, null));

        Check(
            Status(legacy) == 409,
            "Toplantısız eski akış bir toplantının numarasını kullanamaz");
    }

    // Aynı toplantıya iki karar aynı anda eklenir.
    var createGate = new TwoReadersGate();

    await using (var raceA = Context(createGate))
    await using (var raceB = Context(createGate))
    {
        var results = await Task.WhenAll(
            Controller(raceA, users[0].Id, unit.Id).Create(
                new(default, null, "Yarış kararı 1",
                    null, null, null, null, null, meetingId)),
            Controller(raceB, users[1].Id, unit.Id).Create(
                new(default, null, "Yarış kararı 2",
                    null, null, null, null, null, meetingId)));

        Check(
            results.All(r => Status(r) == 201),
            "Aynı toplantıya aynı anda eklenen iki karar da kaydedilir");
    }

    await using (var db = Context())
    {
        var numbers = await db.Decisions
            .Where(d => d.MeetingId == meetingId)
            .Select(d => d.DecisionNo)
            .OrderBy(n => n)
            .ToListAsync();

        Check(
            numbers.SequenceEqual(new[] { 1, 2, 3, 4 }) &&
            (await ReadMeeting(meetingId)).LastDecisionNo == 4,
            "Eşzamanlı eklemede karar numaraları çakışmaz ve atlanmaz");
    }

    // Toplantı katılımı oy başlamamış kararlara yansır.
    var meetingBeforeAttendance = await ReadMeeting(meetingId);

    await using (var db = Context())
    {
        var result = await MeetingController(db, users[0].Id, unit.Id)
            .SetAttendance(
                meetingId,
                new(
                    users[2].Id,
                    AttendanceStatus.Izinli,
                    meetingBeforeAttendance.RowVersion),
                default);

        Check(
            Status(result) == 200,
            "Toplantı katılımı oylama başlamadan değiştirilebilir");
    }

    await using (var db = Context())
    {
        var decisions = await db.Decisions
            .Include(d => d.Participants)
            .Where(d => d.MeetingId == meetingId)
            .ToListAsync();

        Check(
            decisions.Count == 4 &&
            decisions.All(d => d.Participants.Single(
                p => p.UserId == users[2].Id).Attendance ==
                AttendanceStatus.Izinli),
            "Toplantı katılım değişikliği oy başlamamış tüm kararlara yansır");
    }

    await using (var db = Context())
    {
        var stale = await MeetingController(db, users[0].Id, unit.Id)
            .SetAttendance(
                meetingId,
                new(
                    users[2].Id,
                    AttendanceStatus.Katilir,
                    meetingBeforeAttendance.RowVersion),
                default);

        Check(
            Status(stale) == 409,
            "Eski toplantı sürümüyle katılım değişikliği reddedilir");
    }

    await using (var db = Context())
    {
        var current = await Read(first.Id);

        var perDecision = await Controller(db, users[0].Id, unit.Id)
            .SetAttendance(
                first.Id,
                new(users[2].Id, AttendanceStatus.Katilir, current.RowVersion));

        Check(
            Status(perDecision) == 409,
            "Toplantıya bağlı kararın katılımı karar ekranından değiştirilemez");
    }

    // Üyeyi geri katılır yap, sonra ilk oy toplantıyı kilitlesin.
    var meetingForRestore = await ReadMeeting(meetingId);

    await using (var db = Context())
    {
        var restore = await MeetingController(db, users[0].Id, unit.Id)
            .SetAttendance(
                meetingId,
                new(
                    users[2].Id,
                    AttendanceStatus.Katilir,
                    meetingForRestore.RowVersion),
                default);

        ExpectStatus(restore, 200, "Katılımı geri alma");
    }

    var beforeFirstVote = await Read(first.Id);

    await using (var db = Context())
    {
        var vote = await Controller(db, users[0].Id, unit.Id)
            .Vote(
                first.Id,
                new(VoteType.Kabul, null, beforeFirstVote.RowVersion));

        Check(
            Status(vote) == 200,
            "Toplantıdaki ilk oy kaydedilir");
    }

    var lockedMeeting = await ReadMeeting(meetingId);

    Check(
        lockedMeeting.AttendanceLockedAt != null,
        "İlk oy toplantının katılım listesini kilitler");

    await using (var db = Context())
    {
        var afterLock = await MeetingController(db, users[0].Id, unit.Id)
            .SetAttendance(
                meetingId,
                new(
                    users[1].Id,
                    AttendanceStatus.Izinli,
                    lockedMeeting.RowVersion),
                default);

        Check(
            Status(afterLock) == 409,
            "Kilitlenen toplantının katılımı değiştirilemez");
    }

    // Katılım değişikliği ile ilk oy aynı anda gelir.
    var raceMeetingId = await CreateMeeting(new DateOnly(2027, 4, 1));
    var raceDecisionInfo = await AddMeetingDecision(
        raceMeetingId, "Katılım ve oy yarışı");

    var raceDecisionBefore = await Read(raceDecisionInfo.Id);
    var raceMeetingBefore = await ReadMeeting(raceMeetingId);
    var attendanceVoteGate = new TwoReadersGate();

    await using (var attendanceContext = Context(attendanceVoteGate))
    await using (var voteContext = Context(attendanceVoteGate))
    {
        var results = await Task.WhenAll(
            MeetingController(attendanceContext, users[0].Id, unit.Id)
                .SetAttendance(
                    raceMeetingId,
                    new(
                        users[2].Id,
                        AttendanceStatus.Izinli,
                        raceMeetingBefore.RowVersion),
                    default),
            Controller(voteContext, users[0].Id, unit.Id)
                .Vote(
                    raceDecisionInfo.Id,
                    new(
                        VoteType.Kabul,
                        null,
                        raceDecisionBefore.RowVersion)));

        var raceDecisionAfter = await Read(raceDecisionInfo.Id);
        var raceMeetingAfter = await ReadMeeting(raceMeetingId);

        var voted = raceDecisionAfter.Participants.Any(p => p.Vote != null);

        var meetingAbsent = raceMeetingAfter.Participants
            .Single(p => p.UserId == users[2].Id).Attendance ==
            AttendanceStatus.Izinli;

        var decisionAttendance = raceDecisionAfter.Participants
            .Single(p => p.UserId == users[2].Id).Attendance;

        var meetingAttendance = raceMeetingAfter.Participants
            .Single(p => p.UserId == users[2].Id).Attendance;

        Check(
            results.Count(r => Status(r) == 200) == 1 &&
            results.Count(r => Status(r) == 409) == 1,
            "Katılım değişikliği ile ilk oy yarışında yalnızca biri başarılı olur");

        Check(
            voted != meetingAbsent &&
            decisionAttendance == meetingAttendance &&
            (voted
                ? raceMeetingAfter.AttendanceLockedAt != null
                : raceMeetingAfter.AttendanceLockedAt == null),
            "Yarıştan toplantı, katılım ve oy durumu birbiriyle tutarlı çıkar");
    }

    // Yeniden değerlendirme bir toplantının numarasını alamaz.
    var cancelledNow = await Read(cancelledId);

    await using (var db = Context())
    {
        var blocked = await Controller(db, users[0].Id, unit.Id)
            .Reconsider(
                cancelledId,
                new(new DateOnly(2027, 3, 5), 1, cancelledNow.RowVersion));

        Check(
            Status(blocked) == 409,
            "Yeniden değerlendirme taslağı bir toplantının numarasını kullanamaz");
    }

    // ---------- Toplantıya bağlı yeniden değerlendirme ----------

    var reconsiderMeetingId = await CreateMeeting(
        new DateOnly(2028, 5, 10));

    var reconsiderMeetingBefore = await ReadMeeting(
        reconsiderMeetingId);

    // Hedef toplantının katılımını kaynak karardan farklı yap.
    // Böylece yeni taslağın hangi katılımı kullandığını sınarız.
    await using (var db = Context())
    {
        var attendanceResponse = await MeetingController(
         db, users[0].Id, unit.Id)
     .SetAttendance(
         reconsiderMeetingId,
         new(
             users[2].Id,
             AttendanceStatus.Izinli,
             reconsiderMeetingBefore.RowVersion),
         default);

        ExpectStatus(
            attendanceResponse,
            200,
            "Yeniden değerlendirme toplantısının katılımını ayarlama");
    }

    var targetMeeting = await ReadMeeting(reconsiderMeetingId);
    var sourceBeforeMeetingReconsider = await Read(cancelledId);

    Check(
        sourceBeforeMeetingReconsider.ReconsiderationDecisionId == null &&
        sourceBeforeMeetingReconsider.SigningPdfBytes != null &&
        sourceBeforeMeetingReconsider.Participants.Any(
            p => p.SignedAt != null),
        "Test kaynağında eski imza ve PDF vardır; bağlı taslak yoktur");

    int meetingReconsideredId;

    await using (var db = Context())
    {
        var response = await Controller(db, users[0].Id, unit.Id)
            .Reconsider(
                cancelledId,
                new(
                    targetMeeting.MeetingDate,
                    targetMeeting.MeetingNo,
                    sourceBeforeMeetingReconsider.RowVersion,
                    reconsiderMeetingId));

        ExpectStatus(
            response,
            201,
            "Toplantıya bağlı yeniden değerlendirme oluşturma");

        meetingReconsideredId =
            Body(response).GetProperty("Id").GetInt32();
    }

    var meetingReconsidered = await Read(meetingReconsideredId);
    var sourceAfterMeetingReconsider = await Read(cancelledId);

    Check(
        meetingReconsidered.MeetingId == reconsiderMeetingId &&
        meetingReconsidered.MeetingDate == targetMeeting.MeetingDate &&
        meetingReconsidered.MeetingYear == targetMeeting.MeetingYear &&
        meetingReconsidered.MeetingNo == targetMeeting.MeetingNo &&
        meetingReconsidered.DecisionNo == 1 &&
        meetingReconsidered.SourceDecisionId == cancelledId &&
        sourceAfterMeetingReconsider.ReconsiderationDecisionId ==
            meetingReconsideredId,
        "Yeniden değerlendirme taslağı hedef toplantıya ve kaynağına bağlanır");

    Check(
        meetingReconsidered.Participants.Count ==
            targetMeeting.Participants.Count &&
        meetingReconsidered.Participants.All(p =>
            targetMeeting.Participants.Any(m =>
                m.UserId == p.UserId &&
                m.DisplayName == p.DisplayName &&
                m.Duty == p.Duty &&
                m.SortOrder == p.SortOrder &&
                m.IsChair == p.IsChair &&
                m.Attendance == p.Attendance)) &&
        meetingReconsidered.Participants.Single(
            p => p.UserId == users[2].Id).Attendance ==
                AttendanceStatus.Izinli,
        "Yeni taslak katılımı kaynak karardan değil hedef toplantıdan alır");

    Check(
        meetingReconsidered.Agenda ==
            sourceBeforeMeetingReconsider.Agenda &&
        meetingReconsidered.Reference ==
            sourceBeforeMeetingReconsider.Reference &&
        meetingReconsidered.Content ==
            sourceBeforeMeetingReconsider.Content &&
        meetingReconsidered.TableColumnsJson ==
            sourceBeforeMeetingReconsider.TableColumnsJson &&
        meetingReconsidered.TableRowsJson ==
            sourceBeforeMeetingReconsider.TableRowsJson,
        "Toplantıya bağlı yeniden değerlendirmede karar metni ve tablo korunur");

    Check(
        meetingReconsidered.Status == DecisionStatus.Taslak &&
        meetingReconsidered.VoteOutcome == null &&
        meetingReconsidered.SignatureVersion == null &&
        meetingReconsidered.SigningContentHash == null &&
        meetingReconsidered.SigningContentFrozenAt == null &&
        meetingReconsidered.SigningPdfBytes == null &&
        meetingReconsidered.SigningPdfHash == null &&
        meetingReconsidered.SigningPdfFrozenAt == null &&
        meetingReconsidered.DocumentHash == null &&
        meetingReconsidered.SignedAt == null &&
        meetingReconsidered.SealedAt == null &&
        meetingReconsidered.Attachments.Count == 0 &&
        meetingReconsidered.Participants.All(p =>
            p.Vote == null &&
            string.IsNullOrEmpty(p.VoteReason) &&
            p.VotedAt == null &&
            p.SignedAt == null &&
            p.SignatureRef == null &&
            p.SignedContentHash == null &&
            p.SignatureData == null &&
            p.SignatureChallengeId == null &&
            p.SignatureChallengeExpiresAt == null),
        "Yeni toplantı taslağı eski oyları, imzaları, PDF'yi ve ekleri devralmaz");

    Check(
        sourceAfterMeetingReconsider.Status ==
            sourceBeforeMeetingReconsider.Status &&
        sourceAfterMeetingReconsider.SigningContentHash ==
            sourceBeforeMeetingReconsider.SigningContentHash &&
        sourceAfterMeetingReconsider.SigningPdfHash ==
            sourceBeforeMeetingReconsider.SigningPdfHash &&
        sourceAfterMeetingReconsider.SigningPdfBytes!
            .SequenceEqual(
                sourceBeforeMeetingReconsider.SigningPdfBytes!) &&
        sourceAfterMeetingReconsider.Participants.All(p =>
            sourceBeforeMeetingReconsider.Participants.Any(old =>
                old.UserId == p.UserId &&
                old.Vote == p.Vote &&
                old.SignedAt == p.SignedAt &&
                old.SignatureRef == p.SignatureRef &&
                old.SignatureData == p.SignatureData)),
        "Yeniden değerlendirme kaynak kararın oylarını, imzalarını ve PDF'sini değiştirmez");

    // Aynı isteği, ilk istekte kullanılan sürümle tekrar gönder.
    // Aynı isteği, ilk istekte kullanılan sürümle tekrar gönder.
    await using (var db = Context())
    {
        var meetingReconsiderRepeatResponse =
            await Controller(db, users[0].Id, unit.Id)
                .Reconsider(
                    cancelledId,
                    new(
                        targetMeeting.MeetingDate,
                        targetMeeting.MeetingNo,
                        sourceBeforeMeetingReconsider.RowVersion,
                        reconsiderMeetingId));

        Check(
            Status(meetingReconsiderRepeatResponse) == 200 &&
            Body(meetingReconsiderRepeatResponse)
                .GetProperty("Id").GetInt32() ==
                    meetingReconsideredId &&
            await db.Decisions.CountAsync(
                d => d.SourceDecisionId == cancelledId) == 1 &&
            (await ReadMeeting(reconsiderMeetingId)).LastDecisionNo == 1,
            "Aynı yeniden değerlendirme isteği ikinci taslak veya karar numarası üretmez");
    }

    await using (var db = Context())
    {
        var deletion = await Controller(db, users[0].Id, unit.Id)
            .DeleteDraft(
                meetingReconsideredId,
                new(meetingReconsidered.RowVersion));

        ExpectStatus(
            deletion,
            200,
            "Toplantıya bağlı yeniden değerlendirme taslağını silme");
    }

    Check(
        (await Read(cancelledId)).ReconsiderationDecisionId == null &&
        (await ReadMeeting(reconsiderMeetingId)).LastDecisionNo == 1,
        "Taslak silinince kaynak bağlantısı temizlenir; toplantı sayacı geri alınmaz");

    var decisionAfterDeletion = await AddMeetingDecision(
        reconsiderMeetingId,
        "Silinen taslaktan sonraki karar");

    Check(
        decisionAfterDeletion.No == 2 &&
        (await ReadMeeting(reconsiderMeetingId)).LastDecisionNo == 2,
        "Silinen yeniden değerlendirme taslağının karar numarası tekrar kullanılmaz");

    // ---------- İmza: parola ve imza görüntüsü ----------

    var imageSignId = await AddDecision();

    {
        var prepared = await Prepare(imageSignId, 0);
        var valid = Completion(prepared);

        var wrongPassword = await Complete(imageSignId, 0, valid with { Password = "yanlis-parola" });
        var noImage = await Complete(imageSignId, 0, valid with { SignatureImage = null });
        var notPng = await Complete(imageSignId, 0, valid with { SignatureImage = "data:image/png;base64,QUJD" });

        await using (var db = Context())
        {
            var p = await db.DecisionParticipants.AsNoTracking()
                .SingleAsync(x => x.DecisionId == imageSignId && x.UserId == users[0].Id);

            Check(
                Status(wrongPassword) == 422 && Status(noImage) == 422 && Status(notPng) == 422 &&
                p.SignedAt == null && p.SignatureImagePng == null,
                "Yanlış parola veya geçersiz imza görüntüsüyle imza kaydedilmez");
        }

        var signed = await Complete(imageSignId, 0, valid with { SaveSignature = true });
        ExpectStatus(signed, 200, "Parola ve imza görüntüsüyle imzalama");

        await using (var db = Context())
        {
            var p = await db.DecisionParticipants.AsNoTracking()
                .SingleAsync(x => x.DecisionId == imageSignId && x.UserId == users[0].Id);
            var saved = await db.Users.AsNoTracking()
                .Where(u => u.Id == users[0].Id)
                .Select(u => u.SavedSignaturePng)
                .SingleAsync();

            Check(
                p.SignedAt != null && p.SignatureImagePng is { Length: > 0 } &&
                saved != null && saved.SequenceEqual(p.SignatureImagePng),
                "İmza görüntüsü karara ve istenirse profile kaydedilir");
        }

        await using (var db = Context())
        {
            var pdfController = new DecisionPdfController(
                db,
                new PermissionService(db),
                new CheckEnvironment { ContentRootPath = testRoot, WebRootPath = testRoot },
                NullLogger<DecisionPdfController>.Instance,
            configuration)
            {
                ControllerContext = Controller(db, users[0].Id, unit.Id).ControllerContext
            };

            var signedCopy = await pdfController.Download(imageSignId, default);
            var original = await pdfController.Download(imageSignId, default, original: true);

            var frozenPdf = await db.Decisions.AsNoTracking()
                .Where(d => d.Id == imageSignId)
                .Select(d => d.SigningPdfBytes)
                .SingleAsync();

            Check(
                signedCopy is FileContentResult s && original is FileContentResult o &&
                o.FileContents.SequenceEqual(frozenPdf!) &&
                !s.FileContents.SequenceEqual(frozenPdf!),
                "İmzalı kopya imza görüntüleriyle yeniden üretilir; sabit PDF ayrıca indirilebilir");
        }

        // ---------- İmza makbuzu, belge doğrulama ve son PDF mührü ----------

        await using (var db = Context())
        {
            Check(
                await db.Notifications.AnyAsync(n =>
                    n.UserId == users[0].Id &&
                    n.DecisionId == imageSignId &&
                    n.Title == "Kararı imzaladınız") &&
                decisionEmail.Sent.Count == 0,
                "İmzalayana makbuz bildirimi yazılır; test adresine e-posta gitmez");
        }

        IFormFile Upload(byte[] bytes) =>
            new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", "karar.pdf");

        var (verificationCode, signingPdf) = await ReadVerification();

        async Task<(string? Code, byte[]? Pdf)> ReadVerification()
        {
            await using var db = Context();
            var row = await db.Decisions.AsNoTracking()
                .Where(d => d.Id == imageSignId)
                .Select(d => new { d.VerificationCode, d.SigningPdfBytes })
                .SingleAsync();
            return (row.VerificationCode, row.SigningPdfBytes);
        }

        await using (var db = Context())
        {
            var verify = new VerifyController(db);
            var info = await verify.Get(verificationCode!.ToLowerInvariant().Replace("-", " "), default);
            var unknown = await verify.Get("AAAAA-AAAAA", default);
            var frozenMatch = await verify.CheckFile(verificationCode, Upload(signingPdf!), default);

            Check(
                DecisionVerification.Normalize(verificationCode) == verificationCode &&
                Status(info) == 200 &&
                Body(info).GetProperty("signedCount").GetInt32() == 1 &&
                Status(unknown) == 404 &&
                Body(frozenMatch).GetProperty("match").GetString() == "signing",
                "Doğrulama kodu girişsiz sorgulanır; sabit PDF tanınır");
        }

        for (var i = 1; i < users.Count(); i++)
            ExpectStatus(
                await Complete(imageSignId, i, Completion(await Prepare(imageSignId, i))),
                200,
                $"Kalan üye {i} imzası");

        await using (var db = Context())
        {
            var d = await db.Decisions.AsNoTracking().SingleAsync(x => x.Id == imageSignId);
            var seal = d.FinalPdfBytes == null ? null : DecisionSealService.Check(d.FinalPdfBytes);

            Check(
                d.Status == DecisionStatus.Imzalandi &&
                d.FinalPdfBytes is { Length: > 0 } &&
                d.FinalPdfHash == Convert.ToHexString(SHA256.HashData(d.FinalPdfBytes)).ToLowerInvariant() &&
                seal is { Sealed: true, Valid: true } &&
                seal.Signer == "Selçuk Üniversitesi Kurul Karar Sistemi",
                "Son imzayla PDF sistem sertifikasıyla mühürlenir");

            var pdfController = new DecisionPdfController(
                db,
                new PermissionService(db),
                new CheckEnvironment { ContentRootPath = testRoot, WebRootPath = testRoot },
                NullLogger<DecisionPdfController>.Instance,
                configuration)
            {
                ControllerContext = Controller(db, users[0].Id, unit.Id).ControllerContext
            };

            var sealedDownload = await pdfController.Download(imageSignId, default);

            var tampered = (byte[])d.FinalPdfBytes!.Clone();
            tampered[tampered.Length / 3] ^= 0x01;

            var verify = new VerifyController(db);
            var finalMatch = await verify.CheckFile(verificationCode!, Upload(d.FinalPdfBytes!), default);
            var tamperedMatch = await verify.CheckFile(verificationCode!, Upload(tampered), default);

            Check(
                sealedDownload is FileContentResult f && f.FileContents.SequenceEqual(d.FinalPdfBytes!) &&
                Body(finalMatch).GetProperty("match").GetString() == "final" &&
                Body(finalMatch).GetProperty("sealValid").GetBoolean() &&
                Body(tamperedMatch).GetProperty("match").GetString() == "none" &&
                !Body(tamperedMatch).GetProperty("sealValid").GetBoolean(),
                "Mühürlü PDF indirilir; değiştirilmiş kopya doğrulamada reddedilir");

            Check(
                await db.Notifications.AnyAsync(n =>
                    n.DecisionId == imageSignId &&
                    n.Title == "Kararı imzaladınız · imzalar tamamlandı"),
                "Son imzalayana tamamlanma makbuzu yazılır");
        }
    }

    // ---------- Yeni Karar sihirbazı: oylamaya sunma ----------

    async Task<byte[]> DecisionVersion(int decisionId)
    {
        await using var db = Context();
        return await db.Decisions
            .Where(d => d.Id == decisionId)
            .Select(d => d.RowVersion)
            .SingleAsync();
    }

    int wizardDecisionId;

    await using (var db = Context())
    {
        // Toplantı kaydı olmadan (sihirbaz akışı) taslak oluşturulur.
        var wizardCreated = await Controller(db, users[0].Id, unit.Id).Create(
            new(new DateOnly(2027, 3, 15), 41, "Sihirbaz kararı",
                null, "Sihirbaz metni {OY_SONUCU} kabul edilmiştir.", null, null, null));

        ExpectStatus(wizardCreated, 201, "Sihirbazla taslak karar oluşturma");
        wizardDecisionId = Body(wizardCreated).GetProperty("Id").GetInt32();
    }

    await using (var db = Context())
    {
        var draft = await db.Decisions.AsNoTracking().SingleAsync(d => d.Id == wizardDecisionId);

        Check(
            draft.Status == DecisionStatus.Taslak && draft.SubmittedAt == null &&
            !await db.Notifications.AnyAsync(n => n.DecisionId == wizardDecisionId),
            "Oylamaya sunulmayan taslak için üyelere bildirim gitmez");
    }

    await using (var db = Context())
    {
        var submitted = await Controller(db, users[0].Id, unit.Id)
            .Submit(wizardDecisionId, new(await DecisionVersion(wizardDecisionId)));

        ExpectStatus(submitted, 200, "Kararı oylamaya sunma");
    }

    await using (var db = Context())
    {
        var d = await db.Decisions.AsNoTracking().SingleAsync(x => x.Id == wizardDecisionId);
        var notified = await db.Notifications.CountAsync(n => n.DecisionId == wizardDecisionId);

        Check(
            d.Status == DecisionStatus.Oylamada && d.SubmittedAt != null &&
            notified == users.Length - 1,
            "Oylamaya sunulan karar oy gelmeden Oylamada görünür ve diğer üyelere bildirim gider");
    }

    await using (var db = Context())
    {
        var again = await Controller(db, users[0].Id, unit.Id)
            .Submit(wizardDecisionId, new(await DecisionVersion(wizardDecisionId)));

        var edit = await Controller(db, users[0].Id, unit.Id).UpdateDraft(
            wizardDecisionId,
            new("Değiştirilmiş gündem", null, "Yeni metin", null, null, null,
                await DecisionVersion(wizardDecisionId)));

        var remove = await Controller(db, users[0].Id, unit.Id).DeleteDraft(
            wizardDecisionId, new(await DecisionVersion(wizardDecisionId)));

        Check(
            Status(again) == 409 && Status(edit) == 409 && Status(remove) == 409,
            "Oylamaya sunulan karar tekrar sunulamaz, metni değiştirilemez ve silinemez");
    }

    await using (var db = Context())
    {
        var attendance = await Controller(db, users[0].Id, unit.Id).SetAttendance(
            wizardDecisionId,
            new(users[2].Id, AttendanceStatus.Izinli, await DecisionVersion(wizardDecisionId)));

        ExpectStatus(attendance, 200, "Oylamaya sunulan kararda ilk oydan önce katılım değişikliği");
    }

    await using (var db = Context())
    {
        var d = await db.Decisions.AsNoTracking().SingleAsync(x => x.Id == wizardDecisionId);

        Check(
            d.Status == DecisionStatus.Oylamada,
            "Katılım değişikliği oylamaya sunulmuş kararı taslağa döndürmez");
    }

    // ---------- Kurul Başkanı özel duyuruları ve katılım cevapları ----------

    var rsvpTokens = new RsvpTokenService(
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "checks-rsvp-anahtari-0123456789abcdef"
            })
            .Build());

    // Bu bölüm kendi "başka kurul" verisini kurar; sonraki bölümlerden bağımsızdır.
    int customOtherUnitId;
    int customOutsiderId;

    await using (var db = Context())
    {
        var other = new AcademicUnit
        {
            Code = "checks-duyuru-diger",
            Name = "Diğer Duyuru Kurulu",
            BoardName = "Diğer Duyuru Kurulu",
            ParentName = "Test",
            UnitType = "BOLUM",
            TitleLine1 = "DİĞER",
            TitleLine2 = "KURUL KARARI",
            MembersLabel = "Üyeler",
            LogoPath = "/su_bilgisayar.png"
        };
        var outsider = new AppUser
        {
            Username = "duyuru-dis",
            Email = "duyuru-dis@birim.edu.tr",
            FullName = "Duyuru Dış Üye",
            PasswordHash = "not-used",
            Role = SystemRoles.User,
            IsActive = true
        };
        db.AcademicUnits.Add(other);
        db.Users.Add(outsider);
        await db.SaveChangesAsync();

        var otherRole = new RoleDefinition
        {
            AcademicUnitId = other.Id,
            Name = "Diğer Üye",
            Kind = UnitRoles.Uye,
            PermissionsJson = PermissionJson.Serialize(PermissionJson.DefaultsFor(UnitRoles.Uye))
        };
        db.Roles.Add(otherRole);
        await db.SaveChangesAsync();

        db.UserUnits.Add(new UserUnit
        {
            AcademicUnitId = other.Id,
            UserId = outsider.Id,
            RoleId = otherRole.Id,
            IsActive = true,
            IsBoardMember = true,
            UnitRole = UnitRoles.Uye
        });
        await db.SaveChangesAsync();

        customOtherUnitId = other.Id;
        customOutsiderId = outsider.Id;
    }


    var customEmail = new RecordingEmailQueue();
    var customConfig = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["App:PublicUrl"] = "https://kurul.test"
        })
        .Build();

    // Kontrol yardımcısı unitRole'ü hep Üye yazar; Başkan için ayrı kimlik kurulur.
    AnnouncementsController CustomControllerAs(
        AppDbContext db, int userId, int unitId, string unitRole)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Role, SystemRoles.User),
            new Claim("unitId", unitId.ToString()),
            new Claim("unitCode", "checks"),
            new Claim("unitRole", unitRole)
        };

        return new AnnouncementsController(
            db,
            new PermissionService(db),
            customEmail,
            rsvpTokens,
            customConfig,
            NullLogger<AnnouncementsController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(claims, "checks"))
                }
            }
        };
    }

    AnnouncementsController.CustomAnnouncementRequest CustomRequest(
        string content,
        string? onlineLink = null,
        List<int>? recipients = null) =>
        new(content, "2027-05-10", "14:30", "Toplantı Salonu", onlineLink,
            new List<string> { "Ders programı", "Staj komisyonu" }, recipients);

    // users[1] kurumsal adrese, users[2] benzer ama kurumsal olmayan adrese sahip.
    await using (var db = Context())
    {
        var u1 = await db.Users.SingleAsync(u => u.Id == users[1].Id);
        var u2 = await db.Users.SingleAsync(u => u.Id == users[2].Id);
        u1.Email = "uye1@birim.edu.tr";
        u2.Email = "uye2@sahteedu.tr";
        await db.SaveChangesAsync();
    }

    await using (var db = Context())
    {
        var memberCustomPublish = await CustomControllerAs(db, users[1].Id, unit.Id, UnitRoles.Uye)
            .CustomPublish(CustomRequest("Üye denemesi"), default);

        Check(Status(memberCustomPublish) == 403, "Başkan olmayan üye özel duyuru yayımlayamaz");
    }

    await using (var db = Context())
    {
        var badLink = await CustomControllerAs(db, users[0].Id, unit.Id, UnitRoles.Baskan)
            .CustomPublish(CustomRequest("Bağlantı denemesi", "javascript:alert(1)"), default);

        Check(Status(badLink) == 400, "http/https olmayan çevrimiçi bağlantı reddedilir");
    }

    await using (var db = Context())
    {
        var foreignRecipient = await CustomControllerAs(db, users[0].Id, unit.Id, UnitRoles.Baskan)
            .CustomPublish(CustomRequest("Dış alıcı", recipients: new List<int> { customOutsiderId }), default);

        Check(
            Status(foreignRecipient) == 400 &&
            !await db.CustomAnnouncements.AnyAsync(),
            "Başka kurulun üyesi alıcı olarak seçilemez ve kayıt oluşmaz");
    }

    int customId;

    await using (var db = Context())
    {
        var publish = await CustomControllerAs(db, users[0].Id, unit.Id, UnitRoles.Baskan)
            .CustomPublish(CustomRequest("Bölüm kurulu toplanacaktır.", "https://meet.example/abc"), default);

        ExpectStatus(publish, 200, "Başkanın özel duyurusu");
        customId = Body(publish).GetProperty("announcementId").GetInt32();

        Check(
            await db.Notifications.CountAsync(n => n.CustomAnnouncementId == customId) == 3 &&
            Body(publish).GetProperty("emailCount").GetInt32() == 1,
            "Tüm kurul üyelerine bildirim oluşur, yalnızca .edu.tr adresine e-posta gider");
    }

    Check(
        customEmail.Sent.Count == 1 &&
        customEmail.Sent[0].To == "uye1@birim.edu.tr" &&
        customEmail.Sent[0].HtmlBody.Contains("https://kurul.test/katilim/") &&
        !customEmail.Sent[0].HtmlBody.Contains("<script", StringComparison.OrdinalIgnoreCase),
        "E-posta bağlantısı yapılandırılmış adresten üretilir");

    await using (var db = Context())
    {
        var invalidIntent = await CustomControllerAs(db, users[2].Id, unit.Id, UnitRoles.Uye)
            .UpdateAttendance(customId, new AnnouncementsController.AttendanceRequest("Belki"), default);

        var answer = await CustomControllerAs(db, users[2].Id, unit.Id, UnitRoles.Uye)
            .UpdateAttendance(customId, new AnnouncementsController.AttendanceRequest(AnnouncementAttendance.Katilacak), default);

        Check(
            Status(invalidIntent) == 400 && Status(answer) == 200,
            "Geçersiz katılım cevabı reddedilir, geçerli cevap kaydedilir");
    }

    await using (var db = Context())
    {
        var outsiderAnswer = await CustomControllerAs(db, customOutsiderId, customOtherUnitId, UnitRoles.Uye)
            .UpdateAttendance(customId, new AnnouncementsController.AttendanceRequest(AnnouncementAttendance.Katilacak), default);

        Check(Status(outsiderAnswer) == 404, "Duyuru gönderilmeyen kişi cevap veremez");
    }

    await using (var db = Context())
    {
        var outsiderList = await CustomControllerAs(db, customOutsiderId, customOtherUnitId, UnitRoles.Baskan)
            .GetCustomAnnouncements(default);

        Check(
            Status(outsiderList) == 200 && Body(outsiderList).GetArrayLength() == 0,
            "Başka kurulun başkanı bu kurulun özel duyurularını göremez");
    }

    await using (var db = Context())
    {
        var memberView = Body(await CustomControllerAs(db, users[2].Id, unit.Id, UnitRoles.Uye)
            .GetCustomAnnouncements(default))[0];

        var chairView = Body(await CustomControllerAs(db, users[0].Id, unit.Id, UnitRoles.Baskan)
            .GetCustomAnnouncements(default))[0];

        var stats = chairView.GetProperty("stats");

        Check(
            memberView.GetProperty("myIntent").GetString() == AnnouncementAttendance.Katilacak &&
            memberView.GetProperty("stats").ValueKind == JsonValueKind.Null &&
            stats.GetProperty("total").GetInt32() == 3 &&
            stats.GetProperty("katilacak").GetInt32() == 1 &&
            stats.GetProperty("belirsiz").GetInt32() == 2 &&
            stats.GetProperty("details").GetArrayLength() == 3,
            "Üye kendi cevabını, Başkan katılım özetini ve kişi listesini görür");
    }

    await using (var db = Context())
    {
        var selected = await CustomControllerAs(db, users[0].Id, unit.Id, UnitRoles.Baskan)
            .CustomPublish(CustomRequest("Yalnızca bir üyeye", recipients: new List<int> { users[1].Id }), default);

        ExpectStatus(selected, 200, "Seçili alıcıya özel duyuru");

        var otherMemberList = await CustomControllerAs(db, users[2].Id, unit.Id, UnitRoles.Uye)
            .GetCustomAnnouncements(default);

        Check(
            Body(selected).GetProperty("recipientCount").GetInt32() == 1 &&
            Body(otherMemberList).GetArrayLength() == 1,
            "Seçili alıcıya giden duyuru diğer üyelere listelenmez");
    }

    customEmail.Configured = false;

    await using (var db = Context())
    {
        var smtpDown = await CustomControllerAs(db, users[0].Id, unit.Id, UnitRoles.Baskan)
            .CustomPublish(CustomRequest("SMTP kapalıyken"), default);

        Check(
            Status(smtpDown) == 200 &&
            Body(smtpDown).GetProperty("emailWarning").GetString() != null &&
            Body(smtpDown).GetProperty("emailCount").GetInt32() == 0,
            "SMTP yapılandırılmamışsa duyuru yine yayımlanır ve uyarı döner");
    }

    // ---------- E-postadaki kişiye özel bağlantı ile girişsiz katılım cevabı ----------

    // E-postadaki bağlantıdan anahtarı çıkarır: .../katilim/{token}?yanit=...
    static string TokenFromEmail(string html)
    {
        var start = html.IndexOf("/katilim/", StringComparison.Ordinal) + "/katilim/".Length;
        var end = html.IndexOf('?', start);
        return Uri.UnescapeDataString(html[start..end]);
    }

    var memberToken = TokenFromEmail(customEmail.Sent[0].HtmlBody);

    await using (var db = Context())
    {
        var rsvp = new RsvpController(db, rsvpTokens);

        var viaLink = await rsvp.Answer(
            memberToken, new RsvpController.RsvpRequest(AnnouncementAttendance.Katilmayacak), default);

        var intent = await db.Notifications
            .Where(n => n.UserId == users[1].Id && n.CustomAnnouncementId == customId)
            .Select(n => n.AttendanceIntent)
            .SingleAsync();

        Check(
            Status(viaLink) == 200 &&
            Body(viaLink).GetProperty("intent").GetString() == AnnouncementAttendance.Katilmayacak &&
            intent == AnnouncementAttendance.Katilmayacak,
            "E-postadaki bağlantıyla giriş yapmadan katılım cevabı kaydedilir");
    }

    await using (var db = Context())
    {
        var rsvp = new RsvpController(db, rsvpTokens);
        var parts = memberToken.Split('.');
        var otherId = int.Parse(parts[0]) + 1;

        var tampered = await rsvp.Get(otherId + "." + parts[1], default);
        var garbage = await rsvp.Get("abc", default);
        var badIntent = await rsvp.Answer(
            memberToken, new RsvpController.RsvpRequest("Belki"), default);

        Check(
            Status(tampered) == 404 && Status(garbage) == 404 && Status(badIntent) == 400,
            "Değiştirilmiş veya geçersiz bağlantı başka üyenin cevabını değiştiremez");
    }

    await using (var db = Context())
    {
        var membership = await db.UserUnits.SingleAsync(m => m.UserId == users[1].Id && m.AcademicUnitId == unit.Id);
        membership.IsActive = false;
        await db.SaveChangesAsync();

        var passive = await new RsvpController(db, rsvpTokens).Get(memberToken, default);

        membership.IsActive = true;
        await db.SaveChangesAsync();

        Check(Status(passive) == 404, "Kuruldan çıkarılan üye bağlantıyla cevap veremez");
    }

    // ---------- Duyuru sürümleri, bildirimler ve e-posta hazırlama ----------

    MeetingsController MeetingControllerAs(
        AppDbContext db, int userId, int unitId, bool admin) =>
        new MeetingsController(db, new PermissionService(db))
        {
            ControllerContext =
                Controller(db, userId, unitId, admin).ControllerContext
        };


    AnnouncementsController AnnouncementControllerAs(
        AppDbContext db, int userId, int unitId, bool admin) =>
        new AnnouncementsController(
            db,
            new PermissionService(db),
            new RecordingEmailQueue(),
            rsvpTokens,
            configuration,
            NullLogger<AnnouncementsController>.Instance)
        {
            ControllerContext =
                Controller(db, userId, unitId, admin).ControllerContext
        };

    NotificationsController NotificationControllerAs(
        AppDbContext db, int userId, int unitId) =>
        new NotificationsController(db)
        {
            ControllerContext =
                Controller(db, userId, unitId, false).ControllerContext
        };

    async Task SaveAgendaFor(int targetMeetingId, params string[] titles)
    {
        await using var db = Context();

        var response = await MeetingControllerAs(db, users[0].Id, unit.Id, true)
            .SaveAgenda(
                targetMeetingId,
                new MeetingsController.SaveAgendaRequest(
                    titles
                        .Select(t => new MeetingsController.AgendaItemDto(
                            t, "Açıklama: " + t))
                        .ToList()),
                default);

        ExpectStatus(response, 200, "Gündem taslağı kaydı");
    }

    async Task<IActionResult> PublishFor(
        int targetMeetingId, int userIndex = 0, bool admin = true)
    {
        await using var db = Context();

        return await MeetingControllerAs(
                db, users[userIndex].Id, unit.Id, admin)
            .PublishMeeting(targetMeetingId, default);
    }

    async Task<JsonElement> AnnouncementFor(
        int targetMeetingId, int userIndex)
    {
        await using var db = Context();

        var response = await AnnouncementControllerAs(
                db, users[userIndex].Id, unit.Id, false)
            .GetAnnouncements(default);

        ExpectStatus(response, 200, "Duyuru listesi");

        return Body(response)
            .EnumerateArray()
            .Single(x => x.GetProperty("meetingId").GetInt32() == targetMeetingId);
    }

    async Task<int> NotificationCount(int targetMeetingId)
    {
        await using var db = Context();

        return await db.Notifications
            .CountAsync(n => n.MeetingId == targetMeetingId);
    }

    async Task<int> PublicationCount(int targetMeetingId)
    {
        await using var db = Context();

        return await db.MeetingAgendaPublications
            .CountAsync(p => p.MeetingId == targetMeetingId);
    }

    var annMeetingId = await CreateMeeting(new DateOnly(2027, 4, 1));

    await SaveAgendaFor(annMeetingId, "Madde A", "Madde B");

    var firstPublish = await PublishFor(annMeetingId);
    ExpectStatus(firstPublish, 200, "İlk yayımlama");

    Check(
        Body(firstPublish).GetProperty("version").GetInt32() == 1 &&
        Body(firstPublish).GetProperty("notifiedCount").GetInt32() == 3 &&
        await NotificationCount(annMeetingId) == 3 &&
        await PublicationCount(annMeetingId) == 1,
        "İlk yayımlama bir sürüm ve üye başına tek bildirim üretir");

    var secondPublish = await PublishFor(annMeetingId);
    ExpectStatus(secondPublish, 200, "Aynı gündemi tekrar yayımlama");

    Check(
        Body(secondPublish).GetProperty("alreadyPublished").GetBoolean() &&
        await NotificationCount(annMeetingId) == 3 &&
        await PublicationCount(annMeetingId) == 1,
        "Aynı duyuruyu ikinci kez yayımlamak yeni bildirim veya sürüm üretmez");

    // Taslak değişir ama yayımlanmış içerik değişmez.
    await SaveAgendaFor(annMeetingId, "Madde A (değişti)", "Madde B", "Madde C");

    var stillPublished = await AnnouncementFor(annMeetingId, 1);

    Check(
        stillPublished.GetProperty("version").GetInt32() == 1 &&
        stillPublished.GetProperty("agenda").GetArrayLength() == 2 &&
        stillPublished
            .GetProperty("agenda")[0]
            .GetProperty("title")
            .GetString() == "Madde A",
        "Taslak düzenlenince eski yayımlanmış içerik değişmez");

    await using (var db = Context())
    {
        var draftView = await MeetingControllerAs(
                db, users[0].Id, unit.Id, true)
            .GetAgenda(annMeetingId, default);

        ExpectStatus(draftView, 200, "Gündem taslağı okuma");

        Check(
            Body(draftView).GetProperty("hasUnpublishedChanges").GetBoolean() &&
            Body(draftView).GetProperty("publishedVersion").GetInt32() == 1,
            "Yayımlanmamış taslak değişikliği yönetici ekranında işaretlenir");
    }

    // Değişen gündem yeni sürüm olur.
    var updatePublish = await PublishFor(annMeetingId);
    ExpectStatus(updatePublish, 200, "Değişen gündemi yayımlama");

    var updated = await AnnouncementFor(annMeetingId, 1);

    Check(
        Body(updatePublish).GetProperty("version").GetInt32() == 2 &&
        updated.GetProperty("version").GetInt32() == 2 &&
        updated.GetProperty("agenda").GetArrayLength() == 3 &&
        updated
            .GetProperty("agenda")[0]
            .GetProperty("title")
            .GetString() == "Madde A (değişti)" &&
        await NotificationCount(annMeetingId) == 6 &&
        await PublicationCount(annMeetingId) == 2,
        "Değişen gündem yeni sürüm olarak yayımlanır ve yeni bildirim üretir");

    // Eski sürüm silinmez, içeriği korunur.
    await using (var db = Context())
    {
        var v1 = await db.MeetingAgendaPublications
            .AsNoTracking()
            .SingleAsync(p => p.MeetingId == annMeetingId && p.Version == 1);

        Check(
            AgendaSnapshot.Deserialize(v1.ItemsJson).Count == 2 &&
            AgendaSnapshot.Deserialize(v1.ItemsJson)[0].Title == "Madde A",
            "Eski yayın sürümü değişmeden saklanır");
    }

    // E-posta hazırlama: bildirim veya "gönderildi" kaydı üretmez.
    var notificationsBeforeEmail = await NotificationCount(annMeetingId);

    await using (var db = Context())
    {
        var prepared = await MeetingControllerAs(
                db, users[0].Id, unit.Id, true)
            .PrepareAnnouncementEmail(annMeetingId, default);

        ExpectStatus(prepared, 200, "E-posta hazırlama");

        var body = Body(prepared);

        Check(
            body.GetProperty("bcc").GetArrayLength() == 3 &&
            body.GetProperty("subject").GetString()!.Contains("Güncellendi") &&
            body.GetProperty("body").GetString()!.Contains("Madde A (değişti)"),
            "E-posta taslağı alıcıları, konuyu ve güncel gündemi içerir");
    }

    await using (var db = Context())
    {
        var emailLogs = await db.AuditLogs
            .AsNoTracking()
            .Where(l => l.Message.Contains("Duyuru e-postası"))
            .ToListAsync();

        Check(
            await NotificationCount(annMeetingId) == notificationsBeforeEmail &&
            emailLogs.Count == 1 &&
            emailLogs[0].Message.Contains("hazırlandı") &&
            !emailLogs.Any(l => l.Message.Contains("gönderildi")),
            "E-posta hazırlama 'gönderildi' kaydı veya yeni bildirim oluşturmaz");
    }

    // Yetkisiz kullanıcı yayımlayamaz, e-posta hazırlayamaz.
    // Üye rolünde "yeni-karar" yazma yetkisi yoktur.
    var memberPublish = await PublishFor(annMeetingId, userIndex: 2, admin: false);

    Check(
        Status(memberPublish) == 403 &&
        await PublicationCount(annMeetingId) == 2,
        "Yetkisiz kullanıcı yayımlama yapamaz");

    await using (var db = Context())
    {
        var memberEmail = await MeetingControllerAs(
                db, users[2].Id, unit.Id, false)
            .PrepareAnnouncementEmail(annMeetingId, default);

        var memberDraft = await MeetingControllerAs(
                db, users[2].Id, unit.Id, false)
            .GetAgenda(annMeetingId, default);

        Check(
            Status(memberEmail) == 403 && Status(memberDraft) == 403,
            "Yetkisiz kullanıcı e-posta hazırlayamaz ve gündem taslağını okuyamaz");
    }

    // Başka kurulun duyurusu ve başka kullanıcının bildirimi okunamaz.
    int otherUnitId;
    int outsiderId;

    await using (var db = Context())
    {
        var otherUnit = new AcademicUnit
        {
            Code = "checks-diger",
            Name = "Diğer Kontrol",
            BoardName = "Diğer Kontrol Kurulu",
            ParentName = "Test",
            UnitType = "BOLUM",
            TitleLine1 = "DİĞER KURUL",
            TitleLine2 = "KURUL KARARI",
            MembersLabel = "Diğer Kurul Üyeleri",
            LogoPath = "/su_bilgisayar.png"
        };

        var outsider = new AppUser
        {
            Username = "outsider",
            Email = "outsider@example.invalid",
            FullName = "Başka Kurul Üyesi",
            PasswordHash = "not-used",
            Role = SystemRoles.User,
            IsActive = true
        };

        db.AcademicUnits.Add(otherUnit);
        db.Users.Add(outsider);
        await db.SaveChangesAsync();

        var otherRole = new RoleDefinition
        {
            AcademicUnitId = otherUnit.Id,
            Name = "Diğer Üye",
            Kind = UnitRoles.Uye,
            PermissionsJson = PermissionJson.Serialize(
                PermissionJson.DefaultsFor(UnitRoles.Uye))
        };

        db.Roles.Add(otherRole);
        await db.SaveChangesAsync();

        db.UserUnits.Add(new UserUnit
        {
            AcademicUnitId = otherUnit.Id,
            UserId = outsider.Id,
            RoleId = otherRole.Id,
            IsActive = true,
            IsBoardMember = true,
            SortOrder = 0,
            UnitRole = UnitRoles.Uye
        });

        await db.SaveChangesAsync();

        otherUnitId = otherUnit.Id;
        outsiderId = outsider.Id;
    }

    await using (var db = Context())
    {
        var foreignList = await AnnouncementControllerAs(
                db, outsiderId, otherUnitId, false)
            .GetAnnouncements(default);

        ExpectStatus(foreignList, 200, "Başka kurulun duyuru listesi");

        var foreignRead = await AnnouncementControllerAs(
                db, outsiderId, otherUnitId, false)
            .MarkRead(annMeetingId, default);

        var foreignNotifications = await NotificationControllerAs(
                db, outsiderId, otherUnitId)
            .GetNotifications(default);

        ExpectStatus(foreignNotifications, 200, "Başka kurulun bildirimleri");

        Check(
            Body(foreignList).GetArrayLength() == 0 &&
            Status(foreignRead) == 404 &&
            Body(foreignNotifications).GetProperty("unreadCount").GetInt32() == 0 &&
            Body(foreignNotifications).GetProperty("items").GetArrayLength() == 0,
            "Başka kurulun duyurusu ve bildirimi okunamaz");
    }

    int member0NotificationId;

    await using (var db = Context())
    {
        member0NotificationId = await db.Notifications
            .Where(n => n.UserId == users[0].Id && n.MeetingId == annMeetingId)
            .Select(n => n.Id)
            .FirstAsync();
    }

    await using (var db = Context())
   {
       var wrongUnit = await NotificationControllerAs(db, users[0].Id, otherUnitId)
           .GetNotifications(default);
       var wrongRead = await NotificationControllerAs(db, users[0].Id, otherUnitId)
           .MarkRead(member0NotificationId, default);

       Check(
           Body(wrongUnit).GetProperty("items").GetArrayLength() == 0 &&
           Status(wrongRead) == 404,
           "Aynı kullanıcının başka kurul bağlamında bildirimi görünmez");
   }
       await using (var db = Context())
    {
        var stolen = await NotificationControllerAs(db, users[1].Id, unit.Id)
            .MarkRead(member0NotificationId, default);

        Check(
            Status(stolen) == 404,
            "Başka kullanıcının bildirimi okundu işaretlenemez");
    }

    await using (var db = Context())
    {
        var stillUnread = await db.Notifications
            .AsNoTracking()
            .SingleAsync(n => n.Id == member0NotificationId);

        Check(
            !stillUnread.IsRead,
            "Başka kullanıcının bildirimi reddedilen istekten sonra okunmamış kalır");
    }

    // "Okudum": yalnızca isteği yapan kullanıcının bildirimleri okunur.
    await using (var db = Context())
    {
        var markRead = await AnnouncementControllerAs(
                db, users[1].Id, unit.Id, false)
            .MarkRead(annMeetingId, default);

        ExpectStatus(markRead, 200, "Okudum işlemi");
    }

    await using (var db = Context())
    {
        var user1Unread = await db.Notifications.CountAsync(n =>
            n.UserId == users[1].Id && n.MeetingId == annMeetingId && !n.IsRead);

        var user2Unread = await db.Notifications.CountAsync(n =>
            n.UserId == users[2].Id && n.MeetingId == annMeetingId && !n.IsRead);

        Check(
            user1Unread == 0 && user2Unread == 2,
            "Okudum yalnızca kendi bildirimlerini okundu yapar");
    }

    // Eşzamanlı yayımlama: tek yeni sürüm ve üye başına tek bildirim.
    await SaveAgendaFor(annMeetingId, "Madde A (değişti)", "Madde B", "Madde D");

    var parallelResults = await Task.WhenAll(
        PublishFor(annMeetingId),
        PublishFor(annMeetingId));

    Check(
        parallelResults.All(r => Status(r) is 200 or 409) &&
        parallelResults.Count(r => Status(r) == 200 &&
            !Body(r).GetProperty("alreadyPublished").GetBoolean()) == 1 &&
        await PublicationCount(annMeetingId) == 3 &&
        await NotificationCount(annMeetingId) == 9,
        "Eşzamanlı iki yayımlama tek yeni sürüm ve tek bildirim kümesi üretir");

    
    // ---------- Kullanıcı yönetimi: başka kurul üyesinin bilgileri (madde 9) ----------

    UserManagementController UserControllerAs(
        AppDbContext db, int userId, int unitId, bool admin) =>
        new UserManagementController(db, new PermissionService(db))
        {
            ControllerContext =
                Controller(db, userId, unitId, admin).ControllerContext
        };

    const string importUnitCode = "checks-import";
    int importUnitId;
    int managerId;
    int weakManagerId;

    await using (var db = Context())
    {
        var importUnit = new AcademicUnit
        {
            Code = importUnitCode,
            Name = "İçe Aktarma",
            BoardName = "İçe Aktarma Kurulu",
            ParentName = "Test",
            UnitType = "BOLUM",
            TitleLine1 = "İÇE AKTARMA",
            TitleLine2 = "KURUL KARARI",
            MembersLabel = "İçe Aktarma Üyeleri",
            LogoPath = "/su_bilgisayar.png"
        };

        db.AcademicUnits.Add(importUnit);
        await db.SaveChangesAsync();

        RoleDefinition NewRole(
            string name, string kind, Dictionary<string, PagePerm> perms) =>
            new()
            {
                AcademicUnitId = importUnit.Id,
                Name = name,
                Kind = kind,
                PermissionsJson = PermissionJson.Serialize(perms)
            };

        AppUser NewUser(string username) =>
            new()
            {
                Username = username,
                Email = username + "@example.invalid",
                FullName = "Aktarım " + username,
                PasswordHash = "not-used",
                Role = SystemRoles.User,
                IsActive = true
            };

        // Üye yetkilerine ek olarak "kullanıcılar" yazma yetkisi olan yönetici.
        var managerPerms = PermissionJson.DefaultsFor(UnitRoles.Uye);
        managerPerms[Pages.Users] = new PagePerm(true, true);

        // Yalnızca "kullanıcılar" yazma yetkisi var; Üye rolünü atamaya yetmez.
        var weakPerms = Pages.All.ToDictionary(p => p, _ => new PagePerm(false, false));
        weakPerms[Pages.Users] = new PagePerm(true, true);

        var memberRole = NewRole("Aktarım Üyesi", UnitRoles.Uye,
            PermissionJson.DefaultsFor(UnitRoles.Uye));
        var chairRole = NewRole("Aktarım Başkanı", UnitRoles.Baskan,
            PermissionJson.DefaultsFor(UnitRoles.Baskan));
        var managerRole = NewRole("Aktarım Yöneticisi", UnitRoles.Sekreter, managerPerms);
        var weakRole = NewRole("Aktarım Zayıf Yönetici", UnitRoles.Sekreter, weakPerms);

        db.Roles.AddRange(memberRole, chairRole, managerRole, weakRole);

        var manager = NewUser("aktarim-yonetici");
        var weak = NewUser("aktarim-zayif");
        var active = NewUser("active1");

        db.Users.AddRange(manager, weak, active);
        await db.SaveChangesAsync();

        UserUnit Membership(AppUser user, RoleDefinition role, string unitRole, bool board) =>
            new()
            {
                AcademicUnitId = importUnit.Id,
                UserId = user.Id,
                RoleId = role.Id,
                IsActive = true,
                IsBoardMember = board,
                SortOrder = board ? 1 : 0,
                UnitRole = unitRole
            };

        db.UserUnits.AddRange(
            Membership(manager, managerRole, UnitRoles.Sekreter, false),
            Membership(weak, weakRole, UnitRoles.Sekreter, false),
            Membership(active, memberRole, UnitRoles.Uye, true));

        await db.SaveChangesAsync();

        importUnitId = importUnit.Id;
        managerId = manager.Id;
        weakManagerId = weak.Id;
    }

    // Create ucu da başka kurulda üye olan kişinin bilgilerini yönetici olmadan değiştiremez.
    int outsider2Id;
    int importMemberRoleId;

    await using (var db = Context())
    {
        var otherRoleId = await db.Roles
            .Where(r => r.AcademicUnitId == otherUnitId)
            .Select(r => r.Id)
            .FirstAsync();

        importMemberRoleId = await db.Roles
            .Where(r => r.AcademicUnitId == importUnitId && r.Name == "Aktarım Üyesi")
            .Select(r => r.Id)
            .SingleAsync();

        var outsider2 = new AppUser
        {
            Username = "outsider2",
            Email = "outsider2@example.invalid",
            FullName = "İkinci Dış Üye",
            PasswordHash = "not-used",
            Role = SystemRoles.User,
            IsActive = true
        };

        db.Users.Add(outsider2);
        await db.SaveChangesAsync();

        db.UserUnits.Add(new UserUnit
        {
            AcademicUnitId = otherUnitId,
            UserId = outsider2.Id,
            RoleId = otherRoleId,
            IsActive = true,
            IsBoardMember = true,
            SortOrder = 5,
            UnitRole = UnitRoles.Uye
        });

        await db.SaveChangesAsync();
        outsider2Id = outsider2.Id;
    }

    await using (var db = Context())
    {
        var createResult = await UserControllerAs(db, managerId, importUnitId, false)
            .Create(
                importUnitCode,
                new UserManagementController.CreateUserRequest(
                    "outsider2", "Değişmiş İsim", "Prof.", null,
                    "5550001111", null, importMemberRoleId));

        ExpectStatus(createResult, 200, "Başka kurul üyesini Create ile ekleme");
    }

    await using (var db = Context())
    {
        var outsider2Now = await db.Users.AsNoTracking()
            .SingleAsync(u => u.Id == outsider2Id);

        Check(
            outsider2Now.FullName == "İkinci Dış Üye" &&
            outsider2Now.PhoneNumber != "5550001111",
            "Create ucu başka kurulda da üye olan kişinin bilgilerini yönetici olmadan değiştirmez");
    }


    Console.WriteLine();
    Console.WriteLine(
        "SQL yarış, PDF v2, dosya bütünlüğü ve eski imza geçiş kontrolleri tamamlandı.");
}
finally
{
    try
    {
        // Yalnızca bu çalışmanın oluşturduğu veritabanı.
        if (created)
        {
            await setup.Database.EnsureDeletedAsync();

            Console.WriteLine(
                "Geçici test veritabanı kaldırıldı: " + database);
        }
    }
    finally
    {
        // Yalnızca bu çalışmanın rastgele adlı geçici klasörü.
        if (Directory.Exists(testRoot))
        {
            Directory.Delete(testRoot, recursive: true);
            Console.WriteLine("Geçici test dosyaları kaldırıldı.");
        }
    }
}

// İlk iki karar okumasını aynı noktada buluşturur.
// Üçüncü ve sonraki okumalar, örneğin concurrency retry, bekletilmez.
sealed class TwoReadersGate : DbCommandInterceptor
{
    private int count;

    private readonly TaskCompletionSource<bool> release =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public override async ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken cancellationToken = default)
    {
        if (command.CommandText.Contains(
                "FROM [Decisions]",
                StringComparison.Ordinal) &&
            command.CommandText.TrimStart().StartsWith(
                "SELECT",
                StringComparison.Ordinal))
        {
            var arrival = Interlocked.Increment(ref count);

            if (arrival == 2)
                release.TrySetResult(true);

            if (arrival <= 2)
            {
                await release.Task.WaitAsync(
                    TimeSpan.FromSeconds(20),
                    cancellationToken);
            }
        }

        return result;
    }
}

sealed class CheckEnvironment : IWebHostEnvironment
{
    public string ApplicationName { get; set; } = "Kurul.Checks";
    public string EnvironmentName { get; set; } = "Development";

    public string ContentRootPath { get; set; } = Path.GetTempPath();

    public IFileProvider ContentRootFileProvider { get; set; } =
        new NullFileProvider();

    public string WebRootPath { get; set; } = Path.GetTempPath();

    public IFileProvider WebRootFileProvider { get; set; } =
        new NullFileProvider();
}

// Gerçek SMTP yerine kuyruğa alınan e-postaları kaydeder.
sealed class RecordingEmailQueue : IEmailQueue
{
    public bool Configured { get; set; } = true;
    public bool IsConfigured => Configured;
    public List<OutgoingEmail> Sent { get; } = new();

    public void Enqueue(OutgoingEmail email) => Sent.Add(email);
}
