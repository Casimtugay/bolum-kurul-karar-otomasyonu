namespace Kurul.API.Models;

// "Log Kayıtları" ekranının veri kaynağı
public class AuditLog
{
    public long Id { get; set; }
    public int? AcademicUnitId { get; set; }
    public int? UserId { get; set; }
    public string? Username { get; set; }
    public string Level { get; set; } = "info";             // info | warn | error
    public string Message { get; set; } = string.Empty;
    public string? Detail { get; set; }
    public string? Ip { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}