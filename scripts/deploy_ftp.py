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
LOCAL_DIR = os.path.abspath("publish")
REMOTE_BASE = "/wwwroot"

def create_ftp():
    for attempt in range(5):
        try:
            ftp = ftplib.FTP(FTP_HOST, timeout=30)
            ftp.login(FTP_USER, FTP_PASS)
            ftp.set_pasv(True)
            return ftp
        except Exception as e:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("Could not connect to FTP server after 5 attempts")

def get_remote_sizes(ftp, remote_dir):
    sizes = {}
    try:
        lines = []
        ftp.dir(remote_dir, lines.append)
        for line in lines:
            parts = line.split()
            if len(parts) >= 9:
                name = " ".join(parts[8:])
                try:
                    size = int(parts[4])
                    sizes[name] = size
                except ValueError:
                    pass
    except Exception:
        pass
    return sizes

def worker(q, progress_counter, total_files):
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
        for attempt in range(4):
            try:
                if ftp is None:
                    ftp = create_ftp()

                # Check remote file size to skip re-uploading identical files
                try:
                    remote_size = ftp.size(remote_path)
                    if remote_size == local_size:
                        success = True
                        break
                except Exception:
                    pass

                with open(local_path, "rb") as f:
                    ftp.storbinary(f"STOR {remote_path}", f, blocksize=65536)
                success = True
                break
            except Exception as e:
                try:
                    if ftp:
                        ftp.close()
                except Exception:
                    pass
                ftp = None
                time.sleep(2)

        progress_counter[0] += 1
        done = progress_counter[0]
        if done % 10 == 0 or done == total_files:
            print(f"Uploaded: {done}/{total_files} ({done * 100 // total_files}%)")

        if not success:
            print(f"FAILED to upload: {rel_file}", file=sys.stderr)

        q.task_done()

    if ftp:
        try:
            ftp.quit()
        except Exception:
            pass

def main():
    files_to_upload = []
    dirs_to_create = set()

    for root, dirs, files in os.walk(LOCAL_DIR):
        rel_dir = os.path.relpath(root, LOCAL_DIR)
        if rel_dir != ".":
            dirs_to_create.add(rel_dir)
        for f in files:
            rel_file = os.path.relpath(os.path.join(root, f), LOCAL_DIR)
            files_to_upload.append(rel_file)

    total = len(files_to_upload)
    print(f"Total files: {total}, Dirs: {len(dirs_to_create)}")

    # Ensure dirs
    ftp = create_ftp()
    for d in sorted(dirs_to_create):
        remote_path = REMOTE_BASE + "/" + d.replace("\\", "/")
        parts = remote_path.strip("/").split("/")
        cur = ""
        for part in parts:
            cur += "/" + part
            try:
                ftp.mkd(cur)
            except ftplib.error_perm:
                pass
    ftp.quit()

    q = Queue()
    for f in files_to_upload:
        q.put(f)

    progress_counter = [0]
    threads = []
    num_workers = 2
    for _ in range(num_workers):
        t = Thread(target=worker, args=(q, progress_counter, total))
        t.daemon = True
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    print("All files processed!")

if __name__ == "__main__":
    main()
