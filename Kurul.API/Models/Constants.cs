namespace Kurul.API.Models;

// Sistem geneli rol: sadece Admin ayrı, diğer herkes "User".
// Asıl yetki, kullanıcının o kuruldaki rolünden (UserUnit.UnitRole) gelir.
public static class SystemRoles
{
    public const string Admin = "Admin";
    public const string User = "User";
}

public static class UnitRoles
{
    public const string Baskan = "Baskan";
    public const string Sekreter = "Sekreter";
    public const string Uye = "Uye";
    // Başkanın oluşturduğu, oy kullanmayan özel rollerin türü (hazır rol değildir).
    public const string OyKullanmayan = "OyKullanmayan";
}

public static class DecisionStatus
{
    public const string Taslak = "Taslak";
    public const string Oylamada = "Oylamada";
    public const string ImzaBekliyor = "ImzaBekliyor";
    public const string Imzalandi = "Imzalandi";
    public const string Reddedildi = "Reddedildi";
    public const string IptalEdildi = "IptalEdildi";
}

public static class AttendanceStatus
{
    public const string Katilir = "Katilir";
    public const string Izinli = "Izinli";
    public const string Gorevli = "Gorevli";
}

public static class VoteType
{
    public const string Kabul = "Kabul";
    public const string Ret = "Ret";
}

public static class AnnouncementAttendance
{
    public const string Belirsiz = "Belirsiz";
    public const string Katilacak = "Katilacak";
    public const string Katilmayacak = "Katilmayacak";
}
