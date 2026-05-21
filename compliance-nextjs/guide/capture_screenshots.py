"""
capture_screenshots.py
-----------------------
Captures real screenshots of the Compliance Management System.
Saves PNG files + manifest.json to guide/screenshots/.

Usage:
    python capture_screenshots.py [--start-server]

Options:
    --start-server   Launch 'npm run dev' automatically and wait for readiness.
                     Omit this flag if the app is already running on localhost:3000.
"""
import asyncio, base64, json, os, sys, time, subprocess
import urllib.request

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
APP_DIR     = os.path.dirname(SCRIPT_DIR)               # compliance-nextjs/
OUT_DIR     = os.path.join(SCRIPT_DIR, "screenshots")
MANIFEST    = os.path.join(OUT_DIR, "manifest.json")
BASE_URL    = "http://localhost:3000"
ADMIN_USER  = "admin"
ADMIN_PASS  = "Admin@123"
W, H        = 1280, 800

os.makedirs(OUT_DIR, exist_ok=True)

# ── helpers ──────────────────────────────────────────────────────────────────
def _b64(path: str) -> str:
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    ext  = path.rsplit(".", 1)[-1].lower()
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, "image/png")
    return f"data:{mime};base64,{data}"

def _png(path: str) -> str:
    return _b64(path) if os.path.exists(path) else ""

async def shot(page, name: str, full_page=False, clip=None):
    path = os.path.join(OUT_DIR, f"{name}.png")
    kw   = {"path": path, "full_page": full_page}
    if clip:
        x, y = max(0, clip["x"]), max(0, clip["y"])
        w    = min(W - x, clip["w"])
        h    = min(H - y, clip["h"])
        if w > 10 and h > 10:
            kw["clip"] = {"x": x, "y": y, "width": w, "height": h}
    await page.screenshot(**kw)
    print(f"  ✓  {name}")

def wait_for_app(timeout=60):
    print("⏳ Waiting for app on localhost:3000 …", end="", flush=True)
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            urllib.request.urlopen(f"{BASE_URL}/dashboard", timeout=2)
            print(" ready!")
            return True
        except Exception:
            time.sleep(1)
            print(".", end="", flush=True)
    print(" timed out!")
    return False

# ── main capture ──────────────────────────────────────────────────────────────
async def capture():
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx     = await browser.new_context(viewport={"width": W, "height": H})
        page    = await ctx.new_page()

        # ── USER DASHBOARD ──────────────────────────────────────────────────
        print("\n── USER DASHBOARD ──")
        await page.goto(f"{BASE_URL}/dashboard", wait_until="networkidle")
        await shot(page, "user_01_dashboard_empty")

        await page.fill("input[placeholder*='HuyenTP']", "TungDP2")
        await shot(page, "user_02_account_filled")

        await page.select_option("select", "windows")
        await page.wait_for_timeout(700)
        await shot(page, "user_03_windows_selected", full_page=True)

        checklist = page.locator(".border.border-blue-100").first
        if await checklist.count() > 0:
            bb = await checklist.bounding_box()
            if bb:
                await shot(page, "user_04_checklist_windows",
                           clip={"x": bb["x"]-10, "y": bb["y"]-10, "w": bb["width"]+20, "h": bb["height"]+20})

        await page.select_option("select", "mac")
        await page.wait_for_timeout(500)
        await shot(page, "user_05_mac_selected", full_page=True)

        await page.select_option("select", "thin")
        await page.wait_for_timeout(500)
        await shot(page, "user_06_thin_selected", full_page=True)

        # Re-select windows to capture upload zone
        await page.select_option("select", "windows")
        await page.wait_for_timeout(500)
        upload_lbl = page.locator("label[for='file-upload']").first
        if await upload_lbl.count() > 0:
            bb = await upload_lbl.bounding_box()
            if bb and bb["width"] > 0:
                await shot(page, "user_07_upload_zone",
                           clip={"x": bb["x"]-10, "y": bb["y"]-10, "w": bb["width"]+20, "h": bb["height"]+20})

        # ── ADMIN LOGIN ─────────────────────────────────────────────────────
        print("\n── ADMIN LOGIN ──")
        await page.goto(f"{BASE_URL}/admin/login", wait_until="networkidle")
        await shot(page, "admin_01_login_empty")

        await page.fill("input[autocomplete='username']", ADMIN_USER)
        await page.fill("input[autocomplete='current-password']", ADMIN_PASS)
        await shot(page, "admin_02_login_filled")

        await page.click("button[type='submit']")
        try:
            await page.wait_for_url(f"{BASE_URL}/admin**", timeout=10000)
            await page.wait_for_load_state("networkidle")
            await shot(page, "admin_03_after_login")
        except Exception:
            print("  ⚠  login redirect timed out, continuing")

        # ── USER LIST ───────────────────────────────────────────────────────
        print("\n── ADMIN USER LIST ──")
        await page.goto(f"{BASE_URL}/admin/user-list", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await shot(page, "admin_04_user_list", full_page=True)
        await shot(page, "admin_05_topbar",   clip={"x": 0, "y": 0, "w": W, "h": 110})
        await shot(page, "admin_06_filters",  clip={"x": 0, "y": 108, "w": W, "h": 200})
        await shot(page, "admin_07_table",    clip={"x": 0, "y": 290, "w": W, "h": 420})

        # ── CHECK-IN TABLE ──────────────────────────────────────────────────
        print("\n── ADMIN CHECK-IN TABLE ──")
        await page.goto(f"{BASE_URL}/admin/checkin-table", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await shot(page, "admin_08_checkin", full_page=True)

        # ── NOTIFICATIONS ───────────────────────────────────────────────────
        print("\n── ADMIN NOTIFICATIONS ──")
        await page.goto(f"{BASE_URL}/admin/notifications", wait_until="networkidle")
        await page.wait_for_timeout(500)
        await shot(page, "admin_09_notifications")

        ta = page.locator("textarea").first
        if await ta.count() > 0:
            await ta.fill("Please submit your compliance documents before the deadline of 31 December 2026. "
                          "Contact your project lead if you need assistance.")
        await shot(page, "admin_10_notifications_filled")

        await browser.close()

    # ── Build manifest ───────────────────────────────────────────────────────
    shots: dict[str, str] = {}
    for fname in sorted(os.listdir(OUT_DIR)):
        if fname.endswith(".png"):
            key = fname.replace(".png", "")
            shots[key] = _b64(os.path.join(OUT_DIR, fname))

    # Also embed public sample images
    pub = os.path.join(APP_DIR, "public")
    for name, key in [("window_sample.png", "sample_windows"),
                      ("macos_sample.png",   "sample_mac"),
                      ("thin_sample_2.png",  "sample_thin")]:
        p = os.path.join(pub, name)
        if os.path.exists(p):
            shots[key] = _b64(p)

    with open(MANIFEST, "w") as f:
        json.dump(shots, f)

    total_kb = sum(len(v) for v in shots.values()) // 1024
    print(f"\n✅  {len(shots)} screenshots  ·  manifest.json  ·  {total_kb} KB total")
    return shots


if __name__ == "__main__":
    start_server = "--start-server" in sys.argv
    proc = None

    if start_server:
        print("🚀 Starting Next.js dev server …")
        proc = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=APP_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=True,
        )

    if not wait_for_app(timeout=90):
        print("❌ App not reachable. Start it with:  npm run dev  (inside compliance-nextjs/)")
        if proc:
            proc.terminate()
        sys.exit(1)

    asyncio.run(capture())

    if proc:
        proc.terminate()
