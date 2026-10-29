using System.Security.Cryptography;

namespace Kurul.API.Services;

// "Belge Doğrula" bağlantıları ve PDF'ye basılan doğrulama kodu.
public static class DecisionVerification
{
    // Karışabilecek karakterler (0/O, 1/I/L) kullanılmaz; kod elle de yazılabilir.
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    // Biçim: ABCDE-FGHJK (10 rastgele karakter, ~49 bit).
    public static string NewCode()
    {
        Span<char> chars = stackalloc char[11];
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = i == 5
                ? '-'
                : Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }
        return new string(chars);
    }

    // Kullanıcının yazdığı kodu karşılaştırılabilir biçime getirir (küçük harf, boşluk, tire).
    public static string? Normalize(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;

        var letters = code
            .Where(char.IsLetterOrDigit)
            .Select(c => char.ToUpperInvariant(c))
            .ToArray();

        if (letters.Length != 10 || letters.Any(c => !Alphabet.Contains(c)))
            return null;

        return new string(letters, 0, 5) + "-" + new string(letters, 5, 5);
    }

    // Bağlantılar istek başlığından (Host) değil yapılandırmadan üretilir.
    // App:PublicUrl yoksa ilk CORS adresi (geliştirmede http://localhost:5173) kullanılır.
    public static string PublicBaseUrl(IConfiguration config)
    {
        var url = config["App:PublicUrl"];
        if (string.IsNullOrWhiteSpace(url))
            url = config.GetSection("Cors:Origins").Get<string[]>()?.FirstOrDefault();
        return (url ?? "").Trim().TrimEnd('/');
    }

    public static string? Url(string? baseUrl, string? code) =>
        string.IsNullOrEmpty(baseUrl) || string.IsNullOrEmpty(code)
            ? null
            : $"{baseUrl}/dogrula/{code}";
}
