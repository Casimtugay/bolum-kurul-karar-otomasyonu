namespace Kurul.API.Services;

public interface IEmailService
{
    // SMTP ayarları (Smtp:Host) tanımlı değilse false döner; gönderim denenmez.
    bool IsConfigured { get; }

    Task SendEmailAsync(string toEmail, string subject, string body, CancellationToken ct = default);

    // Alıcılar birbirinin adresini görmesin diye BCC ile gönderilir.
    Task SendHtmlEmailsAsync(IEnumerable<string> toEmails, string subject, string htmlBody, CancellationToken ct = default);
}
