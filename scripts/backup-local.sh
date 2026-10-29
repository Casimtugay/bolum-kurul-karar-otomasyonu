#!/usr/bin/env bash
# Yerel Mac/Linux geliştirme kurulumu: kurul-db + Kurul.API/Storage.
# API durdurulmalı; SQL Server konteyneri çalışmaya devam etmelidir.
set -euo pipefail
set +x
umask 077

if [[ "${1:-}" != "--api-stopped" ]]; then
  echo 'Önce dotnet run çalışan terminalde Ctrl+C ile API’yi durdurun.' >&2
  echo 'Sonra proje kökünde: bash scripts/backup-local.sh --api-stopped' >&2
  echo 'Yedek bitene kadar API’yi açmayın; başka bir araç da veritabanına yazmamalı.' >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
project_dir="$(cd "$script_dir/.." && pwd -P)"
container="${KURUL_DB_CONTAINER:-kurul-db}"
storage_dir="${KURUL_STORAGE_DIR:-$project_dir/Kurul.API/Storage}"
backup_root="${KURUL_BACKUP_DIR:-$HOME/Kurul-Yedekler}"

command -v docker >/dev/null || { echo 'Docker komutu bulunamadı.' >&2; exit 1; }
[[ -d "$storage_dir" ]] || { echo "Storage bulunamadı: $storage_dir" >&2; exit 1; }
storage_dir="$(cd "$storage_dir" && pwd -P)"
# Mevcut yerel API portu. Bu kontrol bütün yazıcıların durduğunu tek başına kanıtlamaz.
if command -v lsof >/dev/null && lsof -nP -iTCP:5020 -sTCP:LISTEN >/dev/null 2>&1; then
  echo '5020 portunda uygulama çalışıyor. Önce API’yi durdurun.' >&2
  exit 1
fi
[[ "$(docker inspect --format '{{.State.Running}}' "$container")" == 'true' ]] || {
  echo 'SQL Server konteyneri çalışmıyor. API kapalı, SQL Server açık olmalı.' >&2; exit 1;
}
if docker exec "$container" test -x /opt/mssql-tools18/bin/sqlcmd; then
  sqlcmd=/opt/mssql-tools18/bin/sqlcmd
elif docker exec "$container" test -x /opt/mssql-tools/bin/sqlcmd; then
  sqlcmd=/opt/mssql-tools/bin/sqlcmd
else
  echo 'Konteynerde sqlcmd bulunamadı.' >&2; exit 1
fi
if command -v shasum >/dev/null; then
  hash_command=(shasum -a 256)
elif command -v sha256sum >/dev/null; then
  hash_command=(sha256sum)
else
  echo 'shasum veya sha256sum gerekli.' >&2; exit 1
fi
mkdir -p "$backup_root"
backup_root="$(cd "$backup_root" && pwd -P)"
case "$backup_root/" in
  "$storage_dir/"*) echo 'Yedek klasörü Storage içinde olamaz.' >&2; exit 1 ;;
esac
backup_dir="$(mktemp -d "$backup_root/kurul-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
backup_id="$(basename "$backup_dir")"
server_backup="/var/opt/mssql/backup/$backup_id.bak"
complete=0
cleanup() {
  local code=$?
  unset SQLCMDPASSWORD
  if [[ "$complete" != 1 ]]; then
    echo "Yedek tamamlanmadı. Yarım dosyalar inceleme için bırakıldı: $backup_dir" >&2
    echo 'TAMAMLANDI.txt bulunmayan bir klasörü tamamlanmış yedek saymayın.' >&2
  fi
  return "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -z "${SQLCMDPASSWORD:-}" ]]; then
  IFS= read -r -s -p 'Mevcut SQL Server sa parolası: ' SQLCMDPASSWORD </dev/tty
  printf '\n' >/dev/tty
fi
[[ -n "$SQLCMDPASSWORD" ]] || { echo 'Parola boş olamaz.' >&2; exit 1; }
export SQLCMDPASSWORD

echo 'Veritabanı yedekleniyor ve yedek okunabilirliği kontrol ediliyor...'
docker exec "$container" mkdir -p /var/opt/mssql/backup
# Parola komut argümanına yazılmaz. -C yalnızca bu yerel konteyner bağlantısı içindir.
docker exec -e SQLCMDPASSWORD "$container" "$sqlcmd" \
  -S localhost -U sa -C -b -r 1 -l 15 -t 0 \
  -Q "BACKUP DATABASE [KurulDB] TO DISK = N'$server_backup' WITH COPY_ONLY, CHECKSUM; RESTORE VERIFYONLY FROM DISK = N'$server_backup' WITH CHECKSUM;" \
  > "$backup_dir/sql-backup.log" 2>&1
unset SQLCMDPASSWORD

docker cp "$container:$server_backup" "$backup_dir/KurulDB.bak"
chmod 600 "$backup_dir/KurulDB.bak"
[[ -s "$backup_dir/KurulDB.bak" ]] || { echo 'Veritabanı yedeği boş.' >&2; exit 1; }

echo 'Ek dosyaları arşivleniyor...'
COPYFILE_DISABLE=1 tar -czf "$backup_dir/Storage.tar.gz" -C "$storage_dir" .
tar -tzf "$backup_dir/Storage.tar.gz" >/dev/null
(
  cd "$backup_dir"
  "${hash_command[@]}" KurulDB.bak Storage.tar.gz > SHA256SUMS
  "${hash_command[@]}" -c SHA256SUMS
)
{
  echo "Tarih (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo 'Veritabanı: KurulDB'
  echo "Kaynak Storage: $storage_dir"
  echo "SQL konteyneri: $container"
  echo "SQL imaj kimliği: $(docker inspect --format '{{.Image}}' "$container")"
  echo 'Yöntem: API ve diğer yazıcılar durdurulmuşken COPY_ONLY + CHECKSUM, RESTORE VERIFYONLY, Storage tar.gz.'
  echo 'VERIFYONLY kontrolü geçti; başka bir veritabanına gerçek geri yükleme testi henüz yapılmadı.'
  echo 'Storage.tar.gz içeriği doğrudan hedef Storage klasörüne açılmalıdır.'
} > "$backup_dir/TAMAMLANDI.txt"
complete=1
# Yalnızca bu çalışmada oluşturulan ve dışarı kopyalanan geçici .bak temizlenir.
if ! docker exec "$container" rm -- "$server_backup"; then
  echo "Yedek tamamlandı ancak konteynerdeki geçici kopya temizlenemedi: $server_backup" >&2
fi
printf '\nYedek tamamlandı: %s\nAPI’yi artık yeniden başlatabilirsiniz.\n' "$backup_dir"
