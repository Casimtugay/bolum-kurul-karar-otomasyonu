namespace Kurul.API.Models;

// Bir kurula ait rol. Yetkileri (hangi sayfada okuma/yazma) PermissionsJson içinde tutulur.
public class RoleDefinition
{
    public int Id { get; set; }

    public int AcademicUnitId { get; set; }
    public AcademicUnit AcademicUnit { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    // Rolün "türü": Baskan | Sekreter | Uye | OyKullanmayan.
    // Oy kullanıp kullanmadığını (Baskan, Uye = kurul üyesi) ve eşitlikte başkanlığı belirler. Sonradan değişmez.
    public string Kind { get; set; } = UnitRoles.OyKullanmayan;

    public bool IsSystem { get; set; }   // 4 hazır rol: silinemez, adı değişmez
    public string PermissionsJson { get; set; } = "{}";
}