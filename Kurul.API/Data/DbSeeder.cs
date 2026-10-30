using System.Security.Cryptography;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Data;

// Kurullar, roller, admin ve Bilgisayar Mühendisliği Bölüm Kurulu personelini yükler.
// Geliştirmede herkes ortak geliştirme parolasıyla girer (aşağıda).
// Üretimde yalnızca boş veritabanında çalışır; personel hesaplarının parolası
// yönetici tarafından belirlenir, kullanıcılar isterse kendi parolasını değiştirir.
public static class DbSeeder
{
    private const string DefaultPassword = "Password123!";

    public static async Task SeedAsync(AppDbContext db, bool isDevelopment)
    {
        if (!isDevelopment && await db.AcademicUnits.AnyAsync())
            return;

        var hasher = new PasswordHasher<AppUser>();

        AppUser NewUser(
            string fullName,
            string title,
            string username,
            string email,
            string role = SystemRoles.User)
        {
            var user = new AppUser
            {
                FullName = fullName,
                Title = title,
                Username = username,
                Email = email,
                Role = role,
                IsActive = true
            };

            user.PasswordHash =
                hasher.HashPassword(user, DefaultPassword);

            return user;
        }

        // 1. Kurullar ve Roller henüz yoksa oluştur
        var bolum = await db.AcademicUnits.FirstOrDefaultAsync(u => u.Code == "bilgisayar-bolum");
        var roles = new Dictionary<(string Code, string Kind), RoleDefinition>();

        if (bolum == null)
        {
            // Sistem Yöneticisi (Admin) eklenir
            if (!await db.Users.AnyAsync(u => u.Username == "admin"))
            {
                var admin = NewUser(
                    "Sistem Yöneticisi", "", "admin",
                    "admin@selcuk.edu.tr", SystemRoles.Admin);
                db.Users.Add(admin);
            }

            bolum = new AcademicUnit
            {
                Code = "bilgisayar-bolum",
                Name = "Bilgisayar Mühendisliği",
                UnitType = "BOLUM",
                ParentName = "Teknoloji Fakültesi",
                BoardName = "Bilgisayar Mühendisliği Bölüm Kurulu",
                TitleLine1 = "BİLGİSAYAR MÜHENDİSLİĞİ BÖLÜMÜ",
                TitleLine2 = "BÖLÜM KURUL KARARI",
                MembersLabel = "Bölüm Kurulu Üyeleri",
                LogoPath = "/su_bilgisayar.png"
            };

            var bilgAbd = new AcademicUnit
            {
                Code = "bilgisayar-abd",
                Name = "Bilgisayar Mühendisliği",
                UnitType = "ABD",
                ParentName = "Fen Bilimleri Enstitüsü",
                BoardName = "Bilgisayar Mühendisliği Anabilim Dalı Kurulu",
                TitleLine1 = "BİLGİSAYAR MÜHENDİSLİĞİ",
                TitleLine2 = "ANABİLİM DALI KURUL KARARI",
                MembersLabel = "Anabilim Dalı Kurul Üyeleri",
                LogoPath = "/su_fbe.png"
            };

            var bilisimAbd = new AcademicUnit
            {
                Code = "bilisim-abd",
                Name = "Bilişim Teknolojileri Mühendisliği",
                UnitType = "ABD",
                ParentName = "Fen Bilimleri Enstitüsü",
                BoardName = "Bilişim Teknolojileri Anabilim Dalı Kurulu",
                TitleLine1 = "BİLİŞİM TEKNOLOJİLERİ MÜHENDİSLİĞİ",
                TitleLine2 = "ANABİLİM DALI KURUL KARARI",
                MembersLabel = "Anabilim Dalı Kurul Üyeleri",
                LogoPath = "/su_fbe.png"
            };

            db.AcademicUnits.AddRange(bolum, bilgAbd, bilisimAbd);

            foreach (var unit in new[] { bolum, bilgAbd, bilisimAbd })
            {
                var definitions = new[]
                {
                    (
                        UnitRoles.Baskan,
                        unit.UnitType == "BOLUM"
                            ? "Bölüm Başkanı"
                            : "ABD Başkanı"
                    ),
                    (UnitRoles.Sekreter, "Sekreter"),
                    (UnitRoles.Uye, "Üye")
                };

                foreach (var (kind, name) in definitions)
                {
                    var role = new RoleDefinition
                    {
                        AcademicUnit = unit,
                        Name = name,
                        Kind = kind,
                        IsSystem = true,
                        PermissionsJson = PermissionJson.Serialize(
                            PermissionJson.DefaultsFor(kind))
                    };

                    roles[(unit.Code, kind)] = role;
                    db.Roles.Add(role);
                }
            }

            await db.SaveChangesAsync();
        }
        else
        {
            var existingRoles = await db.Roles
                .Where(r => r.AcademicUnitId == bolum.Id)
                .ToListAsync();

            foreach (var r in existingRoles)
            {
                roles[(bolum.Code, r.Kind)] = r;
            }
        }

        // 2. Kurul kadrosu: fakültenin gerçek öğretim elemanları (araştırma görevlileri
        //    hariç 18 kişi) ve bölüm sekreteri. Şimdilik üç kurulun (Bölüm Kurulu ve Fen
        //    Bilimleri Enstitüsü'ndeki iki Anabilim Dalı Kurulu) kadrosu aynıdır; kurullar
        //    birbirinden bağımsızdır, üyelikler sonradan her kurulda ayrı düzenlenebilir.
        //    Kaynak: selcuk.edu.tr/birim/personel/6465/0 ve /1 (Ekim 2026).
        //
        //    E-posta adresleri "kullanıcıadı@selcuk.edu.tr" biçimindedir. Geliştirmede
        //    Email:BlockedDomains bu alan adına gönderimi engeller, böylece testlerde hocalara
        //    yanlışlıkla e-posta gitmez. Gerçek adresler, telefonlar ve görevler Kullanıcılar
        //    sayfasından (yönetici) düzenlenir.
        //    Geliştirmede herkes ortak geliştirme parolasıyla girer. Üretimde parolalar
        //    rastgeledir; yönetici her hesap için Kullanıcılar sayfasından parola belirler.
        const string OgretimUyesi = "Öğretim Üyesi";

        var staff = new (string Title, string FullName, string Username, string Duty, string Kind)[]
        {
            ("Prof. Dr.", "Fatih Başçiftçi", "fatih.basciftci", "Bölüm Başkanı", UnitRoles.Baskan),
            ("Dr. Öğr. Üyesi", "Selahattin Alan", "selahattin.alan", "Bölüm Başkan Yardımcısı", UnitRoles.Uye),
            ("Dr. Öğr. Üyesi", "Züleyha Yılmaz Acar", "zuleyha.yilmazacar", "Bölüm Başkan Yardımcısı", UnitRoles.Uye),
            ("Prof. Dr.", "Humar Kahramanlı Örnek", "humar.kahramanliornek", "Bilgisayar Bilimleri A.B.D. Başkanı", UnitRoles.Uye),
            ("Prof. Dr.", "Adem Alpaslan Altun", "adem.altun", "Bilgisayar Yazılımı A.B.D. Başkanı", UnitRoles.Uye),
            ("Prof. Dr.", "Şakir Taşdemir", "sakir.tasdemir", OgretimUyesi, UnitRoles.Uye),
            ("Prof. Dr.", "Nurettin Doğan", "nurettin.dogan", OgretimUyesi, UnitRoles.Uye),
            ("Doç. Dr.", "İlker Ali Özkan", "ilker.ozkan", OgretimUyesi, UnitRoles.Uye),
            ("Doç. Dr.", "Tahir Sağ", "tahir.sag", OgretimUyesi, UnitRoles.Uye),
            ("Doç. Dr.", "Adem Gölcük", "adem.golcuk", OgretimUyesi, UnitRoles.Uye),
            ("Doç. Dr.", "Murat Köklü", "murat.koklu", OgretimUyesi, UnitRoles.Uye),
            ("Doç. Dr.", "Ahmet Cevahir Çınar", "ahmet.cinar", OgretimUyesi, UnitRoles.Uye),
            ("Doç. Dr.", "Gül Nihal Güğül", "gulnihal.gugul", OgretimUyesi, UnitRoles.Uye),
            ("Doç. Dr.", "Onur İnan", "onur.inan", OgretimUyesi, UnitRoles.Uye),
            ("Doç. Dr.", "İlkay Çınar", "ilkay.cinar", OgretimUyesi, UnitRoles.Uye),
            ("Dr. Öğr. Üyesi", "Sema Servi", "sema.servi", OgretimUyesi, UnitRoles.Uye),
            ("Dr. Öğr. Üyesi", "Ali Çetinkaya", "ali.cetinkaya", OgretimUyesi, UnitRoles.Uye),
            ("Öğr. Gör.", "Mustafa Gökmen", "mustafa.gokmen", "Öğretim Görevlisi", UnitRoles.Uye),
            ("", "Hasan Alper Babalık", "hasan.babalik", "Bölüm Sekreteri", UnitRoles.Sekreter),
        };

        var units = await db.AcademicUnits
            .Where(u => u.Code == "bilgisayar-bolum" || u.Code == "bilgisayar-abd" || u.Code == "bilisim-abd")
            .ToListAsync();

        // Kullanıcılar kurullar arasında ortaktır; her kurula ayrı üyelik eklenir.
        var users = new Dictionary<string, AppUser>();
        foreach (var s in staff)
        {
            var email = s.Username + "@selcuk.edu.tr";
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == s.Username || u.Email == email);
            if (user == null)
            {
                user = NewUser(s.FullName, s.Title, s.Username, email);
                if (!isDevelopment)
                    user.PasswordHash = hasher.HashPassword(user, Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)));
                db.Users.Add(user);
            }
            users[s.Username] = user;
        }

        foreach (var unit in units)
        {
            // Üretimde kurulda zaten üye varsa (elle eklenmiş/düzenlenmiş) dokunulmaz.
            if (!isDevelopment && await db.UserUnits.AnyAsync(m => m.AcademicUnitId == unit.Id))
                continue;

            var unitRoles = await db.Roles
                .Where(r => r.AcademicUnitId == unit.Id && r.IsSystem)
                .ToListAsync();
            var roleByKind = unitRoles
                .GroupBy(r => r.Kind)
                .ToDictionary(g => g.Key, g => g.First());

            if (!roleByKind.ContainsKey(UnitRoles.Baskan) ||
                !roleByKind.ContainsKey(UnitRoles.Sekreter) ||
                !roleByKind.ContainsKey(UnitRoles.Uye))
                continue;

            var isBolum = unit.UnitType == "BOLUM";
            var sortOrder = 0;
            foreach (var s in staff)
            {
                var user = users[s.Username];
                var isBoardMember = s.Kind != UnitRoles.Sekreter;

                var hasMembership = user.Id != 0 &&
                    await db.UserUnits.AnyAsync(m => m.UserId == user.Id && m.AcademicUnitId == unit.Id);
                if (hasMembership)
                {
                    if (isBoardMember) sortOrder++;
                    continue;
                }

                // Anabilim dalı kurullarında bölüme özgü görev adları kullanılmaz.
                var duty = isBolum ? s.Duty : s.Kind switch
                {
                    UnitRoles.Baskan => "Anabilim Dalı Başkanı",
                    UnitRoles.Sekreter => "Sekreter",
                    _ => s.Duty.StartsWith("Bölüm") ? OgretimUyesi : s.Duty
                };

                var role = roleByKind[s.Kind];
                db.UserUnits.Add(new UserUnit
                {
                    User = user,
                    AcademicUnitId = unit.Id,
                    Role = role,
                    RoleId = role.Id,
                    UnitRole = s.Kind,
                    Duty = duty,
                    IsBoardMember = isBoardMember,
                    SortOrder = isBoardMember ? ++sortOrder : 0,
                    IsActive = true
                });
            }
        }

        await db.SaveChangesAsync();
    }
}
