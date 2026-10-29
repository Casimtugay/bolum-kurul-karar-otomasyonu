using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using PdfSharp.Pdf.Signatures;

namespace Kurul.API.Services;

// Tüm imzalar tamamlanınca son PDF'yi sistem sertifikasıyla mühürler.
// Mühür PDF'nin içine gömülür: Adobe Reader vb. belgede değişiklik yapılıp
// yapılmadığını gösterir. Sertifika kendinden imzalıdır (kurumsal güven zinciri yok);
// bu nedenle okuyucu "imzalayan doğrulanamadı" diyebilir, ancak bütünlük kontrolü geçerlidir.
public sealed class DecisionSealService
{
    public const string SubjectName =
        "CN=Selçuk Üniversitesi Kurul Karar Sistemi, O=Selçuk Üniversitesi, C=TR";

    private readonly IConfiguration _config;
    private readonly ILogger<DecisionSealService> _logger;
    private readonly Lock _gate = new();
    private X509Certificate2? _certificate;

    public DecisionSealService(IConfiguration config, ILogger<DecisionSealService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public sealed record SealCheck(bool Sealed, bool Valid, string? Signer, DateTime? SignedAt);

    public X509Certificate2 Certificate
    {
        get
        {
            lock (_gate)
                return _certificate ??= LoadOrCreate();
        }
    }

    public byte[] Seal(byte[] pdf, string reason)
    {
        using var input = new MemoryStream(pdf, writable: false);
        using var document = PdfReader.Open(input, PdfDocumentOpenMode.Modify);

        var signer = new PdfSharpDefaultSigner(Certificate, PdfMessageDigestType.SHA256, null);

        // Görünmez mühür: sayfa düzeni değişmez, mühür PDF okuyucunun imza panelinde görünür.
        DigitalSignatureHandler.ForDocument(document, signer, new DigitalSignatureOptions
        {
            Reason = reason,
            Location = "Konya",
            ContactInfo = "Kurul Karar Sistemi",
            Rectangle = new XRect(0, 0, 0, 0)
        });

        using var output = new MemoryStream();
        document.Save(output);
        return output.ToArray();
    }

    // PDF'ye gömülü son mührü (ByteRange + CMS) kontrol eder.
    public static SealCheck Check(byte[] pdf)
    {
        var text = Encoding.Latin1.GetString(pdf);
        var matches = Regex.Matches(
            text, @"/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]");

        if (matches.Count == 0)
            return new SealCheck(false, false, null, null);

        var m = matches[^1];
        try
        {
            long a = long.Parse(m.Groups[1].Value), b = long.Parse(m.Groups[2].Value),
                 c = long.Parse(m.Groups[3].Value), d = long.Parse(m.Groups[4].Value);

            // İmza son değişikliği kapsamalı; sonradan eklenen bölüm mührü geçersiz kılar.
            if (a != 0 || c + d != pdf.Length || c <= a + b + 1)
                return new SealCheck(true, false, null, null);

            var signed = new byte[b + d];
            Array.Copy(pdf, a, signed, 0, b);
            Array.Copy(pdf, c, signed, b, d);

            var hex = text.Substring((int)(a + b + 1), (int)(c - (a + b) - 2)).TrimEnd('0');
            if (hex.Length % 2 == 1) hex += "0";

            var cms = new SignedCms(new ContentInfo(signed), detached: true);
            cms.Decode(Convert.FromHexString(hex));
            cms.CheckSignature(verifySignatureOnly: true);

            var info = cms.SignerInfos[0];
            var time = info.SignedAttributes
                .Cast<CryptographicAttributeObject>()
                .SelectMany(x => x.Values.Cast<AsnEncodedData>())
                .OfType<Pkcs9SigningTime>()
                .Select(x => (DateTime?)x.SigningTime.ToUniversalTime())
                .FirstOrDefault();

            return new SealCheck(true, true, info.Certificate?.GetNameInfo(X509NameType.SimpleName, false), time);
        }
        catch (Exception ex) when (ex is CryptographicException or FormatException or ArgumentException or OverflowException)
        {
            return new SealCheck(true, false, null, null);
        }
    }

    // Sertifika ek dosya klasöründe (yayın klasörü dışında) saklanır; yeni yayında silinmez.
    // Parola Seal:CertificatePassword ile verilebilir; yoksa Jwt:Key'den türetilir.
    private X509Certificate2 LoadOrCreate()
    {
        var root = _config["Storage:Root"];
        if (string.IsNullOrWhiteSpace(root))
            throw new InvalidOperationException("Storage:Root tanımlı değil.");

        var folder = Path.Combine(root, "keys");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "kurul-muhur.pfx");
        var password = CertificatePassword();

        if (File.Exists(path))
        {
            try
            {
                return X509CertificateLoader.LoadPkcs12FromFile(
                    path, password, X509KeyStorageFlags.EphemeralKeySet);
            }
            catch (CryptographicException ex)
            {
                // Parola değişmişse eski dosya saklanır, yeni sertifika üretilir.
                // Eski mühürlü PDF'ler kendi içlerindeki sertifikayla doğrulanmaya devam eder.
                var backup = path + $".{DateTime.UtcNow:yyyyMMddHHmmss}.bak";
                File.Move(path, backup);
                _logger.LogWarning(ex, "Mühür sertifikası açılamadı; yenisi üretiliyor. Eski dosya: {Backup}", backup);
            }
        }

        using var rsa = RSA.Create(3072);
        var request = new CertificateRequest(
            SubjectName, rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509KeyUsageExtension(
            X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.NonRepudiation, true));
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));

        using var created = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(20));
        var pfx = created.Export(X509ContentType.Pfx, password);

        // Aynı anda iki süreç üretirse ilk yazılan kullanılır.
        try
        {
            using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            file.Write(pfx);
        }
        catch (IOException) when (File.Exists(path))
        {
        }

        _logger.LogInformation("Kurul mühür sertifikası oluşturuldu: {Path}", path);
        return X509CertificateLoader.LoadPkcs12FromFile(
            path, password, X509KeyStorageFlags.EphemeralKeySet);
    }

    private string CertificatePassword()
    {
        var configured = _config["Seal:CertificatePassword"];
        if (!string.IsNullOrWhiteSpace(configured))
            return configured;

        var jwtKey = _config["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey))
            throw new InvalidOperationException("Mühür sertifikası parolası için Jwt:Key gerekli.");

        return Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(jwtKey),
            Encoding.UTF8.GetBytes("kurul-muhur-sertifikasi")));
    }
}
