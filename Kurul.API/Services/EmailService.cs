using System.Net;
using System.Net.Mail;

namespace Kurul.API.Services;

// SMTP bilgileri yapılandırmadan okunur (Smtp:Host, Port, EnableSsl, Username, Password, From).
// Gizli değerler appsettings.{Ortam}.local.json, user-secrets veya ortam değişkeninde tutulur.
public sealed class EmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_config["Smtp:Host"]);

    public Task SendEmailAsync(string toEmail, string subject, string body, CancellationToken ct = default) =>
        SendAsync(new[] { toEmail }, subject, body, isHtml: false, ct);

    public Task SendHtmlEmailsAsync(IEnumerable<string> toEmails, string subject, string htmlBody, CancellationToken ct = default) =>
        SendAsync(toEmails, subject, htmlBody, isHtml: true, ct);

    private async Task SendAsync(
        IEnumerable<string> toList,
        string subject,
        string body,
        bool isHtml,
        CancellationToken ct)
    {
        var recipients = (toList ?? Enumerable.Empty<string>())
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Geliştirmede gerçek personel adreslerine (ör. selcuk.edu.tr) yanlışlıkla e-posta gitmesin:
        // Email:BlockedDomains içindeki alan adlarına gönderim yapılmaz, yalnızca günlüğe yazılır.
        // Yalnızca tam alan adı eşleşir: "selcuk.edu.tr" engellenir, "ogr.selcuk.edu.tr" engellenmez.
        var blocked = _config.GetSection("Email:BlockedDomains").Get<string[]>() ?? [];
        if (blocked.Length > 0)
        {
            var skipped = recipients.Where(e => blocked.Any(d =>
                e.EndsWith("@" + d.Trim(), StringComparison.OrdinalIgnoreCase))).ToList();

            if (skipped.Count > 0)
            {
                _logger.LogWarning(
                    "Engellenen alan adına e-posta gönderilmedi ({Count} alıcı): {Subject}",
                    skipped.Count, subject);
                recipients = recipients.Except(skipped, StringComparer.OrdinalIgnoreCase).ToList();
            }
        }

        if (recipients.Count == 0)
            return;

        if (!IsConfigured)
            throw new InvalidOperationException("E-posta sunucusu (Smtp:Host) yapılandırılmamış.");

        var host = _config["Smtp:Host"]!;
        var port = int.TryParse(_config["Smtp:Port"], out var p) ? p : 587;
        var from = _config["Smtp:From"] ?? _config["Smtp:Username"] ?? "noreply@selcuk.edu.tr";
        var user = _config["Smtp:Username"];
        var pass = _config["Smtp:Password"];
        // Parola gönderiliyorsa TLS zorunludur; aksi halde kimlik bilgisi açık metin gider.
        var enableSsl = (bool.TryParse(_config["Smtp:EnableSsl"], out var ssl) && ssl) ||
                        !string.IsNullOrEmpty(pass);

        using var client = new SmtpClient(host, port) { EnableSsl = enableSsl };

        if (!string.IsNullOrEmpty(user) && !string.IsNullOrEmpty(pass))
            client.Credentials = new NetworkCredential(user, pass);

        using var message = new MailMessage
        {
            From = new MailAddress(from, "Kurul Otomasyonu"),
            Subject = subject,
            Body = body,
            IsBodyHtml = isHtml
        };

        if (recipients.Count == 1)
        {
            message.To.Add(recipients[0]);
        }
        else
        {
            message.To.Add(message.From);
            foreach (var recipient in recipients)
                message.Bcc.Add(recipient);
        }

        await client.SendMailAsync(message, ct);
        _logger.LogInformation("{Count} alıcıya e-posta gönderildi: {Subject}", recipients.Count, subject);
    }
}
