using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

// Kurulun kendi eklediği karar şablonu (hazır şablonlara ek olarak).
// Taslak şablonlar yalnızca karar hazırlama yetkisi olanlara görünür ve listede ayrı durur.
public class DecisionTemplate
{
    public int Id { get; set; }

    public int AcademicUnitId { get; set; }
    public AcademicUnit AcademicUnit { get; set; } = null!;

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Reference { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Agenda { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string AttachmentsNote { get; set; } = string.Empty;

    public string TableColumnsJson { get; set; } = "[]";

    public bool IsDraft { get; set; } = true;

    public int CreatedById { get; set; }

    [MaxLength(300)]
    public string CreatedByName { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
