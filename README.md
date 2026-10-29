# Bölüm Kurul Karar Otomasyonu

Selçuk Üniversitesi Teknoloji Fakültesi Bilgisayar Mühendisliği
bitirme projesi kapsamında geliştirilen web uygulamasıdır.

Kurul kararlarının hazırlanmasını, oylanmasını, demo imza sürecini,
PDF çıktılarının oluşturulmasını ve arşivlenmesini sağlar.

Hedef kullanım ortamı üniversitenin sunucu altyapısıdır.

## Desteklenen kurullar

- Bilgisayar Mühendisliği Bölüm Kurulu
- Bilgisayar Mühendisliği Anabilim Dalı Kurulu
- Bilişim Teknolojileri Mühendisliği Anabilim Dalı Kurulu

Kullanıcılar kurumsal e-posta adresiyle (`kullanıcıadı@selcuk.edu.tr`) giriş yapar; son çalışılan kurul kendiliğinden açılır, kurul üst çubuktan değiştirilir.
Kararlar ve yönetim işlemleri seçilen kurul kapsamında yürütülür.

## Teknolojiler

- Backend: ASP.NET Core / .NET 10
- Veritabanı: Microsoft SQL Server
- Veri erişimi: Entity Framework Core
- Frontend: React, Vite ve Material UI
- Kimlik doğrulama: JWT
- PDF üretimi: QuestPDF
- Yerel SQL Server ortamı: Docker
- Otomatik kontroller: Kurul.Checks

Geliştirme macOS ARM64 üzerinde yapılmıştır. Yerel SQL Server
konteyneri linux/amd64 platformunda çalıştırılmaktadır.

## Özellikler

### Toplantı yönetimi

- Toplantının tarihi, numarası ve katılım listesi bir kez tanımlanır. Yıl ve numara kurul bazında benzersizdir.
- Birden fazla karar aynı toplantıya bağlanır; karar numarası toplantı içinde otomatik artar. Silinen kararın numarası tekrar verilmez.
- Toplantı oluşturulurken kurulun o anki aktif üyeleri ad ve görev bilgisiyle toplantıya kaydedilir; sonradan kullanıcı profilinin değişmesi geçmiş toplantıyı değiştirmez. Aktif üyeler arasında tam olarak bir başkan bulunmalıdır.
- Katılım durumu (katılır / izinli / görevli) toplantıya ortaktır ve oy başlamamış kararlara yansır.
- Toplantıdaki ilk başarılı oyla katılım listesi kilitlenir. Kararın iptal edilmesi veya silinmesi bu kilidi kaldırmaz.
- Toplantıya bağlı bir kararın katılımı karar ekranından değil, toplantı üzerinden yönetilir.
- Yeniden değerlendirme taslağı seçilen toplantıya bağlanır; katılım kaynak karardan değil hedef toplantıdan alınır.
- Toplantı kaydı olmayan eski kararlar, numaraları aynı diye otomatik olarak toplantılara birleştirilmez. Eski kararların kullandığı toplantı numaraları yeni toplantılara verilmez.

### Karar yönetimi

- Kurula göre karar şablonu seçimi
- Toplantı seçerek veya oluşturarak karar ekleme; karar numarası otomatik verilir
- Gündem, ilgi, karar metni ve tablo düzenleme
- Taslak karar güncelleme ve silme
- Ek dosya yükleme, indirme ve silme
- Katılım durumlarını toplantı üzerinden belirleme
- Kabul ve gerekçeli ret oyu
- İmza sürecini gerekçeli iptal etme
- İptal edilen veya reddedilen karardan yeni taslak oluşturma
- İmzalanmış, reddedilmiş ve iptal edilmiş kararları arşivleme

Yeniden değerlendirmede önceki kararın oy ve imza geçmişi korunur.
Yeni taslak, önceki kararla bağlantılı ayrı bir kayıt olarak oluşturulur.

### Kullanıcı ve yetki yönetimi

- Sistem yöneticisi ve kurul bazlı roller
- Sayfa ve işlem bazlı okuma/yazma yetkileri
- Hesap aktifleştirme ve pasife alma
- Yönetici tarafından parola sıfırlama
- Kullanıcının kendi parolasını değiştirmesi
- Gerekli durumlarda zorunlu parola değiştirme
- Oturumların SessionStamp üzerinden geçersiz kılınması
- Yetkili kullanıcılar için işlem kayıtları

Arayüzde düğmelerin gizlenmesi tek başına yetkilendirme olarak
kullanılmaz. API tarafında da erişim kontrolleri uygulanır.

### Giriş güvenlik kodu (CAPTCHA)

Güvenlik kodu sunucuda üretilir ve sunucuda doğrulanır.
Tarayıcıya kodun PNG görseli, doğrulama kimliği ve son geçerlilik
zamanı gönderilir; doğru cevap metin olarak gönderilmez.

- Kod 4 rakamdan oluşur ve 2 dakika geçerlidir. Rakamlar el yazısı gibi
  eğik, dalgalı bükülmüş ve üzerinden aynı renkte bir çizgi geçecek
  biçimde çizilir (OBİS giriş ekranındaki gibi).
- Varsayılan olarak açıktır (`LoginCaptcha:Enabled`).
- Her kod tek kullanımlıktır. Doğru veya yanlış ilk doğrulama
  denemesinde tüketilir.
- Aynı kodla eşzamanlı istek gönderildiğinde yalnızca bir istek
  kodu tüketebilir.
- Veritabanında cevabın kendisi yerine anahtarlı özeti (HMAC) tutulur.
- Başarısız girişten sonra arayüz yeni kod ister.
- Süresi dolmuş kayıtlar yeni kod oluşturulurken sınırlı gruplar
  hâlinde temizlenir.
- Giriş istekleri IP başına dakikada 10, kod oluşturma istekleri
  IP başına dakikada 20 ile sınırlandırılır.

Bu temel görsel CAPTCHA, giriş denemesi sınırlamasını tamamlayan
bir kontroldür; gelişmiş botlara karşı tek başına yeterli değildir.
Görseli okuyamayan kullanıcılar için erişilebilir bir alternatif
henüz uygulanmamıştır.

CAPTCHA kayıtları SQL Server'da ortak tutulur. Birden fazla API
örneği çalıştırıldığında mevcut istek sınırları örnek başına
uygulanır; ortak sınırlandırma dağıtım altyapısında ayrıca
yapılandırılmalıdır.

### PDF, imza ve belge doğrulama

- Sunucuda PDF oluşturma
- Kurula ait logo ve başlık bilgileri
- Gerçek sayfa numaraları
- Karar tabloları, karşı oy gerekçeleri ve ek dosya adları
- İmza öncesi PDF inceleme ve kullanıcı onayı
- PDF ve ek dosyalar için SHA-256 bütünlük kontrolleri
- Her sayfanın altında karekod ve belge doğrulama kodu

İmzaya esas PDF, ilk imza hazırlığında oluşturulur ve veritabanına
kaydedilir. Bu sırada karara tahmin edilemez bir doğrulama kodu
(`ABCDE-FGHJK`) verilir ve PDF'ye karekodla birlikte basılır.

Üye, kâğıda attığı imzanın fotoğrafını yükler (arka plan tarayıcıda
temizlenir) ve giriş parolasını yeniden girerek imzalar. İmza, sabit
PDF'nin özetine bağlanır; imza görüntüsünün özeti işlem kaydına yazılır.
İmzalayana "Kararı imzaladınız" bildirimi ve e-posta makbuzu gönderilir.
Karar sayfasındaki imza listesi açıkken kendiliğinden güncellenir.

Tüm üyeler imzalayınca imzaların yerleştirildiği son PDF üretilir ve
sistem sertifikasıyla mühürlenir (PDF içine gömülü elektronik mühür,
PDFsharp). Sonraki indirmelerde bu mühürlü dosya verilir.

`/dogrula/<kod>` sayfası giriş gerektirmez: kararın durumunu, imzalayanları
ve iptal bilgisini gösterir; yüklenen PDF'nin kayıtlı dosyalarla birebir
aynı olup olmadığını ve gömülü mührün bozulup bozulmadığını kontrol eder.

Ek dosyaların adları PDF’de listelenir. Eklerin içerikleri PDF
sayfalarına otomatik olarak birleştirilmez.

## E-imza kapsamı ve sınırlılıklar

Üye imzaları sistem içi onay imzasıdır.

- 5070 sayılı Kanun kapsamında güvenli (nitelikli) elektronik imza değildir.
- Kullanıcıdan e-imza kartı veya PIN istemez.
- Son PDF'deki mühür kurumun kendi ürettiği (kendinden imzalı) sertifikayla
  atılır. Adobe Reader bütünlüğü doğrular, ancak sertifika güvenilir kök
  listesinde olmadığı için "imzalayan doğrulanamadı" uyarısı gösterebilir.
  Kurumsal bir sertifika alınırsa aynı mekanizma onunla çalışır.

Mühür sertifikası ilk ihtiyaçta `Storage:Root/keys/kurul-muhur.pfx`
olarak üretilir; parolası `Seal:CertificatePassword` ile verilebilir,
verilmezse `Jwt:Key`'den türetilir. Bu dosya yedeklenmelidir. Kaybolursa
yeni sertifika üretilir; eski mühürlü PDF'ler kendi içlerindeki
sertifikayla doğrulanmaya devam eder.

Gerçek e-imza entegrasyonunun sağlayıcısı, istemci bileşenleri ve
sertifika doğrulama gereksinimleri üniversitenin Bilgi İşlem
birimiyle birlikte belirlenmelidir.

SHA-256 kontrolleri değişikliklerin tespit edilmesini sağlar.
Veritabanını, dosyaları ve doğrulama kayıtlarını birlikte değiştirebilen
ayrıcalıklı bir saldırgana karşı bağımsız bir güven kaynağı oluşturmaz.

Eski imza sürümleri geriye uyumluluk amacıyla korunur. Önceden
imzalanmış kayıtlara geriye dönük PDF imzası atfedilmez.

## Uygulanan oylama kuralları

Mevcut uygulama varsayımları:

- Kurul üye sayısının yarısından bir fazlası katılmalıdır.
- Kararda tam olarak bir başkan tanımlanmalıdır.
- Başkan katılmadan oylama tamamlanamaz.
- Yalnızca katılan üyeler oy kullanabilir.
- Katılan tüm üyeler oy vermeden sonuç kesinleşmez.
- Kabul oyları fazla ise karar kabul edilir.
- Eşitlikte başkanın oyu belirleyicidir.
- Ret oyu için gerekçe zorunludur.
- Oylar açık olarak gösterilir.
- Kabul edilen kararda ret oyu veren katılımcı da imzalar.

Bu kurallar uygulamanın mevcut davranışını açıklar.
Kurumsal kullanımdan önce ilgili kurulun usulleriyle uyumu
üniversite tarafından onaylanmalıdır.

## Proje yapısı

```text
KurulOtomasyonu/
├── Kurul.API/
│   ├── Controllers/
│   ├── Data/
│   ├── Models/
│   ├── Services/
│   ├── Migrations/
│   ├── Assets/Pdf/
│   ├── Program.cs
│   └── appsettings.json
├── kurul-client/
│   ├── public/
│   ├── src/
│   └── package.json
├── Kurul.Checks/
│   └── Program.cs
├── diyagramlar/
├── scripts/
│   └── backup-local.sh
├── docker-compose.yml
├── .gitignore
└── README.md
```

Yüklenen ek dosyaların konumu `Storage:Root` ayarıyla belirlenir.
Geliştirmede varsayılan konum API projesindeki `Storage` klasörüdür.

## Yerel geliştirme gereksinimleri

- .NET 10 SDK
- Node.js ve npm
- SQL Server: Windows'ta **LocalDB** (Visual Studio ile gelir) veya Docker'da SQL Server
- PDF üretimi için API içindeki logo dosyaları

Aşağıdaki komutlar aksi belirtilmedikçe proje kökünde çalıştırılır.

## Hızlı başlangıç (Windows + LocalDB)

`appsettings.Development.json` varsayılan olarak parolasız LocalDB
(`(localdb)\MSSQLLocalDB`, veritabanı `KurulDb`) kullanır. İlk açılışta
veritabanı oluşturulur, migration'lar uygulanır ve demo veriler yüklenir.

```bash
npm --prefix kurul-client ci
```

```bash
dotnet run --project Kurul.API --launch-profile http
```

```bash
npm --prefix kurul-client run dev
```

Arayüz: `http://localhost:5173`, API: `http://localhost:5020`.
`node_modules` klasörü git'e girmez; silinirse `npm ci` ile
`package-lock.json`'daki aynı sürümlerle yeniden kurulur.

## Yerel SQL Server (Docker, isteğe bağlı)

Docker kullanılacaksa bağlantı dizesi
`Kurul.API/appsettings.Development.local.json` içinde ezilir
(aşağıdaki "Backend yapılandırması" bölümüne bakın).

Önceki geliştirme kurulumunda:

- Konteyner: `kurul-db`
- Kalıcı volume: `kurul_sql_data`
- Veritabanı: `KurulDB`
- Yerel bağlantı: `localhost,1433`

Oluşturulmuş konteyneri başlatmak için:

```bash
docker start kurul-db
```

Durumunu kontrol etmek için:

```bash
docker ps
```

Mevcut Compose yapılandırması `kurul-sqlserver:mevcut` adlı yerel
imajı ve önceden oluşturulmuş `kurul_sql_data` volume’ünü kullanır.

Bu yapılandırma mevcut geliştirme ortamına aittir. Temiz bir
bilgisayarda veya okul sunucusunda bu imaj ve volume’ün zaten
bulunduğu varsayılmamalıdır.

Eski `kurul-db-eski` konteyneri mevcut çalışma ortamında
durdurulmuş olarak korunmaktadır. Aynı port üzerinden iki
SQL Server konteyneri birlikte başlatılmamalıdır.

## Backend yapılandırması

Parolalar ve JWT anahtarı kaynak kodda tutulmamalıdır.

Gizli değerler git'e girmeyen (`.gitignore`) dosyalarda tutulur ve
uygulama bunları otomatik okur. Ortam değişkenleri her zaman önceliklidir.

| Dosya | İçerik |
| --- | --- |
| `Kurul.API/appsettings.Development.local.json` | Geliştirmede SMTP bilgileri (`Smtp:*`), isterseniz farklı bağlantı dizesi |
| `Kurul.API/appsettings.Production.local.json` | Üretim bağlantı dizesi, `Jwt:Key`, `Smtp:*`, `App:PublicUrl` |
| `scripts/deploy.local.json` | FTP dağıtım betikleri için `FTP_HOST`, `FTP_USER`, `FTP_PASS` |

`Production.local.json` yayın paketine (`dotnet publish`) dahil edilir;
`Development.local.json` dahil edilmez.

SMTP örneği (`Smtp:Host` boşsa e-posta gönderilmez, duyuru yine yayımlanır):

```json
{
  "Smtp": {
    "Host": "smtp.ornek.edu.tr",
    "Port": 587,
    "EnableSsl": true,
    "Username": "<kullanici>",
    "Password": "<parola>",
    "From": "kurul@ornek.edu.tr"
  }
}
```

`App:PublicUrl`, duyuru e-postalarındaki ve PDF karekodundaki bağlantıların adresidir
(örn. `https://bolumkurul.runasp.net`).

SQL Server bağlantı dizesinin biçimi:

```text
Server=localhost,1433;Database=KurulDB;User Id=sa;Password=<yerel-parola>;TrustServerCertificate=True;
```

Bu örnek yerel geliştirme içindir. Üretimde uygulamaya özel,
sınırlı yetkili SQL hesabı ve uygun bağlantı güvenliği kullanılmalıdır.

JWT anahtarı en az 32 bayt uzunluğunda, rastgele ve gizli olmalıdır.
Buradaki açıklama veya örnek değerler gerçek anahtar olarak kullanılmamalıdır.

Gizli olmayan temel ayarlar:

```json
{
  "Jwt": {
    "Issuer": "Kurul.API",
    "Audience": "Kurul.Web"
  },
  "Cors": {
    "Origins": ["http://localhost:5173"]
  }
}
```

Mevcut `appsettings.json` içindeki diğer ayarlar korunmalıdır.

## Backend’i çalıştırma

```bash
dotnet restore Kurul.API/Kurul.API.csproj
```

```bash
dotnet build Kurul.API/Kurul.API.csproj
```

```bash
dotnet run --project Kurul.API
```

API adresi için başlangıç çıktısındaki `Now listening on` satırı
esas alınmalıdır. Mevcut geliştirme ortamında API adresi:

```text
http://localhost:5020
```

Uygulama her açılışta bekleyen migration'ları uygular. Migration
başarısız olursa uygulama eksik şemayla çalışmak yerine açılmaz;
ayrıntı günlüğe yazılır.

## Geliştirme hesapları

`DbSeeder` üç kurulu, rolleri, sistem yöneticisini ve Bilgisayar Mühendisliği
Bölüm Kurulu'nun gerçek personelini (araştırma görevlileri hariç 18 öğretim
elemanı ve bölüm sekreteri) yükler. Geliştirmede ortak parola
`Kurul.API/Data/DbSeeder.cs` içindedir.

Girişte kullanıcı adının sonuna `@selcuk.edu.tr` eklenir (ör. `admin@selcuk.edu.tr`); bu kural
sistem yöneticisi dahil herkes için geçerlidir. İletişim e-postası farklı olsa da giriş bu adresle yapılır.

| Kullanıcı adı | Görev |
| --- | --- |
| `admin` | Sistem yöneticisi |
| `fatih.basciftci` | Bölüm Başkanı |
| `hasan.babalik` | Bölüm Sekreteri |
| `ad.soyad` biçiminde 17 kullanıcı | Kurul üyesi (ör. `sema.servi`, `murat.koklu`) |

E-posta adresleri `kullanıcıadı@selcuk.edu.tr` biçimindedir. Geliştirme ortamında
`Email:BlockedDomains` (appsettings.Development.json) `selcuk.edu.tr` alan adına
gönderimi engeller; böylece testlerde hocalara yanlışlıkla e-posta gitmez. Yalnızca tam
alan adı engellenir; `ogr.selcuk.edu.tr` gibi alt alan adlarına gönderim yapılır. Deneme için
bir kullanıcıya başka alan adlı (ör. Gmail) bir adres yazılabilir. Gerçek adres, telefon
ve unvanlar Kullanıcılar sayfasından (yönetici) düzenlenir.

Aynı kadro üç kurula da (Bölüm Kurulu, Bilgisayar Mühendisliği ABD, Bilişim Teknolojileri
ABD) eklenir. Kurullar birbirinden bağımsızdır; üyelikler her kurulda ayrı düzenlenir.
Girişten sonra son çalışılan kurul kendiliğinden açılır; kurul üst çubuktan değiştirilir.

Üretimde yalnızca boş veritabanında çalışır: `admin` ilk girişte parolasını
değiştirir; personel hesaplarının parolası rastgeledir ve yönetici tarafından
Kullanıcılar sayfasından belirlenir.

## Diyagramlar

`diyagramlar/` klasöründe:

- `02_kullanim_senaryosu.png`: genel kullanım senaryosu diyagramı
- `03_toplanti_yonetimi.png`: toplantı yönetimi kullanım senaryosu diyagramı (kaynak: `03_toplanti_yonetimi.puml`)

## Frontend’i çalıştırma

```bash
cd kurul-client
npm ci
npm run dev
```

`npm ci`, projedeki `package-lock.json` dosyasını kullanır.

Geliştirme API adresi isteğe bağlı olarak
`kurul-client/.env.local` içinde tanımlanabilir:

```dotenv
VITE_API_URL=http://localhost:5020
```

`VITE_` ile başlayan değerler tarayıcıya gönderilen uygulamaya
dahil edilir. Bu değişkenlerde parola veya gizli anahtar tutulmaz.

Frontend’in açıldığı adres API’nin CORS ayarıyla uyumlu olmalıdır.
Mevcut geliştirme adresi:

```text
http://localhost:5173
```

## Derleme

Backend:

```bash
dotnet build Kurul.API/Kurul.API.csproj
```

Frontend:

```bash
npm --prefix kurul-client run build
```

Frontend çıktısı `kurul-client/dist` klasöründe oluşur.

## Otomatik kontroller

`Kurul.Checks`, iş kurallarını ve SQL Server üzerinde eşzamanlı
işlemleri sınayan kontrol uygulamasıdır.

Kontroller şunları kapsar:

- Katılım yeter sayısı ve başkan koşulu
- Eşitlik ve ret sonucu
- Eşzamanlı oy ve imza işlemleri
- Tekrarlanan imza istekleri
- İmza hazırlığının süresinin dolması
- Yanlış kullanıcı, karar ve içerik özeti
- Karar metni ve ek dosya değişiklikleri
- PDF’nin sabitlenmesi ve değiştirilmeden indirilmesi
- PDF değiştiğinde imzanın veya indirmenin engellenmesi
- İptal ve yeniden değerlendirme
- Eski imza sürümlerinin korunması
- Toplantı oluşturma, numara çakışmaları ve karar numaralandırma
- Aynı toplantıya eşzamanlı karar ekleme
- Ortak katılımın kararlara yansıması ve ilk oyda kilitlenme
- Katılım değişikliği ile ilk oyun yarışı
- Toplantıya bağlı yeniden değerlendirme

Testler rastgele isimli ayrı bir `KurulChecks_...` veritabanı ve
geçici dosya klasörü oluşturur. Normal tamamlanmada bunlar temizlenir.
Uygulamanın `KurulDB` veritabanı test hedefi değildir.

SQL hesabının test veritabanı oluşturma ve silme yetkisi gerekir.
Bu kontroller geliştirme/test SQL Server’ında çalıştırılmalıdır.

### Çalıştırma (Windows + LocalDB)

PowerShell'de:

```powershell
$env:KURUL_TEST_LOCALDB = "1"; dotnet run --project Kurul.Checks
```

Windows "Akıllı Uygulama Denetimi" (Smart App Control) imzasız test
programını engellerse Windows Güvenliği > Uygulama ve tarayıcı
denetimi bölümünden ayarı gözden geçirin.

### Çalıştırma (Docker SQL Server)

Proje kökünde:

```bash
dotnet build Kurul.Checks/Kurul.Checks.csproj
```

macOS zsh terminalinde parolayı görünmeden almak için:

```bash
read -s 'KURUL_TEST_SQL_PASSWORD?SQL Server sa parolası: '
```

```bash
export KURUL_TEST_SQL_PASSWORD
```

```bash
dotnet run --project Kurul.Checks
```

İşlem bitince:

```bash
unset KURUL_TEST_SQL_PASSWORD
```

Ortam değişkeni tanımlanmazsa SQL testleri atlanır.
`SKIP` çıktısı tüm testlerin geçtiği anlamına gelmez.

PDF testlerinin çalışması için şu dosya bulunmalıdır:

```text
Kurul.API/Assets/Pdf/su_bilgisayar.png
```

Bu testler controller ve servis düzeyindedir. Tarayıcı akışlarının,
HTTP kimlik doğrulama katmanının ve gerçek e-imza entegrasyonunun
tamamını kapsamaz.

## Yedekleme

Yerel yedekleme betiği:

```bash
bash scripts/backup-local.sh --api-stopped
```

Betik çalıştırılmadan önce:

1. API durdurulmalıdır.
2. SQL Server açık kalmalıdır.
3. Doğru veritabanı ve dosya konumları kullanılmalıdır.

`--api-stopped` parametresi API’yi durdurmaz; API’nin kapatıldığını
belirtir.

Yedek içeriği:

- `KurulDB.bak`: SQL Server veritabanı yedeği
- `Storage.tar.gz`: yüklenen ek dosyalar
- `SHA256SUMS`: yedek dosyalarının özetleri
- `sql-backup.log`: SQL yedekleme/doğrulama çıktısı
- `TAMAMLANDI.txt`: işlemin tamamlandığını gösteren kayıt

PDF v2 ile sabitlenen PDF dosyaları veritabanında bulunduğu için
`KurulDB.bak` kapsamındadır.

Yüklenen ek dosyaların asılları ayrıca `Storage.tar.gz` içinde tutulur.
Tam geri yükleme için veritabanı ve ek dosya yedeği birlikte korunmalıdır.

`TAMAMLANDI.txt` olmayan klasör tamamlanmış yedek kabul edilmemelidir.

Yedek alınması tek başına geri yükleme güvencesi değildir.
Ayrı bir test veritabanında geri yükleme ve dosya açma kontrolleri
düzenli olarak yapılmalıdır.

## Okul sunucusuna geçiş

Üretim kurulumu üniversitenin Bilgi İşlem birimiyle birlikte yapılacaktır.
İşletim sistemi, alan adı, ters proxy ve e-imza sağlayıcısı henüz
kesinleşmemiştir.

Üretimde belirlenmesi gerekenler:

- HTTPS ve sertifika yönetimi
- Uygulamaya özel SQL hesabı ve erişim yetkileri
- JWT anahtarının güvenli saklanması
- Kalıcı ek dosya konumu
- Yedekleme sıklığı, saklama süresi ve geri yükleme sorumlusu
- İlk yönetici hesabının güvenli oluşturulması
- Erişim ve işlem kayıtlarının saklama politikası
- Gerçek e-imza entegrasyonu

### Üretim ayarları

Aşağıdaki ayarlar ortam değişkeni veya kurumun gizli bilgi
yönetim sistemi üzerinden sağlanmalıdır:

```text
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__DefaultConnection
Jwt__Key
Jwt__Issuer
Jwt__Audience
Storage__Root
```

`Storage__Root` üretimde:

- Mutlak yol olmalıdır.
- Uygulamanın içerik klasörünün dışında bulunmalıdır.
- Önceden oluşturulmuş olmalıdır.
- Uygulamanın çalıştığı hesaba gerekli dosya erişimini vermelidir.
- Doğrudan herkese açık statik dosya servisine bağlanmamalıdır.

Frontend ayrı origin üzerinde çalışacaksa izin verilen adres
`Cors__Origins__0` gibi ayarlarla tanımlanmalıdır.

Ters proxy kullanılıyorsa güvenilen proxy adresleri
`ReverseProxy__KnownProxies` yapılandırmasıyla belirtilmelidir.

Üretim alan adına uygun `AllowedHosts` değeri belirlenmelidir.

Frontend aynı origin üzerinden sunulacaksa API istekleri `/api`
yoluna yönlendirilebilir. Farklı API adresi kullanılacaksa
`VITE_API_URL`, frontend derlenmeden önce ayarlanmalıdır.

React adreslerinin doğrudan açılması ve sayfa yenilemenin çalışması
için sunucu SPA yönlendirmesi yapmalıdır. `/api` istekleri bu
yönlendirmeye dahil edilmemelidir.

### Yayın çıktıları

Backend yayın çıktısı:

```bash
dotnet publish Kurul.API/Kurul.API.csproj -c Release -o artifacts/api
```

Frontend yayın çıktısı:

```bash
npm --prefix kurul-client run build
```

Bu komutlar yayın dosyalarını oluşturur; uygulamayı sunucuya kurmaz.

Migration işlemleri üretimde uygulama başlangıcından ayrı,
yedek alınarak ve kontrollü biçimde uygulanmalıdır.
Üretimde geliştirme test verileri yüklenmemelidir.

## Kaynak kodda bulunmaması gerekenler

- SQL parolaları ve JWT anahtarı
- Gerçek kullanıcı veya öğrenci verileri
- Yüklenen ek dosyalar
- Veritabanı dosyaları ve yedekleri
- Özel anahtarlar ve sertifika parolaları
- Yerel loglar
- `node_modules`, `bin`, `obj` ve derleme çıktıları
- Otomatik kod güncelleme betiklerinin oluşturduğu yedek klasörleri

Migration dosyaları, uygulama kaynakları, gerekli logolar ve
gizli bilgi içermeyen yapılandırma şablonları kaynak kodla birlikte
korunmalıdır.

## Lisans

Tüm hakları saklıdır. Depo yalnızca incelenmek amacıyla herkese açıktır;
yazılı izin olmadan kopyalanamaz, çalıştırılamaz veya kullanılamaz.
Ayrıntılar için [LICENSE](LICENSE) dosyasına bakın.
