# Compliance Management System — User Guide Builder
# ==========================================================
# This folder contains scripts to auto-generate the HTML user guides.
#
# QUICK START — run this to rebuild both guides:
#   cd compliance-nextjs/guide
#   python build_all.py
#
# This will:
#   1. Start the Next.js dev server (port 3000) if not already running
#   2. Capture real screenshots of every page with Playwright
#   3. Build user-guide.html  → ../public/user-guide.html
#   4. Build admin-guide.html → ../public/admin-guide.html
#
# PREREQUISITES
# -------------
#   python -m pip install playwright pillow
#   python -m playwright install chromium
#   npm install  (inside compliance-nextjs/)
#
# INDIVIDUAL SCRIPTS
# ------------------
#   python capture_screenshots.py   — screenshots only  (saved to guide/screenshots/)
#   python build_user_guide.py      — user guide only   (reads guide/screenshots/)
#   python build_admin_guide.py     — admin guide only  (reads guide/screenshots/)
#
# OUTPUT FILES
# ------------
#   ../public/user-guide.html
#   ../public/admin-guide.html
#   (both are standalone HTML files — open in browser and Ctrl+P → Save as PDF)
#
# UPDATING GUIDE CONTENT
# ----------------------
#   - To add new sections or rewrite text: edit build_user_guide.py or build_admin_guide.py
#   - To re-capture screenshots only:      run capture_screenshots.py
#   - To rebuild HTML only (reuse existing screenshots): run build_user_guide.py or build_admin_guide.py
#   - Screenshots are cached in guide/screenshots/ — delete the folder to force a fresh capture
#
# ADMIN CREDENTIALS USED FOR SCREENSHOTS
#   Username: admin   Password: Admin@123
# ==========================================================
