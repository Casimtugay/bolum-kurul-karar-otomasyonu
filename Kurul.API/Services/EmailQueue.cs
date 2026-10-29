using System.Threading.Channels;

namespace Kurul.API.Services;

public record OutgoingEmail(string To, string Subject, string HtmlBody);

public interface IEmailQueue
{
    // SMTP ayarı (Smtp:Host) yoksa false; e-posta kuyruğa alınmamalıdır.
    bool IsConfigured { get; }

    void Enqueue(OutgoingEmail email);
}

// Kişiye özel duyuru e-postaları tek tek gönderilir. Bu, 20 üyelik bir kurulda bile
// saniyeler sürebileceği için gönderim isteği beklemeden arka planda, sırayla yapılır.
// Gönderilemeyen e-posta sunucu günlüğüne yazılır; diğerleri gönderilmeye devam eder.
public sealed class EmailQueue : BackgroundService, IEmailQueue
{
    private readonly Channel<OutgoingEmail> _channel = Channel.CreateUnbounded<OutgoingEmail>();
    private readonly IServiceScopeFactory _scopes;
    private readonly IConfiguration _config;
    private readonly ILogger<EmailQueue> _logger;

    public EmailQueue(IServiceScopeFactory scopes, IConfiguration config, ILogger<EmailQueue> logger)
    {
        _scopes = scopes;
        _config = config;
        _logger = logger;
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_config["Smtp:Host"]);

    public void Enqueue(OutgoingEmail email) => _channel.Writer.TryWrite(email);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var email in _channel.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var sender = scope.ServiceProvider.GetRequiredService<IEmailService>();
                await sender.SendHtmlEmailsAsync(new[] { email.To }, email.Subject, email.HtmlBody, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "E-posta gönderilemedi: {Subject}", email.Subject);
            }
        }
    }
}
