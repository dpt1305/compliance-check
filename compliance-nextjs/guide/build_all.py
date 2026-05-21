"""
build_all.py
-------------
Master runner: capture fresh screenshots then build both HTML guides.

Usage:
    cd compliance-nextjs/guide
    python build_all.py

Flags:
    --skip-capture   Re-use existing screenshots (faster if app hasn't changed)
    --skip-server    Don't try to start Next.js (assumes it's already running)
"""
import os, sys, subprocess, argparse, time, urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def app_running(url="http://localhost:3000") -> bool:
    try:
        urllib.request.urlopen(url, timeout=3)
        return True
    except Exception:
        return False


def run(script: str):
    python = sys.executable
    path   = os.path.join(SCRIPT_DIR, script)
    print(f"\n▶  {script}")
    result = subprocess.run([python, path], cwd=SCRIPT_DIR)
    if result.returncode != 0:
        print(f"❌  {script} failed (exit {result.returncode})")
        sys.exit(result.returncode)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-capture", action="store_true",
                        help="Skip screenshot capture (use existing screenshots)")
    parser.add_argument("--skip-server",  action="store_true",
                        help="Do not attempt to start the Next.js dev server")
    args = parser.parse_args()

    # ── 1. Optionally start Next.js ───────────────────────────────────────
    if not args.skip_capture and not args.skip_server:
        if not app_running():
            print("🚀  Starting Next.js dev server …")
            proj = os.path.join(SCRIPT_DIR, "..")
            # detach so it keeps running in background
            subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=proj,
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            # wait up to 30 s for the server to become ready
            for i in range(30):
                time.sleep(1)
                if app_running():
                    print("✅  App ready on http://localhost:3000")
                    break
            else:
                print("⚠️  App did not start within 30 s — trying anyway …")

    # ── 2. Capture screenshots ────────────────────────────────────────────
    if not args.skip_capture:
        run("capture_screenshots.py")

    # ── 3. Build HTML guides ──────────────────────────────────────────────
    run("build_user_guide.py")
    run("build_admin_guide.py")

    print("\n🎉  Done!")
    print("   public/user-guide.html")
    print("   public/admin-guide.html")


if __name__ == "__main__":
    main()
