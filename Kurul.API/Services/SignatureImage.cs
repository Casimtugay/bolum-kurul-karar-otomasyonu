using System.Buffers.Binary;

namespace Kurul.API.Services;

// İmza görüntüsü: tarayıcıda arka planı kaldırılıp kırpılmış şeffaf PNG.
// Sunucu yalnızca biçim, boyut ve ölçüleri denetler; içeriğe dokunmaz.
public static class SignatureImage
{
    public const int MaxBytes = 300 * 1024;
    private const int MinSide = 40;
    private const int MaxSide = 2000;
    private const string Prefix = "data:image/png;base64,";

    private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

    // "data:image/png;base64,..." metnini PNG baytlarına çevirir; geçersizse hata mesajı döner.
    public static bool TryParse(string? dataUrl, out byte[] png, out string error)
    {
        png = Array.Empty<byte>();
        error = "";

        if (string.IsNullOrWhiteSpace(dataUrl) ||
            !dataUrl.StartsWith(Prefix, StringComparison.Ordinal))
        {
            error = "İmza görüntüsü PNG biçiminde olmalıdır.";
            return false;
        }

        // Base64 uzunluğu ~4/3 oranında büyür; çözmeden önce kaba sınır.
        if (dataUrl.Length - Prefix.Length > MaxBytes / 3 * 4 + 8)
        {
            error = "İmza görüntüsü çok büyük (en fazla 300 KB).";
            return false;
        }

        try
        {
            png = Convert.FromBase64String(dataUrl[Prefix.Length..]);
        }
        catch (FormatException)
        {
            error = "İmza görüntüsü okunamadı.";
            return false;
        }

        return Validate(png, out error);
    }

    public static bool Validate(byte[] png, out string error)
    {
        error = "";

        if (png.Length == 0 || png.Length > MaxBytes)
        {
            error = "İmza görüntüsü boş veya çok büyük (en fazla 300 KB).";
            return false;
        }

        // PNG imzası + IHDR parçası: genişlik/yükseklik 16. bayttan başlar.
        if (png.Length < 24 ||
            !png.AsSpan(0, 8).SequenceEqual(PngSignature) ||
            png[12] != (byte)'I' || png[13] != (byte)'H' || png[14] != (byte)'D' || png[15] != (byte)'R')
        {
            error = "İmza görüntüsü geçerli bir PNG değil.";
            return false;
        }

        var width = BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(16, 4));
        var height = BinaryPrimitives.ReadInt32BigEndian(png.AsSpan(20, 4));

        if (width < MinSide || height < MinSide / 2 || width > MaxSide || height > MaxSide)
        {
            error = "İmza görüntüsünün ölçüleri uygun değil.";
            return false;
        }

        return true;
    }

    public static string ToDataUrl(byte[] png) => Prefix + Convert.ToBase64String(png);
}
