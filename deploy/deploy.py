"""
Deploys the SkillUp Chat backend to the Contabo VPS.
Run from anywhere:  python deploy/deploy.py
"""
import io, os, sys, tarfile, time
import paramiko

VPS_IP   = "37.60.249.140"
VPS_USER = "root"
VPS_PASS = "A32,S^Meo+?N"
APP_DIR  = "/opt/skillup-chat"

HERE         = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR  = os.path.join(HERE, "..", "backend")

EXCLUDE = {"node_modules", "data", "uploads", "__pycache__"}

# ── helpers ──────────────────────────────────────────────────────────────────

def step(msg):
    print(f"\n{'='*50}")
    print(f"  {msg}")
    print('='*50)

def run(ssh, cmd, check=True):
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode(errors="replace").strip()
    err = stderr.read().decode(errors="replace").strip()
    if out:
        for line in out.splitlines():
            print("  " + line)
    if err and check:
        for line in err.splitlines():
            print("  STDERR: " + line)
    return out

def build_archive():
    """Build an in-memory tar.gz of the backend directory."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for dirpath, dirnames, filenames in os.walk(BACKEND_DIR):
            # Prune excluded dirs in-place
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE]
            for fname in filenames:
                full = os.path.join(dirpath, fname)
                arcname = os.path.relpath(full, BACKEND_DIR)
                tar.add(full, arcname=arcname)
    buf.seek(0)
    return buf

def upload_bytes(sftp, data: io.BytesIO, remote_path: str):
    sftp.putfo(data, remote_path)

def upload_file(sftp, local_path: str, remote_path: str):
    sftp.put(local_path, remote_path)

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "="*50)
    print("  SkillUp Chat — VPS Deployment")
    print(f"  Target: {VPS_IP}")
    print("="*50)

    # 1. Connect
    step("Connecting to VPS")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_IP, username=VPS_USER, password=VPS_PASS, timeout=15)
    sftp = ssh.open_sftp()
    print("  Connected.")

    # 2. Create remote directories
    step("Creating app directories")
    for d in [APP_DIR, f"{APP_DIR}/middleware", f"{APP_DIR}/routes",
              f"{APP_DIR}/uploads", f"{APP_DIR}/data"]:
        try: sftp.mkdir(d)
        except OSError: pass  # already exists
    print("  Directories ready.")

    # 3. Upload backend archive
    step("Building & uploading backend archive")
    archive = build_archive()
    archive_size = archive.seek(0, 2); archive.seek(0)
    print(f"  Archive size: {archive_size / 1024:.1f} KB")
    upload_bytes(sftp, archive, "/tmp/skillup-chat.tar.gz")
    print("  Archive uploaded.")

    # 4. Upload VPS setup script
    step("Uploading setup script")
    setup_sh = os.path.join(HERE, "setup-vps.sh")
    upload_file(sftp, setup_sh, "/tmp/setup-vps.sh")
    run(ssh, "chmod +x /tmp/setup-vps.sh")
    print("  Setup script uploaded.")

    # 5. Extract archive on VPS
    step("Extracting files on VPS")
    run(ssh, f"cd {APP_DIR} && tar -xzf /tmp/skillup-chat.tar.gz")
    print("  Files extracted.")

    # 6. Run VPS setup
    step("Running VPS setup (Node.js / PM2 / .env / firewall)")
    run(ssh, "bash /tmp/setup-vps.sh")

    # 7. Final verification from outside
    step("External health check")
    time.sleep(2)
    out = run(ssh, "curl -s http://localhost:3000/health")
    if '"status":"ok"' in out or "'status': 'ok'" in out or 'ok' in out:
        print(f"\n  API is live at http://{VPS_IP}:3000")
    else:
        print("  Health check response:", out)

    sftp.close()
    ssh.close()
    print("\n" + "="*50)
    print("  DEPLOYMENT COMPLETE")
    print(f"  API:      http://{VPS_IP}:3000")
    print(f"  Health:   http://{VPS_IP}:3000/health")
    print("="*50 + "\n")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
