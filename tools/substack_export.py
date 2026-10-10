#!/usr/bin/env python3
"""
Turn a published post into a Substack-ready HTML file you can paste in one go.

    python3 tools/substack-export.py _posts/2026-10-10-my-article.md
    python3 tools/substack-export.py --all

Why this exists
---------------
Substack has no public API for creating posts. The only sanctioned ways in are
the editor and a one-time RSS import, so "publish to Substack automatically"
is not something that can be built honestly. What this does instead is remove
every fiddly part of pasting, so the job takes about a minute:

  * Inline SVG figures are rendered to PNG and saved in img/. Substack strips
    inline SVG, so the charts would otherwise vanish.
  * The Tally questionnaire iframe becomes a plain link. Substack strips
    iframes and scripts.
  * Every image URL is made absolute, so Substack's editor can fetch the
    picture when you paste rather than leaving a broken image.
  * Jekyll front matter is dropped, and the title, subtitle and a canonical
    link back to the site are put at the top of the file for you to copy.

Output lands in _substack/, which stays off the website because the folder
name starts with an underscore.
"""

import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import markdown
except ImportError:
    sys.exit("Install the markdown package first:  pip install markdown")

REPO = Path(__file__).resolve().parent.parent
SITE = "https://neuroscienceofmeditation.in"
OUT_DIR = REPO / "_substack"
IMG_DIR = REPO / "img"

# Playwright renders the SVG in the browser that will have drawn it correctly
# on the site, so fonts and layout match what readers already saw.
CHROME = "/opt/pw-browsers/chromium/chrome-linux/chrome"


# ---------------------------------------------------------------- front matter

def split_front_matter(text):
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta = {}
    for line in parts[1].strip().splitlines():
        m = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if m:
            meta[m.group(1)] = m.group(2).strip().strip('"')
    return meta, parts[2]


# ---------------------------------------------------------------- SVG -> PNG

def render_svgs(body, slug):
    """Replace each <figure> that contains an <svg> with a rendered PNG."""
    figures = re.findall(r"<figure\b.*?</figure>", body, re.S)
    n = 0
    for fig in figures:
        if "<svg" not in fig:
            continue
        n += 1
        svg = re.search(r"<svg\b.*?</svg>", fig, re.S).group(0)
        cap = re.search(r"<figcaption[^>]*>(.*?)</figcaption>", fig, re.S)
        caption = re.sub(r"<[^>]+>", "", cap.group(1)).strip() if cap else ""

        name = f"{slug}-figure-{n}.png"
        dest = IMG_DIR / name
        if not svg.lstrip().startswith("<svg xmlns"):
            svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
        png_ok = svg_to_png(svg, dest)

        if png_ok:
            replacement = (
                f'<figure><img src="{SITE}/img/{name}" alt="{caption[:120]}" '
                f'style="width:100%;max-width:680px">'
                + (f"<figcaption>{caption}</figcaption>" if caption else "")
                + "</figure>"
            )
            print(f"  figure {n}: rendered -> img/{name}")
        else:
            # Never silently drop a figure: leave the caption as a note.
            replacement = f"<p><em>[Figure: {caption}]</em></p>" if caption else ""
            print(f"  figure {n}: RENDER FAILED, left a caption placeholder")
        body = body.replace(fig, replacement)
    return body


def svg_to_png(svg, dest, width=1360):
    """Render one SVG with headless Chromium at 2x for a crisp result."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  playwright not installed; skipping figure rendering")
        return False

    # Inline the SVG rather than loading it from a file. A page created with
    # set_content has an about:blank origin, which blocks file:// subresources,
    # so an <img src="file://..."> renders as a broken image.
    scaled = re.sub(
        r"<svg\b",
        '<svg style="width:100%;height:auto;display:block"',
        svg,
        count=1,
    )
    html = (
        '<body style="margin:0;background:#fff">'
        f'<div id="f" style="width:{width}px;background:#fff">{scaled}</div>'
        "</body>"
    )
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(
                executable_path=CHROME if os.path.exists(CHROME) else None
            )
            pg = b.new_page(device_scale_factor=2)
            pg.set_content(html)
            pg.wait_for_timeout(350)
            pg.locator("#f").screenshot(path=str(dest))
            b.close()
        return dest.exists() and dest.stat().st_size > 0
    except Exception as e:                          # noqa: BLE001
        print(f"  render error: {e}")
        return False


# ---------------------------------------------------------------- embeds

def strip_embeds(body):
    """Substack drops iframes and scripts. Turn the questionnaire into a link."""
    tally = re.search(r'data-tally-src="([^"?]+)', body)
    link = None
    if tally:
        link = tally.group(1).replace("/embed/", "/r/")

    # Remove the whole embed wrapper: the div that holds the iframe + script.
    body = re.sub(
        r'<div[^>]*>\s*<iframe\b.*?</div>', "", body, flags=re.S
    )
    body = re.sub(r"<script\b.*?</script>", "", body, flags=re.S)
    body = re.sub(r"<noscript\b.*?</noscript>", "", body, flags=re.S)
    # The "Not loading? Open it in a new tab" fallback is meaningless off-site.
    body = re.sub(r"<p[^>]*>\s*Not loading\?.*?</p>", "", body, flags=re.S)

    if link:
        body += (
            f'\n\n<p><a href="{link}">Take the questionnaire</a> '
            f"(it opens in a new tab).</p>\n"
        )
    return body


# ---------------------------------------------------------------- main convert

def build(path, quiet=False):
    """
    Convert one post to clean, absolute-URL HTML.

    Returns a dict with the pieces both Substack and the newsletter need, so
    the figures are rendered once and the markdown converted once.
    """
    path = Path(path)
    meta, body = split_front_matter(path.read_text(encoding="utf-8"))
    slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", path.stem)

    if not quiet:
        print(f"{path.name}")
    body = render_svgs(body, slug)
    body = strip_embeds(body)

    html = markdown.markdown(
        body, extensions=["extra", "sane_lists"], output_format="html5"
    )

    # Relative URLs have to become absolute: neither Substack's editor nor an
    # email client can resolve "/img/photo.webp" on its own.
    html = re.sub(r'(<img[^>]+src=")/', rf"\1{SITE}/", html)
    html = re.sub(r'(<a[^>]+href=")/(?!/)', rf"\1{SITE}/", html)

    return {
        "path": path,
        "slug": slug,
        "meta": meta,
        "title": meta.get("title", slug),
        "subtitle": meta.get("description", ""),
        "takeaway": meta.get("takeaway", ""),
        "canonical": f"{SITE}{meta.get('permalink', '/' + slug + '.html')}",
        "image": (SITE + meta["image"]) if meta.get("image") else "",
        "body_html": html,
    }


def convert(path):
    a = build(path)
    out = OUT_DIR / f"{a['path'].stem}.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(PAGE.format(
        title=esc(a["title"]), subtitle=esc(a["subtitle"]),
        canonical=a["canonical"], body=a["body_html"],
    ), encoding="utf-8")
    print(f"  -> {out.relative_to(REPO)}\n")
    return out


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


PAGE = """<!doctype html>
<meta charset="utf-8">
<title>{title}</title>
<style>
  body{{max-width:680px;margin:40px auto;padding:0 20px;
       font:17px/1.7 Georgia,'Times New Roman',serif;color:#1a1a1a}}
  .howto{{font:14px/1.6 system-ui,sans-serif;background:#F4F0E2;border-radius:10px;
         padding:16px 18px;margin-bottom:34px;color:#44503f}}
  .howto b{{display:block;margin-bottom:6px;color:#14342B}}
  .howto ol{{margin:8px 0 0;padding-left:20px}}
  .meta{{font:14px/1.6 system-ui,sans-serif;border-left:3px solid #C6A15B;
        padding-left:14px;margin-bottom:34px;color:#555}}
  h1{{font-size:30px;line-height:1.25;margin:0 0 8px}}
  h2{{font-size:22px;margin:34px 0 10px}}
  img{{max-width:100%;height:auto;border-radius:8px}}
  figure{{margin:26px 0}}
  figcaption{{font:13px/1.5 system-ui,sans-serif;color:#666;margin-top:8px}}
  table{{border-collapse:collapse;width:100%;font-size:16px}}
  th,td{{border:1px solid #ddd;padding:8px 10px;text-align:left}}
  blockquote{{border-left:3px solid #ddd;margin:0;padding-left:16px;color:#555}}
</style>

<div class="howto">
  <b>To put this on Substack</b>
  <ol>
    <li>Click anywhere below this box, then select everything from the title down
        (Ctrl&nbsp;+&nbsp;A works) and copy.</li>
    <li>In Substack, start a new post and paste. Images are pulled in from the
        site automatically, so give it a few seconds.</li>
    <li>Set the title and subtitle from the panel below if they do not carry over.</li>
    <li>Under Settings, paste the canonical link so search engines credit your
        site as the original.</li>
  </ol>
</div>

<div class="meta">
  <b>Title</b><br>{title}<br><br>
  <b>Subtitle</b><br>{subtitle}<br><br>
  <b>Canonical URL</b><br>{canonical}
</div>

<h1>{title}</h1>
{body}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("posts", nargs="*", help="post file(s) under _posts/")
    ap.add_argument("--all", action="store_true", help="convert every post")
    a = ap.parse_args()

    targets = sorted((REPO / "_posts").glob("*.md")) if a.all else [Path(p) for p in a.posts]
    if not targets:
        sys.exit("Give a post path, or --all")
    for t in targets:
        convert(t)


if __name__ == "__main__":
    main()
