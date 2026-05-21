"""
build_user_guide.py
---------------------
Builds public/user-guide.html from screenshots in guide/screenshots/.

Usage:
    python build_user_guide.py

Output: ../public/user-guide.html
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guide_common import (
    load_screenshots, img, steps, box, callout, req_item,
    feature_title, sub_title, html_shell, two_col
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT        = os.path.join(SCRIPT_DIR, "..", "public", "user-guide.html")

# ─── Navigation sidebar ───────────────────────────────────────────────────────
SIDEBAR = """
<aside id="sidebar">
  <div class="sb-brand">
    <span class="logo">🛡️</span>
    <div>
      <div class="title">Compliance System</div>
      <div class="sub">User Guide</div>
    </div>
  </div>

  <nav class="sb-nav">
    <div class="sb-group-label">Contents</div>

    <a class="sb-link" href="#getting-started">
      <span class="sb-ico">🌐</span>1.1 Getting Started
    </a>

    <a class="sb-link" href="#step-submit">
      <span class="sb-ico">📤</span>1.2 Submitting a Document
    </a>
    <a class="sb-sub" href="#step-account">Step 1 — Account ID</a>
    <a class="sb-sub" href="#step-type">Step 2 — Select Type</a>
    <a class="sb-sub" href="#step-upload">Step 3 — Upload Screenshot</a>
    <a class="sb-sub" href="#step-submit-btn">Step 4 — Submit</a>

    <a class="sb-link" href="#requirements">
      <span class="sb-ico">ℹ️</span>1.3 Requirements
    </a>
    <a class="sb-sub" href="#req-windows">🪟 Windows</a>
    <a class="sb-sub" href="#req-mac">🍎 Mac</a>
    <a class="sb-sub" href="#req-thin">🖥️ Thin Client</a>

    <a class="sb-link" href="#upload-methods">
      <span class="sb-ico">🖼️</span>1.4 Upload Methods
    </a>

    <a class="sb-link" href="#result">
      <span class="sb-ico">📊</span>1.5 Submission Result
    </a>
    <a class="sb-sub" href="#result-accepted">✅ Accepted</a>
    <a class="sb-sub" href="#result-rejected">❌ Rejected</a>
  </nav>

  <div class="sb-footer">User Guide · v1.0 · May 2026</div>
</aside>
"""

# ─── Build content ────────────────────────────────────────────────────────────
def build(shots: dict) -> str:
    I = lambda key, cap="", w="100%": img(shots, key, cap, w)

    return f"""
<!-- ══ COVER ══ -->
<div class="cover">
  <div class="logo">📋</div>
  <h1>User Guide</h1>
  <h2>Compliance Management System</h2>
  <div class="divider"></div>
  <div class="meta">
    <div class="meta-item"><div class="label">Version</div><div class="value">1.0</div></div>
    <div class="meta-item"><div class="label">Date</div><div class="value">May 2026</div></div>
    <div class="meta-item"><div class="label">Audience</div><div class="value">All Staff</div></div>
  </div>
  <div class="badges">
    <span class="cbadge">👤 For Users</span>
    <span class="cbadge">📋 Step-by-Step</span>
    <span class="cbadge">🖼️ Screenshots Included</span>
  </div>
</div>

<!-- ══ MAIN PAGE ══ -->
<div class="page">

<!-- ══ TOC ══ -->
<section id="toc" class="section toc-page">
  <div class="toc">
    <h2>📑 Table of Contents</h2>
    <div class="toc-group">
      <div class="toc-group-title">👤 User Guide — Compliance Submission</div>
      <ul class="toc-list">
        <li><a href="#getting-started">1.1 &nbsp;Getting Started — Accessing the Dashboard</a><span class="pg">p. 3</span></li>
        <li><a href="#step-submit">1.2 &nbsp;Step-by-Step: Submitting a Compliance Document</a><span class="pg">p. 4</span></li>
        <li><a href="#requirements">1.3 &nbsp;Compliance Requirements by Device Type</a><span class="pg">p. 6</span></li>
        <li style="padding-left:16px"><a href="#req-windows">— Windows Laptop (5 required items)</a><span class="pg">p. 6</span></li>
        <li style="padding-left:16px"><a href="#req-mac">— macOS Laptop (3 required items)</a><span class="pg">p. 7</span></li>
        <li style="padding-left:16px"><a href="#req-thin">— Thin Client (3 required items)</a><span class="pg">p. 8</span></li>
        <li><a href="#upload-methods">1.4 &nbsp;Three Ways to Upload Your Screenshot</a><span class="pg">p. 9</span></li>
        <li><a href="#result">1.5 &nbsp;Reading Your Submission Result</a><span class="pg">p. 10</span></li>
      </ul>
    </div>
  </div>
</section>

<hr/>

<!-- ══ 1.1 Getting Started ══ -->
<section id="getting-started" class="section">
<div class="feature">
  {feature_title("🌐", "1.1 &nbsp;Getting Started — Accessing the Dashboard")}
  <p class="feature-intro">The User Dashboard is the main page for submitting your compliance screenshot. No login is required.</p>

  {steps([
    ("Open your web browser",
     "Use any modern browser — Chrome, Edge, Firefox, or Safari."),
    ("Navigate to the submission page",
     "Type the system URL into the address bar (e.g. <code>http://localhost:3000/dashboard</code>) "
     "and press <kbd>Enter</kbd>. The submission form appears immediately."),
    ("The form is ready — no login needed",
     "You will see three fields: <strong>Account ID</strong>, <strong>Submission Type</strong>, "
     "and <strong>Image</strong>. Fill them all in and click Submit."),
  ])}

  {I("user_01_dashboard_empty", "The User Dashboard — the submission form with three required fields")}
</div>
</section>

<!-- ══ 1.2 Submitting ══ -->
<section id="step-submit" class="section">
<div class="feature">
  {feature_title("📤", "1.2 &nbsp;Step-by-Step: Submitting a Compliance Document")}
  <p class="feature-intro">Follow these steps in order. All three fields must be filled before the Submit button activates.</p>

  <!-- Step 1 -->
  <div id="step-account">
  {sub_title("Step 1 — Enter your Account ID")}
  {steps([
    ("Click the Account ID field and type your username",
     "Enter your company account name — for example <code>HuyenTP</code> or <code>TungDP2</code>. "
     "Must be at least 2 characters. This identifies your submission record."),
  ])}
  {I("user_02_account_filled", "Account ID entered — field highlights blue when active")}
  </div>

  <!-- Step 2 -->
  <div id="step-type">
  {sub_title("Step 2 — Select Your Submission Type")}
  {steps([
    ("Click the Submission Type dropdown",
     "Choose the option matching your device:<br/>"
     "<strong>Windows</strong> — Windows laptop/desktop with SEED &nbsp;|&nbsp; "
     "<strong>Mac</strong> — Apple Mac with SEED &nbsp;|&nbsp; "
     "<strong>Thin</strong> — Thin client / virtual desktop"),
    ("A requirements checklist appears automatically",
     "A <strong>blue checklist card</strong> appears showing exactly what your screenshot must contain. "
     "Read it carefully before taking or uploading your screenshot."),
    ("A sample reference image is shown",
     "A sample valid screenshot is displayed below the checklist. Use it as a guide."),
  ])}
  {I("user_03_windows_selected", "After selecting 'Windows' — the requirements checklist and sample reference image appear automatically")}
  </div>

  <!-- Step 3 -->
  <div id="step-upload">
  {sub_title("Step 3 — Upload Your Screenshot")}
  {steps([
    ("Click the upload zone (or drag &amp; drop / paste)",
     "Click the dashed area to open a file browser, drag a file onto it, "
     "or press <kbd>Ctrl+V</kbd> to paste from clipboard. "
     "Accepted formats: JPG, PNG, WEBP — max 10 MB."),
    ("A preview appears instantly",
     "Once a valid file is selected, a thumbnail preview shows inside the upload box "
     "with a green border confirming the file is ready. "
     "A red border with an error message means the file needs to be fixed."),
  ])}
  {I("user_07_upload_zone", "The upload zone — supports click-to-browse, drag & drop, and Ctrl+V clipboard paste")}
  </div>

  <!-- Step 4 -->
  <div id="step-submit-btn">
  {sub_title("Step 4 — Click Submit")}
  {steps([
    ("Click the blue 📤 Submit button",
     "The button at the bottom right becomes active only when all three fields are valid. "
     "Click it and wait a few seconds while AI validates your image."),
    ("Wait for the result",
     "The page scrolls down automatically to show the validation result below the form."),
  ])}
  {callout(
    "💡 Fastest way — Paste with Ctrl+V",
    "<p>Take a screenshot with the Snipping Tool (<kbd>Win+Shift+S</kbd>) — "
    "the image is automatically in your clipboard. Then click anywhere on the page "
    "and press <kbd>Ctrl+V</kbd> to paste it directly. No need to save a file first.</p>",
    "note"
  )}
  </div>
</div>
</section>

<!-- ══ 1.3 Requirements ══ -->
<section id="requirements" class="section">
<div class="feature">
  {feature_title("ℹ️", "1.3 &nbsp;Compliance Requirements by Device Type")}
  <p class="feature-intro">
    The system shows a checklist automatically when you select a type. Here is the full list of what your screenshot must show.
  </p>
  {I("user_04_checklist_windows", "The requirements checklist — shown automatically after choosing a submission type")}

  <!-- Windows -->
  <div id="req-windows">
  {sub_title("🪟 Windows Laptop — 5 Required Items", "#1d4ed8")}
  {box("<strong>All 5 items must be clearly visible.</strong> The SEED dashboard is the most important — open the SEED app first.", "info")}
  <ul class="req-list">
    {req_item("📊", "SEED Dashboard", "SEED app dashboard showing device name, serial number, and the 4 metric counters: Malware Alerts, Compliance Checks, SEED Configuration, Operating System")}
    {req_item("🕐", "System Clock", "Timestamp visible in the bottom-right corner of the Windows taskbar")}
    {req_item("🔄", "Windows Update Status", 'Windows Update screen (Settings → Windows Update) showing "You\'re up to date"')}
    {req_item("💻", "Device Name", 'Computer hostname fully readable (not truncated with "…") anywhere on screen')}
    {req_item("#️⃣", "Device Serial Number", "Serial number fully readable anywhere on screen — visible in the SEED dashboard or Settings → System → About")}
  </ul>
  {callout(
    "✅ Windows Tips",
    "<ul>"
    "<li>Open the SEED app first — the dashboard shows all required items in one place</li>"
    "<li>Expand the window so device name and serial are <strong>not cut off</strong></li>"
    "<li>Go to <strong>Settings → Windows Update</strong> for the update screen</li>"
    "<li>You can take multiple screenshots and combine them into one image</li>"
    "</ul>",
    "tip"
  )}
  <p style='font-size:12px;font-weight:600;color:var(--text-sm);margin:14px 0 6px'>Reference — Example of a valid Windows submission:</p>
  {I("sample_windows", "Example valid Windows screenshot — SEED dashboard with device name, serial, all 4 counters, system clock, and Windows Update visible")}
  </div>

  <!-- Mac -->
  <div id="req-mac">
  {sub_title("🍎 macOS Laptop — 3 Required Items", "#047857")}
  {box("<strong>All 3 items must be visible</strong> in your screenshot.", "success")}
  <ul class="req-list">
    {req_item("📊", "SEED Dashboard", "SEED app dashboard showing device name, serial number, and the 4 metric counters")}
    {req_item("🕐", "Timestamp", "A readable date or time visible anywhere in the image — menu bar clock, browser tab, page footer, etc.")}
    {req_item("ℹ️", "Mac System Info", "System Settings → General → About (or Apple menu → About This Mac) showing model name and serial number")}
  </ul>
  {callout(
    "✅ macOS Tips",
    "<ul>"
    "<li>Click <strong>🍎 Apple menu → About This Mac</strong> for model and serial (macOS Ventura+: System Settings → General → About)</li>"
    "<li>Any timestamp in the image counts — the menu bar clock is fine</li>"
    "<li>Ensure device name and serial are <strong>not truncated</strong></li>"
    "</ul>",
    "tip"
  )}
  <p style='font-size:12px;font-weight:600;color:var(--text-sm);margin:14px 0 6px'>Reference — Example of a valid Mac submission:</p>
  {I("sample_mac", "Example valid macOS screenshot — SEED dashboard, About This Mac with serial, and visible timestamp")}
  </div>

  <!-- Thin -->
  <div id="req-thin">
  {sub_title("🖥️ Thin Client — 3 Required Items", "#92400e")}
  {box("<strong>All 3 items must be visible.</strong> You may combine all screens into one capture.", "warn")}
  <ul class="req-list">
    {req_item("🛡️", "Windows Security Full Scan Result",
      'Windows Security → Virus &amp; threat protection → Scan options: '
      'must show a completed Full scan with "No current threats", "0 threats found", '
      'last scan date/time, and number of files scanned')}
    {req_item("🔄", "Windows Update", 'Settings → Windows Update showing "Up to date"')}
    {req_item("#️⃣", "Serial Number in Terminal",
      "PowerShell or Command Prompt showing the device serial number output")}
  </ul>
  {callout(
    "✅ Thin Client Tips",
    "<ul>"
    "<li>Go to <strong>Windows Security → Virus &amp; threat protection → click Scan options</strong> — capture the <em>scan results page</em>, NOT the home six-tile overview screen</li>"
    "<li>Open PowerShell and run: <code>(Get-CimInstance Win32_BIOS).SerialNumber</code> — capture the output</li>"
    "<li>All three screens can fit in a single wide screenshot</li>"
    "</ul>",
    "tip"
  )}
  <p style='font-size:12px;font-weight:600;color:var(--text-sm);margin:14px 0 6px'>Reference — Example of a valid Thin Client submission:</p>
  {I("sample_thin", "Example valid Thin Client screenshot — Windows Security scan results, Windows Update, and serial number in terminal")}
  </div>

</div>
</section>

<!-- ══ 1.4 Upload Methods ══ -->
<section id="upload-methods" class="section">
<div class="feature">
  {feature_title("🖼️", "1.4 &nbsp;Three Ways to Upload Your Screenshot")}

  <div class="three-col">
    <div class="col-card">
      <h4>📁 Method 1 — Browse</h4>
      <p>Click inside the dashed upload box. Your file browser opens. Navigate to your screenshot file and click <strong>Open</strong>.</p>
    </div>
    <div class="col-card">
      <h4>🖱️ Method 2 — Drag &amp; Drop</h4>
      <p>Open File Explorer alongside your browser. Drag your screenshot file directly onto the dashed upload area and release.</p>
    </div>
    <div class="col-card">
      <h4>📋 Method 3 — Paste (Ctrl+V)</h4>
      <p>Take a screenshot with Snipping Tool or <kbd>PrtSc</kbd>, then click anywhere on the page and press <kbd>Ctrl+V</kbd>. Clipboard image pastes instantly — no file saving needed.</p>
    </div>
  </div>

  {I("user_07_upload_zone", "Upload zone — all three methods (click, drag-drop, Ctrl+V) are supported")}

  {box(
    "<strong>Image requirements:</strong><br/>"
    "• Accepted formats: <strong>JPG, JPEG, PNG, WEBP</strong> only<br/>"
    "• Maximum size: <strong>10 MB</strong><br/>"
    "• Must be a real image — renaming a document to .png will be detected and rejected<br/>"
    "• If a red border appears, fix the issue shown before submitting",
    "warn"
  )}
</div>
</section>

<!-- ══ 1.5 Result ══ -->
<section id="result" class="section">
<div class="feature">
  {feature_title("📊", "1.5 &nbsp;Reading Your Submission Result")}
  <p class="feature-intro">
    After clicking Submit, the system runs AI validation. A result card appears below the form.
    There are two possible outcomes:
  </p>

  <!-- Accepted -->
  <div id="result-accepted">
  {sub_title("✅ Outcome A — Image Accepted", "#16a34a")}
  <p style="font-size:12.5px;color:var(--text-sm);margin-bottom:10px">
    Your screenshot passed validation. A green result card shows a 4-step checklist confirming everything was verified.
  </p>
  <table class="ref-table">
    <thead><tr><th>Step shown in result</th><th>What it means</th></tr></thead>
    <tbody>
      <tr><td>📤 Image received and format verified</td><td>File format and image integrity passed</td></tr>
      <tr><td>🤖 AI validation passed (XX% confidence)</td><td>AI found all required elements in your screenshot</td></tr>
      <tr><td>🏷️ Matches submission type</td><td>The image content matches the type you selected</td></tr>
      <tr><td>✔️ Submission saved successfully</td><td>Your record is saved — an admin will review it</td></tr>
    </tbody>
  </table>
  {callout(
    "ℹ️ Status shows PENDING after submission",
    "<p>Your submission is saved and awaiting admin review. An admin will change the status to "
    "<strong>Approved</strong> or <strong>Rejected</strong>. You do not need to do anything "
    "further unless you receive notification of a rejection.</p>",
    "note"
  )}
  </div>

  <!-- Rejected -->
  <div id="result-rejected">
  {sub_title("❌ Outcome B — Image Not Valid", "#dc2626")}
  <p style="font-size:12.5px;color:var(--text-sm);margin-bottom:10px">
    Your screenshot failed validation. A red result card shows what failed and how to fix it.
  </p>
  <table class="ref-table">
    <thead><tr><th>Element in result card</th><th>What to do</th></tr></thead>
    <tbody>
      <tr><td>⚠️ Reason message</td><td>Read first — summarises the main problem</td></tr>
      <tr><td>✗ Failed requirement</td><td>Lists each specific item that was missing or unclear</td></tr>
      <tr><td>→ Guideline arrow</td><td>Step-by-step instruction for fixing that specific issue</td></tr>
      <tr><td>💡 Tip at bottom</td><td>Optional improvement suggestion for future submissions</td></tr>
    </tbody>
  </table>
  {callout(
    "🔁 What to do when your submission is rejected",
    "<ul>"
    "<li>Read the <strong>failed requirements</strong> and follow the <strong>→ guidelines</strong></li>"
    "<li>Take a new screenshot that includes all missing elements</li>"
    "<li>Go back to the top of the form, upload the new screenshot, and submit again</li>"
    "<li>Your previous failed attempt is not saved — you start fresh each time</li>"
    "</ul>",
    "warn"
  )}
  </div>
</div>
</section>

</div><!-- /.page -->
"""

# ─────────────────────────────────────────────────────────────────────────────
def main():
    shots = load_screenshots()
    body  = build(shots)
    html  = html_shell("User Guide — Compliance Management System", SIDEBAR, body)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    size = os.path.getsize(OUT) // 1024
    print(f"✅  User guide → {os.path.abspath(OUT)}  ({size} KB)")

if __name__ == "__main__":
    main()
