"""
build_admin_guide.py
---------------------
Builds public/admin-guide.html from screenshots in guide/screenshots/.

Usage:
    python build_admin_guide.py

Output: ../public/admin-guide.html
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guide_common import (
    load_screenshots, img, steps, box, callout, req_item,
    feature_title, sub_title, html_shell
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT        = os.path.join(SCRIPT_DIR, "..", "public", "admin-guide.html")

# ─── Navigation sidebar ───────────────────────────────────────────────────────
SIDEBAR = """
<aside id="sidebar">
  <div class="sb-brand">
    <span class="logo">🛡️</span>
    <div>
      <div class="title">Compliance System</div>
      <div class="sub">Admin Guide</div>
    </div>
  </div>

  <nav class="sb-nav">
    <div class="sb-group-label">Admin Functions</div>

    <a class="sb-link" href="#admin-login">
      <span class="sb-ico">🔐</span>2.1 Admin Login
    </a>

    <a class="sb-link" href="#admin-overview">
      <span class="sb-ico">📊</span>2.2 Dashboard Overview
    </a>

    <a class="sb-link" href="#user-list">
      <span class="sb-ico">👥</span>2.3 User List
    </a>
    <a class="sb-sub" href="#ul-filter">Filtering &amp; Search</a>
    <a class="sb-sub" href="#ul-review">Reviewing Submissions</a>
    <a class="sb-sub" href="#ul-edit">Inline Editing</a>
    <a class="sb-sub" href="#ul-members">Adding Members</a>

    <a class="sb-link" href="#tracking">
      <span class="sb-ico">📁</span>2.4 Tracking File
    </a>
    <a class="sb-sub" href="#tracking-upload">Upload Tracking.xlsx</a>
    <a class="sb-sub" href="#tracking-download">Download Tracking</a>

    <a class="sb-link" href="#checkin">
      <span class="sb-ico">✅</span>2.5 Check-In Table
    </a>

    <a class="sb-link" href="#notifications">
      <span class="sb-ico">🔔</span>2.6 Notifications
    </a>

    <a class="sb-link" href="#export">
      <span class="sb-ico">📥</span>2.7 Export to Excel
    </a>
  </nav>

  <div class="sb-footer">Admin Guide · v1.0 · May 2026</div>
</aside>
"""

# ─── Build content ────────────────────────────────────────────────────────────
def build(shots: dict) -> str:
    I = lambda key, cap="", w="100%": img(shots, key, cap, w)

    return f"""
<!-- ══ COVER ══ -->
<div class="cover">
  <div class="logo">⚙️</div>
  <h1>Admin Guide</h1>
  <h2>Compliance Management System</h2>
  <div class="divider"></div>
  <div class="meta">
    <div class="meta-item"><div class="label">Version</div><div class="value">1.0</div></div>
    <div class="meta-item"><div class="label">Date</div><div class="value">May 2026</div></div>
    <div class="meta-item"><div class="label">Audience</div><div class="value">Administrators</div></div>
  </div>
  <div class="badges">
    <span class="cbadge">⚙️ For Admins</span>
    <span class="cbadge">🔐 Restricted Access</span>
    <span class="cbadge">📋 Step-by-Step</span>
  </div>
</div>

<!-- ══ MAIN PAGE ══ -->
<div class="page">

<!-- ══ TOC ══ -->
<section id="toc" class="section toc-page">
  <div class="toc">
    <h2>📑 Table of Contents</h2>
    <div class="toc-group">
      <div class="toc-group-title">⚙️ Admin Guide — System Management</div>
      <ul class="toc-list">
        <li><a href="#admin-login">2.1 &nbsp;Admin Login</a><span class="pg">p. 3</span></li>
        <li><a href="#admin-overview">2.2 &nbsp;Dashboard Overview</a><span class="pg">p. 4</span></li>
        <li><a href="#user-list">2.3 &nbsp;User List — View, Filter &amp; Edit Submissions</a><span class="pg">p. 5</span></li>
        <li style="padding-left:16px"><a href="#ul-filter">— Filtering and Searching</a><span class="pg">p. 5</span></li>
        <li style="padding-left:16px"><a href="#ul-review">— Reviewing Submissions (Image + AI Details)</a><span class="pg">p. 6</span></li>
        <li style="padding-left:16px"><a href="#ul-edit">— Inline Editing of Records</a><span class="pg">p. 7</span></li>
        <li style="padding-left:16px"><a href="#ul-members">— Adding / Removing Members</a><span class="pg">p. 8</span></li>
        <li><a href="#tracking">2.4 &nbsp;Tracking File Upload &amp; Download</a><span class="pg">p. 9</span></li>
        <li><a href="#checkin">2.5 &nbsp;Check-In Table</a><span class="pg">p. 10</span></li>
        <li><a href="#notifications">2.6 &nbsp;Sending Notifications</a><span class="pg">p. 11</span></li>
        <li><a href="#export">2.7 &nbsp;Export to Excel</a><span class="pg">p. 12</span></li>
      </ul>
    </div>
  </div>
</section>

<hr/>

<!-- ══ 2.1 Login ══ -->
<section id="admin-login" class="section">
<div class="feature">
  {feature_title("🔐", "2.1 &nbsp;Admin Login")}
  <p class="feature-intro">Admin access requires credentials. The admin login page is separate from the user dashboard.</p>

  {steps([
    ("Navigate to the Admin Login page",
     "Go to <code>http://localhost:3000/admin/login</code> — you will see the login form."),
    ("Enter your admin username and password",
     "Type your credentials in the <strong>Username</strong> and <strong>Password</strong> fields. "
     "Default first-time credentials: username <code>admin</code>, password <code>Admin@123</code>."),
    ("Click the Login button",
     "If credentials are correct, you are redirected to the Admin Dashboard. "
     "If incorrect, an error message appears below the form. Re-enter and try again."),
  ])}

  {I("admin_02_login_filled", "Admin Login page — enter username and password to access the admin panel")}

  {callout(
    "🔒 Security Note",
    "<p>Your admin session is stored securely in the browser. "
    "If you close the browser or the session expires, you will need to log in again. "
    "Always log out when using a shared computer.</p>",
    "note"
  )}
</div>
</section>

<!-- ══ 2.2 Overview ══ -->
<section id="admin-overview" class="section">
<div class="feature">
  {feature_title("📊", "2.2 &nbsp;Dashboard Overview")}
  <p class="feature-intro">After logging in, you land on the Admin Dashboard which shows the main navigation and summary panels.</p>

  {I("admin_03_after_login", "Admin Dashboard — main navigation and summary")}

  {steps([
    ("The left sidebar shows navigation",
     "Items: <strong>User List</strong> (submissions), <strong>Check-In Table</strong> (overview grid), "
     "<strong>Notifications</strong> (deadline alerts), <strong>Export</strong> (Excel download)."),
    ("Summary numbers are shown on cards",
     "Quick counts show total submissions, pending reviews, approved, and rejected records."),
    ("Use the sidebar to navigate between sections",
     "Click any sidebar link to go directly to that section. The current section is highlighted."),
  ])}
</div>
</section>

<!-- ══ 2.3 User List ══ -->
<section id="user-list" class="section">
<div class="feature">
  {feature_title("👥", "2.3 &nbsp;User List — View, Filter &amp; Edit Submissions")}
  <p class="feature-intro">
    The User List is the main management area. It shows all compliance submissions as a table with filtering, sorting, inline editing, and review tools.
  </p>
  {I("admin_04_user_list", "User List — all submissions shown as a filterable, editable table")}

  <!-- Filtering -->
  <div id="ul-filter">
  {sub_title("Filtering and Searching")}
  {steps([
    ("Use the Project filter dropdown",
     "Click the <strong>Project</strong> multi-select dropdown at the top. "
     "Tick specific project names to show only those members, or leave all blank for all projects."),
    ("Use the text search field",
     "Type any keyword in the <strong>Search</strong> box to filter rows by name, account, or type."),
    ("Use the Status filter",
     "Click the <strong>Status</strong> dropdown to show only <em>Pending</em>, <em>Approved</em>, or <em>Rejected</em> submissions."),
    ("Filter by period",
     "Use the <strong>Month/Year</strong> date picker to show only submissions for a specific period."),
  ])}
  {I("admin_06_filters", "User List with filters applied — filtered by project and status")}
  </div>

  <!-- Reviewing -->
  <div id="ul-review">
  {sub_title("Reviewing Submissions (Image + AI Details)")}
  {steps([
    ("Find the submission row you want to review",
     "Scroll or filter the table to locate the user."),
    ("Click the 👁️ Review icon in the Actions column",
     "A <strong>Review Modal</strong> appears showing: the uploaded screenshot, AI validation result, confidence score, detected device type, and any failure reasons."),
    ("Review the image and AI analysis",
     "Check whether the screenshot shows all required items. The AI result shows what it found (or did not find)."),
    ("Change the status to Approved or Rejected",
     "Inside the modal, use the <strong>Status</strong> dropdown to set <strong>Approved ✅</strong> or <strong>Rejected ❌</strong>. "
     "Add a note in the <strong>Admin Note</strong> field if needed, then click <strong>Save</strong>."),
  ])}
  {I("admin_07_table", "Review Modal — shows the full screenshot, AI validation details, and status controls")}
  </div>

  <!-- Editing -->
  <div id="ul-edit">
  {sub_title("Inline Editing of Records")}
  <p style="font-size:12.5px;color:var(--text-sm);margin-bottom:10px">
    Any cell in the User List can be edited directly in the table — no separate edit screen is needed.
  </p>
  {steps([
    ("Double-click (or click the ✏️ icon) on any editable cell",
     "The cell becomes an input field. Editable columns include: Name, Project, Team, Laptop Type, Status, Notes, and compliance tracking fields."),
    ("Type the new value and press <kbd>Enter</kbd> (or click away)",
     "The change is saved automatically. A green flash confirms the save."),
    ("To cancel an edit",
     "Press <kbd>Escape</kbd> while the cell is active — the original value is restored."),
  ])}
  {I("admin_07_table", "Inline editing — click a cell to edit it directly in the table; press Enter to save")}
  </div>

  <!-- Members -->
  <div id="ul-members">
  {sub_title("Adding / Removing Members")}
  {steps([
    ("To add a new member",
     "Click the <strong>+ Add Member</strong> button above the table. Fill in the required fields (name, account, project, type) and click <strong>Save</strong>."),
    ("To remove a member",
     "Click the 🗑️ <strong>Delete</strong> icon at the end of the row. A confirmation prompt appears — click <strong>Confirm</strong> to proceed."),
  ])}
  {callout(
    "⚠️ Deleting a member is permanent",
    "<p>Deleting a member removes their record and submission history. "
    "Consider setting status to <strong>Rejected</strong> or adding a note instead, "
    "to preserve the audit trail.</p>",
    "warn"
  )}
  </div>
</div>
</section>

<!-- ══ 2.4 Tracking ══ -->
<section id="tracking" class="section">
<div class="feature">
  {feature_title("📁", "2.4 &nbsp;Tracking File Upload &amp; Download")}
  <p class="feature-intro">
    The system uses a <strong>tracking.xlsx</strong> Excel file as the master member list. Upload a new file to add or update members in bulk.
  </p>

  <div id="tracking-upload">
  {sub_title("Upload tracking.xlsx")}
  {steps([
    ("Prepare your tracking.xlsx file",
     "The Excel file must have these columns: <code>Name</code>, <code>Account</code>, <code>Project</code>, <code>Team</code>, <code>Laptop Type</code>. "
     "Each row is one member. Save as <strong>.xlsx</strong> format."),
    ("In the Admin Dashboard, go to User List",
     "Click the <strong>📤 Upload Tracking</strong> button at the top of the User List page."),
    ("Select your file",
     "Click <strong>Choose file</strong>, pick your <code>tracking.xlsx</code>, then click <strong>Upload</strong>. "
     "The system imports the data and merges it with existing submissions."),
    ("Verify the data",
     "The table updates to show the imported members. Check that all rows and projects loaded correctly."),
  ])}
  {I("admin_05_topbar", "Upload Tracking.xlsx button at the top of the User List page")}
  </div>

  <div id="tracking-download">
  {sub_title("Download Tracking")}
  {steps([
    ("Click the 📥 Download Tracking button",
     "The current tracking file is downloaded to your computer. Use it as a backup or to edit and re-upload."),
  ])}

  {box(
    "<strong>tracking.xlsx format reference:</strong><br/>"
    "<table class='ref-table' style='margin-top:8px'>"
    "<thead><tr><th>Column</th><th>Example</th><th>Required</th></tr></thead>"
    "<tbody>"
    "<tr><td>Name</td><td>Nguyen Van A</td><td>✅ Yes</td></tr>"
    "<tr><td>Account</td><td>AnhNV</td><td>✅ Yes</td></tr>"
    "<tr><td>Project</td><td>Alpha</td><td>✅ Yes</td></tr>"
    "<tr><td>Team</td><td>Backend</td><td>Optional</td></tr>"
    "<tr><td>Laptop Type</td><td>windows / mac / thin</td><td>✅ Yes</td></tr>"
    "</tbody></table>",
    "info"
  )}
  </div>
</div>
</section>

<!-- ══ 2.5 Check-in ══ -->
<section id="checkin" class="section">
<div class="feature">
  {feature_title("✅", "2.5 &nbsp;Check-In Table")}
  <p class="feature-intro">
    The Check-In Table provides a bird's-eye view of all users and their compliance status in a color-coded grid.
  </p>

  {I("admin_08_checkin", "Check-In Table — color-coded grid of all members and their compliance status")}

  {steps([
    ("Open the Check-In Table",
     "Click <strong>Check-In Table</strong> in the sidebar."),
    ("Read the color codes",
     "<span style='display:inline-block;background:#16a34a;color:#fff;padding:1px 8px;border-radius:4px;font-size:11px'>Complete</span> — Approved &nbsp; "
     "<span style='display:inline-block;background:#d97706;color:#fff;padding:1px 8px;border-radius:4px;font-size:11px'>Pending</span> — Awaiting review &nbsp; "
     "<span style='display:inline-block;background:#dc2626;color:#fff;padding:1px 8px;border-radius:4px;font-size:11px'>Missing</span> — No submission"),
    ("Filter by Project",
     "Use the <strong>Project</strong> dropdown to show only a specific team's status."),
    ("Filter by Status or Date Range",
     "Use the status and date-range filters at the top to narrow the grid."),
    ("Click a cell to view the record",
     "Clicking a colored cell opens the review modal for that member's submission."),
  ])}

  {callout(
    "📊 Use for deadline tracking",
    "<p>Sort by the <strong>Missing</strong> filter and send a targeted reminder to only the members "
    "who have not yet submitted. Combine with the Notifications section to send a Teams message.</p>",
    "tip"
  )}
</div>
</section>

<!-- ══ 2.6 Notifications ══ -->
<section id="notifications" class="section">
<div class="feature">
  {feature_title("🔔", "2.6 &nbsp;Sending Notifications")}
  <p class="feature-intro">
    The Notifications panel lets you send deadline reminders to all pending members via Microsoft Teams webhook.
  </p>

  {I("admin_09_notifications", "Notifications panel — configure message and send Teams reminder")}

  {steps([
    ("Open the Notifications section",
     "Click <strong>Notifications</strong> in the sidebar."),
    ("Set the Deadline Date",
     "Click the <strong>Deadline Date</strong> field and pick the date by which all submissions must be done."),
    ("Edit the notification message",
     "The default message is pre-filled. Click the text area to customise it — include the deadline date, what's required, and who to contact."),
    ("Click Send Reminder",
     "Click the <strong>📨 Send Reminder</strong> button. "
     "A confirmation message appears and the <strong>Last Sent</strong> timestamp updates."),
    ("Verify delivery",
     "Check your Teams channel to confirm the message arrived. If it did not, check the webhook URL is correctly configured."),
  ])}

  {callout(
    "⏰ Automated reminders",
    "<p>The system can also be configured to send reminders automatically on a schedule "
    "(e.g. every weekday at 9 AM). Manual send is for ad-hoc announcements. "
    "Contact your system administrator to enable the automated schedule.</p>",
    "note"
  )}

  {I("admin_10_notifications_filled", "Filled Notifications form ready to send — deadline date and custom message set")}
</div>
</section>

<!-- ══ 2.7 Export ══ -->
<section id="export" class="section">
<div class="feature">
  {feature_title("📥", "2.7 &nbsp;Export to Excel")}
  <p class="feature-intro">
    Download the full compliance report as an Excel (.xlsx) file for offline analysis, sharing with management, or archiving.
  </p>

  {steps([
    ("Navigate to the Admin Dashboard",
     "Any admin page works — the Export button is accessible from the top navigation bar or the sidebar."),
    ("Click the 📥 Export to Excel button",
     "The file is generated and downloaded automatically by your browser. Check your Downloads folder."),
    ("Open the downloaded file",
     "The file is named <code>compliance-report-YYYYMMDD-HHmm.xlsx</code>. "
     "Open it with Microsoft Excel or any compatible spreadsheet app."),
    ("Review the contents",
     "The export includes all columns: Account, Name, Project, Type, Status, Submission Date, AI Confidence, Admin Notes, and compliance field data."),
  ])}

  {I("admin_05_topbar", "Export button in the Admin Dashboard — click to download compliance-report.xlsx")}

  {box(
    "<strong>What is included in the export:</strong><br/>"
    "<ul style='margin:6px 0 0 16px;padding:0;font-size:12px'>"
    "<li>All submission records (approved, pending, rejected)</li>"
    "<li>AI validation result and confidence score</li>"
    "<li>Admin review notes and status</li>"
    "<li>Submission timestamps and device type</li>"
    "<li>SEED compliance fields (for Windows/Mac types)</li>"
    "</ul>",
    "info"
  )}

  {callout(
    "📅 Best practice — export at end of period",
    "<p>Export the report at the end of each compliance period (e.g. end of month). "
    "Archive each export file with the date in the filename so you have a historical record.</p>",
    "tip"
  )}
</div>
</section>

</div><!-- /.page -->
"""

# ─────────────────────────────────────────────────────────────────────────────
def main():
    shots = load_screenshots()
    body  = build(shots)
    html  = html_shell("Admin Guide — Compliance Management System", SIDEBAR, body)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    size = os.path.getsize(OUT) // 1024
    print(f"✅  Admin guide → {os.path.abspath(OUT)}  ({size} KB)")

if __name__ == "__main__":
    main()
