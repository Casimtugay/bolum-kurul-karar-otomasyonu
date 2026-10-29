using System.ComponentModel.DataAnnotations;

namespace Kurul.API.Models;

public class AcademicUnit
{
    public int Id { get; set; }

    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string UnitType { get; set; } = string.Empty;
    public string ParentName { get; set; } = string.Empty;
    public string BoardName { get; set; } = string.Empty;

    // PDF ve ekranlarda kullanılan sunum bilgileri.
    [MaxLength(200)]
    public string TitleLine1 { get; set; } = string.Empty;

    [MaxLength(200)]
    public string TitleLine2 { get; set; } = string.Empty;

    [MaxLength(200)]
    public string MembersLabel { get; set; } = string.Empty;

    [MaxLength(300)]
    public string LogoPath { get; set; } = string.Empty;

    public ICollection<UserUnit> UserUnits { get; set; }
        = new List<UserUnit>();
}