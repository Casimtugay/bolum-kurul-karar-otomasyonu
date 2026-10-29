namespace Kurul.API.Models;

public class AppUser
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = SystemRoles.User;
    public bool IsActive { get; set; } = true;
    public Guid SessionStamp { get; set; } = Guid.NewGuid();
    // Mevcut hesaplar migration ile false kalır.
    public bool MustChangePassword { get; set; }

    // Profilde kayıtlı imza (arka planı kaldırılmış, şeffaf PNG). Kararları imzalarken tek tıkla kullanılır.
    public byte[]? SavedSignaturePng { get; set; }
    public DateTime? SavedSignatureUpdatedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<UserUnit> UserUnits { get; set; } = new List<UserUnit>();
}
