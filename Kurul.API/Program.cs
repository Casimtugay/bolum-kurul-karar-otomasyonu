using System.Security.Claims;
using System.Net;
using System.Text;
using System.Threading.RateLimiting;
using Kurul.API.Data;
using Kurul.API.Models;
using Kurul.API.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ---------- Yapılandırma ----------

// Parola, JWT anahtarı ve SMTP bilgileri git'e girmeyen
// appsettings.{Ortam}.local.json dosyasında tutulur (.gitignore).
// Ortam değişkenleri yine en yüksek önceliktedir.
builder.Configuration
    .AddJsonFile(
        $"appsettings.{builder.Environment.EnvironmentName}.local.json",
        optional: true,
        reloadOnChange: true)
    .AddEnvironmentVariables();

var jwtKey = builder.Configuration["Jwt:Key"];
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];

if (string.IsNullOrWhiteSpace(jwtKey) ||
    Encoding.UTF8.GetByteCount(jwtKey) < 32)
{
    throw new InvalidOperationException(
        "Jwt:Key en az 32 bayt uzunluğunda olmalıdır.");
}

if (string.IsNullOrWhiteSpace(jwtIssuer) ||
    string.IsNullOrWhiteSpace(jwtAudience))
{
    throw new InvalidOperationException(
        "Jwt:Issuer ve Jwt:Audience ayarları zorunludur.");
}

if (!builder.Environment.IsDevelopment() &&
    jwtKey.Contains("gelistirme", StringComparison.OrdinalIgnoreCase))
{
    throw new InvalidOperationException(
        "Üretimde geliştirme anahtarı kullanılamaz.");
}

var connectionString =
    builder.Configuration.GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "DefaultConnection bağlantı bilgisi bulunamadı.");
}

// ---------- Ek dosyalarının kalıcı konumu ----------
// Development: mevcut Kurul.API/Storage klasörü korunur.
// Production: yayın klasöründen bağımsız, mutlak bir yol verilmelidir.
var configuredStorage = builder.Configuration["Storage:Root"];
if (string.IsNullOrWhiteSpace(configuredStorage))
{
    configuredStorage = builder.Environment.IsDevelopment() ? "Storage" : "../private/Storage";
}

var storageRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, configuredStorage));
if (!builder.Environment.IsDevelopment())
{
    var publishRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(builder.Environment.ContentRootPath));
    var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
    if (string.Equals(storageRoot, publishRoot, comparison) ||
        storageRoot.StartsWith(publishRoot + Path.DirectorySeparatorChar, comparison))
    {
        // Yayın klasörü içindeki dosyalar yeni yayında silinebilir; üst klasöre yönlendirilir.
        storageRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "private", "Storage"));
    }
}
if (!builder.Environment.IsDevelopment() && !Directory.Exists(storageRoot))
    Console.WriteLine($"Uyarı: Ek dosya klasörü yoktu, oluşturuluyor: {storageRoot}");
Directory.CreateDirectory(storageRoot);

// Tüm dosya servisleri aynı çözülmüş yolu kullanır.
builder.Configuration["Storage:Root"] = storageRoot;
var storageProbe = Path.Combine(storageRoot, $".kurul-write-test-{Guid.NewGuid():N}");
try
{
    using (var stream = new FileStream(storageProbe, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        stream.WriteByte(0);
    File.Delete(storageProbe);
}
catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
{
    throw new InvalidOperationException("Ek dosya klasöründe yazma/silme izni yok veya disk kullanılamıyor.", ex);
}

// ---------- Servisler ----------

builder.Services.AddControllers();
builder.Services.AddOpenApi();


builder.Services.AddSingleton<SessionStampInterceptor>();

builder.Services.AddDbContext<AppDbContext>((services, options) =>
{
    options.UseSqlServer(connectionString);

    options.AddInterceptors(
        services.GetRequiredService<SessionStampInterceptor>());
});

builder.Services.AddSingleton<TokenService>();
builder.Services.AddScoped<ISignatureService, DemoSignatureService>();
builder.Services.AddScoped<PermissionService>();
builder.Services.AddScoped<LoginCaptchaService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddSingleton<EmailQueue>();
builder.Services.AddSingleton<IEmailQueue>(sp => sp.GetRequiredService<EmailQueue>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<EmailQueue>());
builder.Services.AddSingleton<RsvpTokenService>();
builder.Services.AddSingleton<DecisionSealService>();


// ---------- JWT doğrulama ----------

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = true;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            RequireSignedTokens = true,
            RequireExpirationTime = true,

            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 },

            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey)),

            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role,
            ClockSkew = TimeSpan.FromMinutes(1)
        };

        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var principal = context.Principal;

                if (principal == null ||
                    !int.TryParse(
                        principal.FindFirstValue(ClaimTypes.NameIdentifier),
                        out var userId) ||
                    userId <= 0)
                {
                    context.Fail("Geçersiz kullanıcı bilgisi.");
                    return;
                }

                // Eski sürümden kalan, damga içermeyen token'lar da reddedilir.
                if (!Guid.TryParse(
                        principal.FindFirstValue("sessionStamp"),
                        out var tokenStamp))
                {
                    context.Fail("Oturum yenilenmeli.");
                    return;
                }

                var db = context.HttpContext.RequestServices
                    .GetRequiredService<AppDbContext>();

                var ct = context.HttpContext.RequestAborted;

                var user = await db.Users
                    .AsNoTracking()
                    .Where(u => u.Id == userId)
                    .Select(u => new
                    {
                        u.IsActive,
                        u.Role,
                        u.SessionStamp
                    })
                    .SingleOrDefaultAsync(ct);

                if (user == null || !user.IsActive)
                {
                    context.Fail("Kullanıcı hesabı aktif değil.");
                    return;
                }

                if (user.SessionStamp != tokenStamp)
                {
                    context.Fail(
                        "Hesap veya parola değişmiş. Yeniden giriş gerekli.");
                    return;
                }

                var tokenRole =
                    principal.FindFirstValue(ClaimTypes.Role);

                if (!string.Equals(
                        tokenRole,
                        user.Role,
                        StringComparison.Ordinal))
                {
                    context.Fail(
                        "Sistem rolü değişmiş. Yeniden giriş gerekli.");
                    return;
                }

                var unitIdText = principal.FindFirstValue("unitId");
                var tokenUnitCode = principal.FindFirstValue("unitCode");
                var tokenUnitRole = principal.FindFirstValue("unitRole");

                // Kurul seçilmeden verilen giriş token'ı.
                if (unitIdText == null)
                {
                    if (tokenUnitCode != null || tokenUnitRole != null)
                    {
                        context.Fail("Eksik kurul bilgisi.");
                        return;
                    }

                    if (user.Role != SystemRoles.Admin)
                    {
                        var hasMembership = await db.UserUnits.AnyAsync(
                            m => m.UserId == userId && m.IsActive,
                            ct);

                        if (!hasMembership)
                            context.Fail("Aktif kurul üyeliği bulunamadı.");
                    }

                    return;
                }

                if (!int.TryParse(unitIdText, out var unitId) ||
                    unitId <= 0)
                {
                    context.Fail("Geçersiz kurul bilgisi.");
                    return;
                }

                var unitCode = await db.AcademicUnits
                    .AsNoTracking()
                    .Where(u => u.Id == unitId)
                    .Select(u => u.Code)
                    .SingleOrDefaultAsync(ct);

                if (unitCode == null ||
                    !string.Equals(
                        unitCode,
                        tokenUnitCode,
                        StringComparison.Ordinal))
                {
                    context.Fail("Kurul bilgisi geçersiz.");
                    return;
                }

                if (user.Role == SystemRoles.Admin)
                {
                    if (tokenUnitRole != SystemRoles.Admin)
                        context.Fail("Kurul oturumu yenilenmeli.");

                    return;
                }

                var membership = await db.UserUnits
                    .AsNoTracking()
                    .Where(m =>
                        m.UserId == userId &&
                        m.AcademicUnitId == unitId &&
                        m.IsActive)
                    .Select(m => new
                    {
                        m.UnitRole
                    })
                    .SingleOrDefaultAsync(ct);

                if (membership == null)
                {
                    context.Fail("Aktif kurul üyeliği bulunamadı.");
                    return;
                }

                if (!string.Equals(
                        membership.UnitRole,
                        tokenUnitRole,
                        StringComparison.Ordinal))
                {
                    context.Fail(
                        "Kurul rolü değişmiş. Yeniden giriş gerekli.");
                }

                // Sayfa izinleri ayrıca PermissionService ile kontrol edilir.
            },

            OnChallenge = async context =>
            {
                context.HandleResponse();

                if (context.Response.HasStarted)
                    return;

                context.Response.StatusCode =
                    StatusCodes.Status401Unauthorized;

                context.Response.Headers["WWW-Authenticate"] = "Bearer";

                await context.Response.WriteAsJsonAsync(new
                {
                    error =
                        "Oturum geçersiz veya süresi dolmuş. Tekrar giriş yapın."
                });
            },

            OnForbidden = async context =>
            {
                if (context.Response.HasStarted)
                    return;

                context.Response.StatusCode =
                    StatusCodes.Status403Forbidden;

                await context.Response.WriteAsJsonAsync(new
                {
                    error = "Bu işlem için yetkiniz yok."
                });
            }
        };
    });

builder.Services.AddAuthorization();

// ---------- CORS ----------

var origins = builder.Configuration
    .GetSection("Cors:Origins")
    .Get<string[]>()
    ?? (builder.Environment.IsDevelopment()
        ? new[] { "http://localhost:5173" }
        : Array.Empty<string>());

origins = origins
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Select(origin => origin.Trim().TrimEnd('/'))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (origins.Length > 0)
        {
            policy
                .WithOrigins(origins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

// ---------- Giriş denemesi sınırlaması ----------

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode =
        StatusCodes.Status429TooManyRequests;

    options.OnRejected = async (context, ct) =>
    {
        await context.HttpContext.Response.WriteAsJsonAsync(
            new
            {
                error = "Çok fazla deneme yapıldı. Bir dakika sonra tekrar deneyin."
            },
            cancellationToken: ct);
    };

    options.AddPolicy("login", http =>
        RateLimitPartition.GetFixedWindowLimiter(
            http.Connection.RemoteIpAddress?.ToString() ?? "bilinmiyor",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));

    options.AddPolicy("captcha", http =>
    RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "bilinmiyor",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));

    // E-postadaki girişsiz katılım bağlantıları.
    options.AddPolicy("rsvp", http =>
    RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "bilinmiyor",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 30,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));

});

// ---------- Ters proxy ----------

// Bilgi İşlem gerçek ters proxy adreslerini ReverseProxy:KnownProxies üzerinden verir.
// Varsayılan güvenilir yerel adresler korunur; bütün proxy'lere güven açılmaz.
var trustedProxies = builder.Configuration
    .GetSection("ReverseProxy:KnownProxies")
    .Get<string[]>() ?? Array.Empty<string>();
var proxyAddresses = trustedProxies.Select(value =>
{
    if (!IPAddress.TryParse(value, out var address))
        throw new InvalidOperationException("ReverseProxy:KnownProxies geçerli IP adresleri içermelidir.");
    return address;
}).ToArray();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor |
        ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    foreach (var address in proxyAddresses)
        options.KnownProxies.Add(address);
});

var app = builder.Build();

app.UseForwardedHeaders();

// ---------- Güvenlik başlıkları ----------

app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        var headers = context.Response.Headers;

        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "no-referrer";

        if (context.Request.Path.StartsWithSegments("/api"))
            headers["Cache-Control"] = "no-store";

        return Task.CompletedTask;
    });

    await next();
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseExceptionHandler(errorApp =>
        errorApp.Run(async context =>
        {
            // Ayrıntı yalnızca sunucu günlüğüne yazılır; istemciye stack trace gönderilmez.
            var feat = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerPathFeature>();
            if (feat?.Error != null)
            {
                context.RequestServices
                    .GetRequiredService<ILogger<Program>>()
                    .LogError(feat.Error, "İşlenmeyen hata: {Path}", feat.Path);
            }

            context.Response.StatusCode =
                StatusCodes.Status500InternalServerError;

            await context.Response.WriteAsJsonAsync(new
            {
                error = "Sunucuda beklenmeyen bir hata oluştu."
            });
        }));

    if (builder.Configuration.GetValue<bool>("EnableHttpsRedirection", false))
    {
        app.UseHsts();
        app.UseHttpsRedirection();
    }
}

// Bekleyen migration'lar her açılışta uygulanır (paylaşımlı hostingde ayrı adım yok).
// Hata yutulmaz: eksik şemayla çalışmak yerine uygulama açılmaz ve günlükte görünür.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        await db.Database.MigrateAsync();
        await DbSeeder.SeedAsync(db, app.Environment.IsDevelopment());
    }
    catch (Exception ex)
    {
        scope.ServiceProvider.GetRequiredService<ILogger<Program>>()
            .LogCritical(ex, "Veritabanı migration veya seed işlemi başarısız oldu.");
        throw;
    }
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();
app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Bilinmeyen API adresleri SPA sayfası yerine JSON 404 döner.
app.Map("/api/{**rest}", () =>
    Results.NotFound(new { error = "İstenen API adresi bulunamadı." }));

app.MapFallbackToFile("index.html");

app.MapGet(
    "/api/health",
    async Task<IResult> (
        AppDbContext db,
        IHostEnvironment env,
        CancellationToken ct) =>
    {
        if (!env.IsDevelopment())
            return Results.Ok(new { status = "ok" });

        return Results.Ok(new
        {
            status = "ok",
            users = await db.Users.CountAsync(ct),
            units = await db.AcademicUnits.CountAsync(ct),
            memberships = await db.UserUnits.CountAsync(ct),
            decisions = await db.Decisions.CountAsync(ct),
            participants = await db.DecisionParticipants.CountAsync(ct)
        });
    });

app.Run();