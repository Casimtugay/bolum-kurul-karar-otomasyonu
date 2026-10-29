namespace Kurul.API.Models;

// Bir kullanıcının bir kuruldaki üyeliği. Aynı kişi bir kurulda Başkan, diğerinde Üye olabilir.
public class UserUnit
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public int AcademicUnitId { get; set; }
    public AcademicUnit AcademicUnit { get; set; } = null!;

    public int RoleId { get; set; }
    public RoleDefinition Role { get; set; } = null!;

    public string UnitRole { get; set; } = UnitRoles.Uye;   // rolün türü (Role.Kind ile aynı tutulur)
    public string Duty { get; set; } = string.Empty;        // ekranda görünen görev (rolün adı)
    public bool IsBoardMember { get; set; }                 // true: oy kullanır ve imza tablosunda yer alır
    public int SortOrder { get; set; }                      // imza kutusu sırası
    public bool IsActive { get; set; } = true;
}