"""
guide_common.py
-----------------
Shared CSS, JavaScript, and HTML component helpers used by both
build_user_guide.py and build_admin_guide.py.
"""
import json, os

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(SCRIPT_DIR, "screenshots", "manifest.json")

# ── Load screenshots ──────────────────────────────────────────────────────────
def load_screenshots() -> dict:
    if not os.path.exists(MANIFEST_PATH):
        raise FileNotFoundError(
            f"Screenshots not found at {MANIFEST_PATH}\n"
            "Run:  python capture_screenshots.py  first."
        )
    with open(MANIFEST_PATH) as f:
        return json.load(f)


# ── Component helpers ─────────────────────────────────────────────────────────
def img(shots: dict, key: str, caption="", width="100%") -> str:
    src = shots.get(key, "")
    if not src:
        return f'<div class="img-placeholder">📷 Screenshot not found: {key}</div>'
    cap = f'<p class="caption">📸 {caption}</p>' if caption else ""
    return (f'<div class="img-wrap">'
            f'<img class="screenshot" src="{src}" style="width:{width}" alt="{caption}" />'
            f'{cap}</div>')


def two_col(left: str, right: str) -> str:
    return f'<div class="two-col">{left}{right}</div>'


def three_col(*cols: str) -> str:
    items = "".join(f"<div>{c}</div>" for c in cols)
    return f'<div class="three-col">{items}</div>'


def card(content: str, accent="") -> str:
    style = f'border-top: 3px solid {accent};' if accent else ""
    return f'<div class="col-card" style="{style}">{content}</div>'


def steps(items: list[tuple[str, str]]) -> str:
    """items = list of (title, description) tuples"""
    lis = "".join(
        f'<li><div class="sc"><div class="st">{t}</div><div class="sd">{d}</div></div></li>'
        for t, d in items
    )
    return f'<ol class="steps">{lis}</ol>'


def box(content: str, kind="info") -> str:
    icons = {"info": "ℹ️", "success": "✅", "warn": "⚠️", "error": "🚫"}
    ico   = icons.get(kind, "ℹ️")
    return (f'<div class="box box-{kind}">'
            f'<span class="bi">{ico}</span><div>{content}</div></div>')


def callout(title: str, body: str, kind="tip") -> str:
    return (f'<div class="callout callout-{kind}">'
            f'<h4>{title}</h4>{body}</div>')


def req_item(icon: str, title: str, desc: str, required=True) -> str:
    tag = '<span class="req-tag">REQUIRED</span>' if required else '<span class="opt-tag">OPTIONAL</span>'
    return (f'<li><span class="ri">{icon}</span>'
            f'<div class="rt"><strong>{title} {tag}</strong>'
            f'<span>{desc}</span></div></li>')


def section_open(sid: str, extra_class="") -> str:
    return f'<section id="{sid}" class="section {extra_class}">'


def feature_title(icon: str, text: str) -> str:
    return f'<div class="feature-title"><span class="ico">{icon}</span>{text}</div>'


def sub_title(text: str, color="") -> str:
    style = f' style="color:{color}"' if color else ""
    return f'<div class="feature-sub"{style}>{text}</div>'


# ── Shared CSS ────────────────────────────────────────────────────────────────
SHARED_CSS = """
/* ── Reset ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ── Variables ── */
:root{
  --blue:#2563eb;--blue-lt:#eff6ff;--blue-bd:#bfdbfe;
  --green:#16a34a;--grn-lt:#f0fdf4;--grn-bd:#bbf7d0;
  --yellow:#b45309;--yel-lt:#fefce8;--yel-bd:#fde68a;
  --red:#dc2626;--red-lt:#fef2f2;--red-bd:#fecaca;
  --gray:#6b7280;--gray-lt:#f9fafb;--gray-bd:#e5e7eb;
  --primary:#4f46e5;--primary-dk:#3730a3;
  --text:#111827;--text-sm:#374151;--text-xs:#6b7280;
  --sidebar-w:240px;
}

/* ── Body / layout ── */
html{scroll-behavior:smooth}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.65;color:var(--text);
  background:#f8f7ff;display:flex}

/* ── Sidebar ── */
#sidebar{
  position:fixed;left:0;top:0;width:var(--sidebar-w);height:100vh;
  background:linear-gradient(180deg,#1e1b4b 0%,#312e81 100%);
  overflow-y:auto;z-index:100;display:flex;flex-direction:column;
  scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent;
}
#sidebar::-webkit-scrollbar{width:4px}
#sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:2px}
.sb-brand{
  padding:20px 16px 16px;border-bottom:1px solid rgba(255,255,255,.1);
  color:white;display:flex;align-items:center;gap:10px
}
.sb-brand .logo{font-size:24px;flex-shrink:0}
.sb-brand .title{font-size:13px;font-weight:700;line-height:1.3}
.sb-brand .sub{font-size:10px;opacity:.6;margin-top:2px}
.sb-nav{padding:12px 0;flex:1}
.sb-group-label{
  font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;
  color:rgba(255,255,255,.4);padding:12px 16px 4px
}
.sb-link{
  display:flex;align-items:center;gap:9px;padding:7px 16px;
  color:rgba(255,255,255,.7);text-decoration:none;font-size:12px;
  transition:background .15s,color .15s;cursor:pointer;
  border-left:3px solid transparent;
}
.sb-link:hover{background:rgba(255,255,255,.08);color:white}
.sb-link.active{background:rgba(255,255,255,.12);color:white;border-left-color:white}
.sb-link .sb-ico{width:18px;text-align:center;flex-shrink:0;font-size:14px}
.sb-sub{
  display:flex;align-items:center;gap:9px;padding:5px 16px 5px 42px;
  color:rgba(255,255,255,.5);text-decoration:none;font-size:11.5px;
  transition:background .15s,color .15s;cursor:pointer;
  border-left:3px solid transparent;
}
.sb-sub:hover{background:rgba(255,255,255,.06);color:rgba(255,255,255,.85)}
.sb-sub.active{color:white;border-left-color:rgba(255,255,255,.6)}
.sb-footer{
  padding:12px 16px;border-top:1px solid rgba(255,255,255,.1);
  font-size:10.5px;color:rgba(255,255,255,.4);
}

/* ── Main content ── */
#content{margin-left:var(--sidebar-w);flex:1;min-width:0}

/* ── Cover ── */
.cover{
  background:linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#4338ca 100%);
  color:white;text-align:center;padding:80px 40px;min-height:100vh;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
}
.cover .logo{font-size:80px;margin-bottom:20px}
.cover h1{font-size:36px;font-weight:800;letter-spacing:-.5px;margin-bottom:8px}
.cover h2{font-size:17px;font-weight:400;opacity:.75;margin-bottom:40px}
.cover .divider{width:80px;height:3px;background:rgba(255,255,255,.3);margin:28px auto;border-radius:2px}
.cover .meta{display:flex;gap:32px;justify-content:center;flex-wrap:wrap}
.cover .meta-item .label{font-size:10px;opacity:.55;text-transform:uppercase;letter-spacing:1.5px}
.cover .meta-item .value{font-size:15px;font-weight:700;margin-top:3px}
.cover .badges{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:28px}
.cover .cbadge{padding:6px 16px;border-radius:20px;border:1px solid rgba(255,255,255,.3);
  font-size:12px;background:rgba(255,255,255,.1)}

/* ── Page sections ── */
.page{max-width:880px;margin:0 auto;padding:40px 48px}

/* ── TOC ── */
.toc-page{padding-bottom:60px}
.toc h2{font-size:22px;font-weight:800;color:var(--primary);border-bottom:3px solid var(--primary);
  padding-bottom:10px;margin-bottom:28px}
.toc-group{margin-bottom:20px}
.toc-group-title{
  font-size:13px;font-weight:700;background:var(--gray-lt);
  border-left:4px solid var(--primary);padding:7px 12px;
  border-radius:0 6px 6px 0;margin-bottom:8px
}
.toc-list{list-style:none;margin-left:8px}
.toc-list li{
  display:flex;justify-content:space-between;align-items:baseline;
  padding:4px 6px;border-bottom:1px dotted #d1d5db;font-size:12.5px;
  color:var(--text-sm);
}
.toc-list li a{color:inherit;text-decoration:none;flex:1}
.toc-list li a:hover{color:var(--primary);text-decoration:underline}
.toc-list li .pg{color:var(--text-xs);font-size:11.5px;margin-left:8px;white-space:nowrap}

/* ── Section ── */
.section{padding-top:8px}
.sec-banner{
  padding:28px 36px;border-radius:14px;color:white;margin-bottom:32px;
}
.sec-banner.user{background:linear-gradient(135deg,#1d4ed8,#4338ca)}
.sec-banner.admin{background:linear-gradient(135deg,#1f2937,#374151)}
.sec-banner .tag{font-size:10px;opacity:.65;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px}
.sec-banner h2{font-size:26px;font-weight:800}
.sec-banner p{font-size:13px;opacity:.8;margin-top:4px}

/* ── Feature ── */
.feature{margin-bottom:48px;background:white;border-radius:14px;
  padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #f0effe}
.feature-title{
  font-size:18px;font-weight:800;color:var(--primary);
  display:flex;align-items:center;gap:10px;
  border-bottom:2px solid var(--blue-bd);padding-bottom:10px;margin-bottom:18px
}
.feature-title .ico{font-size:22px}
.feature-sub{font-size:14px;font-weight:700;color:var(--text);margin:20px 0 10px;
  display:flex;align-items:center;gap:8px}
.feature-intro{color:var(--text-sm);margin-bottom:14px;font-size:12.5px}

/* ── Steps ── */
.steps{counter-reset:step;list-style:none;margin:14px 0}
.steps li{counter-increment:step;display:flex;gap:14px;margin-bottom:15px;align-items:flex-start}
.steps li::before{
  content:counter(step);min-width:28px;height:28px;background:var(--primary);color:white;
  border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px;
  box-shadow:0 2px 6px rgba(79,70,229,.3)
}
.steps li .sc{flex:1}
.steps li .st{font-weight:700;font-size:13px;color:var(--text);margin-bottom:3px}
.steps li .sd{font-size:12.5px;color:var(--text-sm);line-height:1.6}

/* ── Info boxes ── */
.box{border-radius:8px;padding:12px 16px;margin:14px 0;display:flex;gap:12px;font-size:12.5px;align-items:flex-start}
.bi{font-size:18px;flex-shrink:0;margin-top:1px}
.box-info{background:var(--blue-lt);border:1px solid var(--blue-bd);color:#1e40af}
.box-success{background:var(--grn-lt);border:1px solid var(--grn-bd);color:#166534}
.box-warn{background:var(--yel-lt);border:1px solid var(--yel-bd);color:#92400e}
.box-error{background:var(--red-lt);border:1px solid var(--red-bd);color:#991b1b}

/* ── Callout ── */
.callout{border-radius:8px;padding:14px 18px;margin:14px 0}
.callout-tip{background:#f0fdf4;border-left:4px solid #16a34a}
.callout-note{background:#eff6ff;border-left:4px solid #2563eb}
.callout-warn{background:#fffbeb;border-left:4px solid #d97706}
.callout h4{font-size:12.5px;font-weight:700;margin-bottom:5px}
.callout p,.callout ul{font-size:12px;color:var(--text-sm)}
.callout ul{margin-left:16px}
.callout ul li{margin-bottom:3px}

/* ── Screenshots ── */
.img-wrap{margin:16px 0;text-align:center}
.screenshot{border-radius:10px;border:1.5px solid var(--gray-bd);
  box-shadow:0 3px 14px rgba(0,0,0,.1);max-width:100%;display:block;margin:0 auto}
.caption{font-size:11px;color:var(--text-xs);margin-top:7px;font-style:italic}
.img-placeholder{background:var(--gray-lt);border:2px dashed var(--gray-bd);border-radius:10px;
  padding:28px;text-align:center;color:var(--text-xs);font-size:12.5px;margin:14px 0}

/* ── Columns ── */
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:14px 0}
.three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:14px 0}
.col-card{background:white;border:1.5px solid var(--gray-bd);border-radius:10px;padding:16px}
.col-card h4{font-size:13px;font-weight:700;margin-bottom:7px}
.col-card p,.col-card ul{font-size:12px;color:var(--text-sm)}
.col-card ul{margin-left:14px}
.col-card ul li{margin-bottom:3px}

/* ── Requirement list ── */
.req-list{list-style:none;margin:10px 0}
.req-list li{
  display:flex;gap:10px;align-items:flex-start;
  padding:9px 12px;margin-bottom:7px;border-radius:8px;
  border:1px solid var(--gray-bd);background:#fafafa
}
.ri{font-size:18px;flex-shrink:0;margin-top:1px}
.rt{flex:1}
.rt strong{display:block;font-size:12.5px}
.rt span{font-size:11.5px;color:var(--text-xs)}
.req-tag{font-size:9.5px;padding:1px 6px;border-radius:4px;font-weight:700;background:#fee2e2;color:#991b1b;margin-left:6px}
.opt-tag{font-size:9.5px;padding:1px 6px;border-radius:4px;font-weight:700;background:#f3f4f6;color:#6b7280;margin-left:6px}

/* ── Status badges ── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:600}
.b-approved{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
.b-pending{background:#fef9c3;color:#854d0e;border:1px solid #fde047}
.b-rejected{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
.b-missing{background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb}

/* ── Reference table ── */
.ref-table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
.ref-table th{background:#f9fafb;border:1px solid var(--gray-bd);padding:8px 10px;
  text-align:left;font-size:10.5px;text-transform:uppercase;color:var(--text-xs)}
.ref-table td{border:1px solid var(--gray-bd);padding:8px 10px;color:var(--text-sm);vertical-align:top}
.ref-table tr:nth-child(even) td{background:#fafafa}

/* ── Color legend ── */
.legend{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}
.litem{padding:5px 14px;border-radius:6px;font-size:11.5px;font-weight:600;border:1px solid}

/* ── Misc ── */
kbd{background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace}
code{background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:11.5px;font-family:monospace}
hr{border:none;border-top:1px solid var(--gray-bd);margin:32px 0}

/* ── Back to top ── */
#back-top{
  position:fixed;bottom:28px;right:28px;width:42px;height:42px;border-radius:50%;
  background:var(--primary);color:white;border:none;font-size:18px;cursor:pointer;
  box-shadow:0 4px 12px rgba(79,70,229,.4);z-index:200;opacity:0;
  transform:translateY(8px);transition:opacity .25s,transform .25s;
  display:flex;align-items:center;justify-content:center;
}
#back-top.visible{opacity:1;transform:translateY(0)}
#back-top:hover{background:var(--primary-dk)}

/* ── Print ── */
@media print{
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{margin:18mm 16mm}
  body{background:white;display:block}
  #sidebar,#back-top{display:none!important}
  #content{margin-left:0!important}
  .page{padding:0;max-width:100%}
  .feature{box-shadow:none;border:1px solid #e5e7eb;page-break-inside:avoid}
  .cover{min-height:0;padding:60px 40px;page-break-after:always}
  .sec-banner{page-break-before:always}
  .img-wrap,.callout,.req-list li{page-break-inside:avoid}
  h3,h4,h2{page-break-after:avoid}
  .toc-page{page-break-after:always}
  .toc-list li a{text-decoration:none;color:inherit}
}
"""

# ── Shared JS ─────────────────────────────────────────────────────────────────
SHARED_JS = """
// ── Back-to-top button ────────────────────────────────────────────────────────
const backTop = document.getElementById('back-top');
window.addEventListener('scroll', () => {
  backTop.classList.toggle('visible', window.scrollY > 320);
}, {passive: true});
backTop.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));

// ── Active sidebar section detection ─────────────────────────────────────────
const allLinks  = document.querySelectorAll('#sidebar a[href^="#"]');
const sections  = Array.from(document.querySelectorAll('section[id]'));

function setActive(id) {
  allLinks.forEach(a => {
    const match = a.getAttribute('href') === '#' + id;
    a.classList.toggle('active', match);
  });
}

const observer = new IntersectionObserver(
  entries => {
    entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
  },
  { threshold: 0.15, rootMargin: '-80px 0px -60% 0px' }
);
sections.forEach(s => observer.observe(s));

// ── TOC link smooth scroll ────────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  });
});
"""

# ── HTML shell ────────────────────────────────────────────────────────────────
def html_shell(title: str, sidebar_html: str, body_html: str, extra_css="") -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{title}</title>
<style>
{SHARED_CSS}
{extra_css}
</style>
</head>
<body>

{sidebar_html}

<div id="content">
{body_html}
</div>

<button id="back-top" title="Back to top">↑</button>

<script>
{SHARED_JS}
</script>
</body>
</html>"""
