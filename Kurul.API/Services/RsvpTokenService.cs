using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace Kurul.API.Services;

// Duyuru e-postasındaki "Katılıyorum / Katılamayacağım" bağlantıları için kişiye özel,
// imzalı anahtar üretir. Anahtar yalnızca tek bir üyenin tek bir bildirimini (katılım
// cevabını) değiştirebilir; giriş yapmadan cevap verilebilmesi bu sayede güvenlidir.
// Biçim: "{bildirimId}.{imza}". İmza Jwt:Key'den türetilen ayrı bir anahtarla atılır;
// Jwt:Key değişirse eski e-postalardaki bağlantılar geçersiz olur.
public sealed class RsvpTokenService
{
    private readonly byte[] _key;

    public RsvpTokenService(IConfiguration config)
    {
        var jwtKey = config["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key ayarı zorunludur.");

        _key = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(jwtKey),
            Encoding.UTF8.GetBytes("kurul-rsvp-v1"));
    }

    public string Create(int notificationId) =>
        notificationId.ToString(CultureInfo.InvariantCulture) + "." +
        WebEncoders.Base64UrlEncode(Sign(notificationId));

    public bool TryRead(string? token, out int notificationId)
    {
        notificationId = 0;

        if (string.IsNullOrWhiteSpace(token) || token.Length > 100)
            return false;

        var dot = token.IndexOf('.');
        if (dot <= 0 ||
            !int.TryParse(token[..dot], NumberStyles.None, CultureInfo.InvariantCulture, out var id) ||
            id <= 0)
            return false;

        byte[] given;
        try
        {
            given = WebEncoders.Base64UrlDecode(token[(dot + 1)..]);
        }
        catch (FormatException)
        {
            return false;
        }

        if (!CryptographicOperations.FixedTimeEquals(given, Sign(id)))
            return false;

        notificationId = id;
        return true;
    }

    // 128 bit imza tahmin edilemez ve bağlantıyı kısa tutar.
    private byte[] Sign(int notificationId) =>
        HMACSHA256.HashData(
            _key,
            Encoding.UTF8.GetBytes("rsvp:" + notificationId.ToString(CultureInfo.InvariantCulture)))[..16];
}
