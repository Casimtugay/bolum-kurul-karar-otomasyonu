import os
import sys
import ftplib
import time
from queue import Queue
from threading import Thread

import json

# FTP bilgileri koda yazılmaz. Önce ortam değişkenleri (FTP_HOST, FTP_USER, FTP_PASS),
# yoksa git'e girmeyen scripts/deploy.local.json dosyası okunur.
def _load_ftp_settings():
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deploy.local.json")
    data = {}
    if os.path.exists(local):
        with open(local, encoding="utf-8") as fh:
            data = json.load(fh)
    values = {k: os.environ.get(k) or data.get(k) for k in ("FTP_HOST", "FTP_USER", "FTP_PASS")}
    missing = [k for k, v in values.items() if not v]
    if missing:
        sys.exit(f"Eksik FTP ayarı: {', '.join(missing)} (scripts/deploy.local.json veya ortam değişkeni)")
    return values["FTP_HOST"], values["FTP_USER"], values["FTP_PASS"]

FTP_HOST, FTP_USER, FTP_PASS = _load_ftp_settings()
LOCAL_DIR = os.path.abspath("publish-fd")
REMOTE_BASE = "/wwwroot"

def create_ftp():
    for attempt in range(5):
        try:
            ftp = ftplib.FTP(FTP_HOST, timeout=30)
            ftp.login(FTP_USER, FTP_PASS)
            ftp.set_pasv(True)
            return ftp
        except Exception:
            time.sleep(2)
    raise RuntimeError("Could not connect to FTP server")

def clean_remote_old_files(ftp):
    # Delete self-contained native runtime files that conflict with framework-dependent hosting
    targets = [
        "Kurul.API.exe", "coreclr.dll", "hostfxr.dll", "hostpolicy.dll",
        "clrjit.dll", "mscordaccore.dll"
    ]
    for t in targets:
        try:
            ftp.delete(f"{REMOTE_BASE}/{t}")
            print(f"Cleaned old native file: {t}")
        except Exception:
            pass

def worker(q, counter, total):
    ftp = None
    while not q.empty():
        try:
            rel_file = q.get_nowait()
        except Exception:
            break

        local_path = os.path.join(LOCAL_DIR, rel_file)
        remote_path = REMOTE_BASE + "/" + rel_file.replace("\\", "/")
        local_size = os.path.getsize(local_path)

        success = False
        for _ in range(4):
            try:
                if ftp is None:
                    ftp = create_ftp()
                try:
                    if ftp.size(remote_path) == local_size:
                        success = True
                        break
                except Exception:
                    pass

                with open(local_path, "rb") as f:
                    ftp.storbinary(f"STOR {remote_path}", f, blocksize=65536)
                success = True
                break
            except Exception:
                if ftp:
                    try:
                        ftp.close()
                    except Exception:
                        pass
                ftp = None
                time.sleep(2)

        counter[0] += 1
        done = counter[0]
        if done % 10 == 0 or done == total:
            print(f"Uploaded: {done}/{total} ({done * 100 // total}%)")

        q.task_done()

    if ftp:
        try:
            ftp.quit()
        except Exception:
            pass

def main():
    files = []
    dirs = set()
    for root, d_list, f_list in os.walk(LOCAL_DIR):
        rel = os.path.relpath(root, LOCAL_DIR)
        if rel != ".":
            dirs.add(rel)
        for f in f_list:
            files.append(os.path.relpath(os.path.join(root, f), LOCAL_DIR))

    print(f"Deploying {len(files)} files to MonsterASP...")
    ftp = create_ftp()
    clean_remote_old_files(ftp)
    for d in sorted(dirs):
        path = REMOTE_BASE + "/" + d.replace("\\", "/")
        parts = path.strip("/").split("/")
        cur = ""
        for p in parts:
            cur += "/" + p
            try:
                ftp.mkd(cur)
            except ftplib.error_perm:
                pass
    ftp.quit()

    q = Queue()
    for f in files:
        q.put(f)

    counter = [0]
    threads = []
    for _ in range(2):
        t = Thread(target=worker, args=(q, counter, len(files)))
        t.daemon = True
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    print("Deploy completed successfully!")

if __name__ == "__main__":
    main()
