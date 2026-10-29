namespace Kurul.API.Models;

// Karara eklenen dosya. Dosyanın kendisi veritabanında değil, sunucudaki Storage klasöründe durur.
public class Attachment
{
    public int Id { get; set; }

    public int DecisionId { get; set; }
    public Decision Decision { get; set; } = null!;

    public string OriginalName { get; set; } = string.Empty;   // kullanıcının gördüğü ad
    public string StoredPath { get; set; } = string.Empty;     // Storage içindeki göreli yol (rastgele dosya adı)
    public string ContentType { get; set; } = "application/octet-stream";
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;         // dosyanın özeti: sonradan değiştirilirse fark edilir
    public int UploadedById { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}