using System.Security.Claims;
using System.Text.Json;
using Kurul.API.Data;
using Kurul.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Kurul.API.Services;

public record PagePerm(bool Read, bool Write);

// Yetki verilebilen sayfalar. Arayüzdeki sayfa kimlikleriyle aynı.
public static class Pages
{
    public const string NewDecision = "yeni-karar";  // yazma: karar oluştur, katılım gir, imza e-postası hazırla
    public const string Voting = "oylama";           // okuma: kararlar/oylama/PDF, yazma: oy kullan ve imzala
    public const string Archive = "arsiv";           // okuma: arşiv ve imzalı kararlar
    public const string Logs = "logs";               // okuma: log kayıtları
    public const string Users = "users";             // okuma: üye listesi, yazma: ekle/düzenle/çıkar/parola
    public const string Roles = "roles";             // okuma: roller, yazma: ekle/düzenle/sil

    public static readonly string[] All = { NewDecision, Voting, Archive, Logs, Users, Roles };

    // "Yazma"nın anlamlı olduğu sayfalar (arşiv ve loglarda yazma yok)
    public static readonly string[] Writable = { NewDecision, Voting, Users, Roles };
}

public static class PermissionJson
{
    private static readonly JsonSerializerOptions Opts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    // Eksik sayfaları kapalı sayar, anlamsız yazma yetkisini siler, yazma varsa okumayı da açar.
    // İşlem kayıtları yalnızca sistem yöneticisine açıktır; kurul rolleri bu yetkiyi alamaz.
    public static Dictionary<string, PagePerm> Normalize(IReadOnlyDictionary<string, PagePerm>? src)
    {
        var result = new Dictionary<string, PagePerm>();
        foreach (var page in Pages.All)
        {
            var p = src != null && src.TryGetValue(page, out var v) && page != Pages.Logs
                ? v
                : new PagePerm(false, false);
            var write = p.Write && Pages.Writable.Contains(page);
            result[page] = new PagePerm(p.Read || write, write);
        }
        return result;
    }

    public static Dictionary<string, PagePerm> Parse(string? json)
    {
        Dictionary<string, PagePerm>? raw = null;
        if (!string.IsNullOrWhiteSpace(json))
        {
            try { raw = JsonSerializer.Deserialize<Dictionary<string, PagePerm>>(json, Opts); }
            catch (JsonException) { /* bozuk kayıt: tüm yetkiler kapalı sayılır */ }
        }
        return Normalize(raw);
    }

    public static string Serialize(IReadOnlyDictionary<string, PagePerm> perms) =>
        JsonSerializer.Serialize(Normalize(perms), Opts);

    public static Dictionary<string, PagePerm> AllTrue()
    {
        var result = new Dictionary<string, PagePerm>();
        foreach (var page in Pages.All) result[page] = new PagePerm(true, Pages.Writable.Contains(page));
        return result;
    }

    private static Dictionary<string, PagePerm> Make(params PagePerm[] inOrder)
    {
        var d = new Dictionary<string, PagePerm>();
        for (var i = 0; i < Pages.All.Length; i++) d[Pages.All[i]] = inOrder[i];
        return Normalize(d);
    }

    // Hazır rollerin varsayılan yetkileri. Sıra: yeni-karar, oylama, arsiv, logs, users, roles
    public static Dictionary<string, PagePerm> DefaultsFor(string kind)
    {
        var rw = new PagePerm(true, true);
        var r = new PagePerm(true, false);
        var none = new PagePerm(false, false);

        return kind switch
        {
            UnitRoles.Baskan => Make(rw, rw, r, r, rw, rw),
            UnitRoles.Sekreter => Make(rw, r, r, r, none, none),
            UnitRoles.Uye => Make(none, rw, r, r, none, none),
            _ => Make(none, r, r, r, none, none)
        };
    }

    // a'daki her yetki b'de de var mı? (yetki yükseltmeyi engellemek için)
    public static bool IsSubset(IReadOnlyDictionary<string, PagePerm> a, IReadOnlyDictionary<string, PagePerm> b)
    {
        foreach (var page in Pages.All)
        {
            var x = a.TryGetValue(page, out var av) ? av : new PagePerm(false, false);
            var y = b.TryGetValue(page, out var bv) ? bv : new PagePerm(false, false);
            if (x.Read && !y.Read) return false;
            if (x.Write && !y.Write) return false;
        }
        return true;
    }
}

// İstek sahibinin seçili kurulda hangi sayfalara okuma/yazma yetkisi olduğunu veritabanından okur.
// Roller sayfasında yapılan değişiklikler mevcut oturumlarda da hemen geçerli olur.
public class PermissionService
{
    private readonly AppDbContext _db;
    private IReadOnlyDictionary<string, PagePerm>? _cache;

    public PermissionService(AppDbContext db) => _db = db;

    public async Task<IReadOnlyDictionary<string, PagePerm>> GetAsync(ClaimsPrincipal user)
    {
        if (_cache != null) return _cache;

        if (user.FindFirstValue(ClaimTypes.Role) == SystemRoles.Admin)
            return _cache = PermissionJson.AllTrue();

        if (!int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ||
            !int.TryParse(user.FindFirstValue("unitId"), out var unitId))
            return _cache = PermissionJson.Parse(null);

        var json = await _db.UserUnits
            .Where(x => x.UserId == userId && x.AcademicUnitId == unitId && x.IsActive)
            .Select(x => x.Role.PermissionsJson)
            .FirstOrDefaultAsync();

        return _cache = PermissionJson.Parse(json);
    }

    public async Task<bool> CanAsync(ClaimsPrincipal user, string page, bool write = false)
    {
        var perms = await GetAsync(user);
        return perms.TryGetValue(page, out var p) && (write ? p.Write : p.Read);
    }
}