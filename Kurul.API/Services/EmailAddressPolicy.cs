namespace Kurul.API.Services;

// Test/demo adreslerine yanlışlıkla e-posta gitmesini önler.
public static class EmailAddressPolicy
{
    private static readonly string[] ReservedDomains = { ".invalid", ".test", ".example", ".localhost" };

    // Varsayılan olarak yalnızca kurumsal (.edu.tr) adreslere gönderilir;
    // geliştirmede Announcements:EmailDomain boş bırakılarak her alan adına açılır.
    public static string RequiredSuffix(IConfiguration config) =>
        config["Announcements:EmailDomain"] ?? ".edu.tr";

    // requiredSuffix ".edu.tr" ise "ad@birim.edu.tr" kabul edilir, "ad@xedu.tr" reddedilir.
    // requiredSuffix boşsa ayrılmış alan adları dışındaki her adres kabul edilir.
    public static bool IsDeliverable(string? email, string requiredSuffix)
    {
        email = email?.Trim() ?? "";
        var at = email.LastIndexOf('@');
        if (at <= 0 || at == email.Length - 1)
            return false;

        var domain = "." + email[(at + 1)..];
        if (ReservedDomains.Any(r => domain.EndsWith(r, StringComparison.OrdinalIgnoreCase)))
            return false;

        return string.IsNullOrWhiteSpace(requiredSuffix) ||
               domain.EndsWith(requiredSuffix.Trim(), StringComparison.OrdinalIgnoreCase);
    }
}
