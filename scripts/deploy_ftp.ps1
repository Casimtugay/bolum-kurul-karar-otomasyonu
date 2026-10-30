# Yayın paketini MonsterASP sitesine FTPS ile yükler.
# FTP bilgileri koda yazılmaz: git'e girmeyen scripts/deploy.local.json okunur
# ({ "FTP_HOST": "...", "FTP_USER": "...", "FTP_PASS": "..." }).
#
# Paket her seferinde temiz bir klasöre hazırlanır (eski paketle karışmasın):
#   dotnet publish Kurul.API/Kurul.API.csproj -c Release -r win-x64 --self-contained false -o yayin-paketi
# Kullanım (proje kökünden):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy_ftp.ps1
# Sunucuda pakette olmayan eski dosyalar da silinsin istenirse: -Clean
param(
    [string]$PublishDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'yayin-paketi'),
    [switch]$Clean
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$settingsPath = Join-Path $PSScriptRoot 'deploy.local.json'
if (-not (Test-Path $settingsPath)) { throw "scripts\deploy.local.json bulunamadı." }
$cfg = Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($k in 'FTP_HOST', 'FTP_USER', 'FTP_PASS') {
    if (-not $cfg.$k) { throw "deploy.local.json içinde $k eksik." }
}

$publish = (Resolve-Path $PublishDir).Path.TrimEnd('\')
if (-not (Test-Path (Join-Path $publish 'Kurul.API.dll'))) { throw "$publish klasöründe yayın paketi yok." }

# Güncel gizli ayarlar her yüklemede pakete kopyalanır (parola sonradan girilmiş olabilir).
Copy-Item (Join-Path $root 'Kurul.API\appsettings.Production.local.json') $publish -Force
if ((Get-Content (Join-Path $publish 'appsettings.Production.local.json') -Raw) -match 'PAROLAYI_BURAYA_YAZIN') {
    throw "appsettings.Production.local.json içinde veritabanı parolası henüz yazılmamış."
}
Remove-Item (Join-Path $publish 'appsettings.Development.json') -ErrorAction SilentlyContinue

$ftpHost = ($cfg.FTP_HOST -replace '^ftps?://', '').TrimEnd('/')
$base = "ftp://$ftpHost/wwwroot"
$cred = "$($cfg.FTP_USER):$($cfg.FTP_PASS)"
# Sertifika doğrulanır; yalnızca iptal listesine ulaşılamazsa bağlantı kesilmez.
$tls = @('--ssl-reqd', '--ssl-revoke-best-effort')

function Invoke-Ftp([string[]]$curlArgs) {
    # Sunucu zaman zaman TLS oturumunu düşürür; işlem birkaç kez yeniden denenir.
    # PowerShell 5.1 'Stop' modunda curl'ün hata çıktısını istisna sayıp denemeyi keser;
    # bu yüzden burada 'Continue' kullanılır ve curl sessiz çalışır (sonuç çıkış koduyla anlaşılır).
    $ErrorActionPreference = 'Continue'
    for ($try = 1; $try -le 5; $try++) {
        $result = & curl.exe --silent @tls --user $cred @curlArgs
        if ($LASTEXITCODE -eq 0) { return $result }
        Start-Sleep -Seconds (2 * $try)
    }
    throw "FTP işlemi başarısız: $($curlArgs -join ' ')"
}

function Send-File([string]$local, [string]$remote) {
    try {
        Invoke-Ftp @('--ftp-create-dirs', '-T', $local, "$base/$remote") | Out-Null
    }
    catch {
        # Windows TLS'i (schannel) aktarım bittikten sonra bağlantıyı kapatırken
        # SEC_E_CONTEXT_EXPIRED bildirebiliyor; dosya sunucuda tam boyuttaysa yükleme başarılıdır.
        $ErrorActionPreference = 'Continue'
        $head = & curl.exe --silent @tls --user $cred -I "$base/$remote"
        $size = ($head | Select-String -Pattern '^Content-Length:\s*(\d+)').Matches.Groups[1].Value
        if ($size -ne [string](Get-Item $local).Length) { throw }
    }
}

# Sunucudaki dosyaları (wwwroot altında, göreli yollarla) listeler.
function Get-RemoteFiles([string]$dir) {
    $url = if ($dir) { "$base/$dir/" } else { "$base/" }
    $lines = Invoke-Ftp @('-X', 'MLSD', $url)
    foreach ($line in $lines) {
        if (-not $line) { continue }
        $parts = $line -split '; ', 2
        if ($parts.Count -lt 2) { continue }
        $name = $parts[1].Trim()
        $path = if ($dir) { "$dir/$name" } else { $name }
        if ($parts[0] -match 'type=dir') { Get-RemoteFiles $path }
        elseif ($parts[0] -match 'type=file') { $path }
    }
}

# Çalışan uygulama dosyaları kilitlemesin diye önce uygulama çevrimdışı alınır.
$offline = Join-Path $env:TEMP 'app_offline.htm'
Set-Content $offline '<html><body style="font-family:sans-serif"><h2>Sistem güncelleniyor, birkaç dakika sonra tekrar deneyin.</h2></body></html>' -Encoding UTF8
Send-File $offline 'app_offline.htm'
Start-Sleep -Seconds 3

$files = Get-ChildItem $publish -Recurse -File
$wanted = @{}
foreach ($f in $files) { $wanted[$f.FullName.Substring($publish.Length + 1).Replace('\', '/')] = $true }

if ($Clean) {
    $stale = @(Get-RemoteFiles '' | Where-Object { $_ -ne 'app_offline.htm' -and -not $wanted.ContainsKey($_) -and $_ -notlike 'logs/*' })
    Write-Host "Sunucuda pakette olmayan $($stale.Count) dosya siliniyor."
    foreach ($s in $stale) { Invoke-Ftp @("$base/", '-Q', "DELE /wwwroot/$s", '-o', 'NUL') | Out-Null }
}

$i = 0
foreach ($rel in $wanted.Keys | Sort-Object) {
    $i++
    Write-Host ("[{0}/{1}] {2}" -f $i, $wanted.Count, $rel)
    Send-File (Join-Path $publish $rel.Replace('/', '\')) $rel
}

# Uygulamayı yeniden açmak için app_offline.htm silinir.
Invoke-Ftp @("$base/", '-Q', 'DELE /wwwroot/app_offline.htm', '-o', 'NUL') | Out-Null
Write-Host "Yükleme tamamlandı."
