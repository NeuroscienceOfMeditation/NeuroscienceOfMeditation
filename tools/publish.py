#!/usr/bin/env python3
"""
The Publish button: push one article everywhere it can go.

    python3 tools/publish.py                     # latest post in _posts/
    python3 tools/publish.py --draft my-article  # publish that draft first
    python3 tools/publish.py --send-newsletter   # send instead of drafting

What each destination can and cannot do, honestly:

  Website      Fully automatic. Moving a file into _posts/ publishes it.
  Newsletter   Fully automatic through Kit's API, but created as a DRAFT by
               default. An email cannot be unsent, so a one-click button that
               mails your whole list with no preview is a bad idea. Pass
               --send-newsletter when you have read it and mean it.
  Substack     No public API exists for creating posts. The button prepares a
               paste-ready file; putting it up is about a minute of your time.
  Instagram    Publishing through the API needs a Business account, a linked
               Facebook Page, a Meta developer app and App Review. Until that
               exists, the button writes the caption and names the image.

Nothing here fails the whole run because one destination is not set up. Each
step reports what it did and the summary tells you what is left to do by hand.
"""

import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import substack_export as sx                                   # noqa: E402

REPO = Path(__file__).resolve().parent.parent
POSTS, DRAFTS = REPO / "_posts", REPO / "_drafts"
SOCIAL = REPO / "_social"
KIT_BASE = os.environ.get("KIT_API_BASE", "https://api.convertkit.com/v3")
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))

steps = []          # (destination, status, detail) for the final summary


def note(dest, status, detail):
    steps.append((dest, status, detail))
    mark = {"done": "OK  ", "todo": "TODO", "skip": "--  ", "fail": "FAIL"}[status]
    print(f"{mark} {dest}: {detail}")


# ------------------------------------------------------------------ website

def publish_draft(name):
    """Move a draft into _posts with today's date, so Jekyll builds it."""
    src = DRAFTS / (name if name.endswith(".md") else name + ".md")
    if not src.exists():
        sys.exit(f"No such draft: {src.relative_to(REPO)}")

    now = dt.datetime.now(IST)
    slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", src.stem)
    dest = POSTS / f"{now:%Y-%m-%d}-{slug}.md"

    text = src.read_text(encoding="utf-8")
    # Jekyll silently skips future-dated posts, so stamp the real time now.
    if re.search(r"^date:", text, re.M):
        text = re.sub(r"^date:.*$", f"date: {now:%Y-%m-%d %H:%M:%S %z}", text,
                      count=1, flags=re.M)
    dest.write_text(text, encoding="utf-8")
    src.unlink()
    note("Website", "done", f"published {dest.relative_to(REPO)}")
    return dest


def latest_post():
    posts = sorted(POSTS.glob("*.md"))
    if not posts:
        sys.exit("No posts found in _posts/")
    return posts[-1]


# ------------------------------------------------------------------ newsletter

def kit_broadcast(a, send=False):
    secret = os.environ.get("KIT_API_SECRET", "").strip()
    if not secret:
        note("Newsletter", "skip",
             "no KIT_API_SECRET set, so nothing was sent to Kit")
        return

    body = (
        f'<p>{a["subtitle"]}</p>\n{a["body_html"]}\n'
        f'<hr>\n<p><a href="{a["canonical"]}">Read it on the site</a></p>'
    )
    payload = {
        "api_secret": secret,
        "subject": a["title"],
        "description": a["subtitle"][:150],
        "content": body,
        "public": False,
    }
    if send:
        # A minute ahead, so a mistake can still be cancelled in Kit.
        payload["send_at"] = (
            dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=10)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

    req = urllib.request.Request(
        f"{KIT_BASE}/broadcasts",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            out = json.loads(r.read().decode())
        bid = (out.get("broadcast") or {}).get("id", "?")
        if send:
            note("Newsletter", "done",
                 f"broadcast {bid} scheduled to send in 10 minutes "
                 f"(cancel it in Kit if that was a mistake)")
        else:
            note("Newsletter", "todo",
                 f"draft broadcast {bid} created in Kit. Read it, then press "
                 f"Send there")
    except urllib.error.HTTPError as e:
        note("Newsletter", "fail",
             f"Kit refused the request ({e.code}). {e.read()[:200].decode(errors='replace')}")
    except Exception as e:                                     # noqa: BLE001
        note("Newsletter", "fail", f"could not reach Kit: {e}")


# ------------------------------------------------------------------ substack

def substack(a):
    try:
        out = sx.write(a)
        note("Substack", "todo",
             f"paste-ready file at {out.relative_to(REPO)} "
             f"(steps in _substack/README.md, about a minute)")
    except Exception as e:                                     # noqa: BLE001
        note("Substack", "fail", f"export failed: {e}")


# ------------------------------------------------------------------ instagram

def instagram(a):
    """
    Write the caption and name the image. Publishing through the API needs
    Meta App Review, so this stops short of posting on purpose.
    """
    SOCIAL.mkdir(exist_ok=True)
    hook = a["takeaway"] or a["subtitle"]
    caption = (
        f'{a["title"]}\n\n'
        f"{hook}\n\n"
        f"The full article is on the site — link in bio.\n\n"
        f"#yoga #meditation #neuroscience #breathwork #evidencebased "
        f"#yogaphilosophy #mindfulness"
    )[:2200]

    f = SOCIAL / f"{a['path'].stem}-instagram.txt"
    f.write_text(
        caption
        + "\n\n---\nImage: "
        + (a["image"] or "none set in the post's front matter")
        + f"\nArticle: {a['canonical']}\n",
        encoding="utf-8",
    )
    note("Instagram", "todo",
         f"caption written to {f.relative_to(REPO)} — post it by hand "
         f"(API publishing needs Meta App Review)")


# ------------------------------------------------------------------ summary

def summary(a):
    lines = [
        f"## {a['title']}", "",
        f"**Live:** {a['canonical']}", "",
        "| Where | Status | What happened |", "|---|---|---|",
    ]
    label = {"done": "Done", "todo": "Needs you", "skip": "Skipped", "fail": "Failed"}
    for dest, status, detail in steps:
        lines.append(f"| {dest} | {label[status]} | {detail} |")

    left = [s for s in steps if s[1] in ("todo", "fail")]
    if left:
        lines += ["", "### Still to do", ""]
        lines += [f"- **{d}** — {x}" for d, s, x in left]

    text = "\n".join(lines) + "\n"
    print("\n" + text)

    # GitHub shows this on the workflow run page.
    gh = os.environ.get("GITHUB_STEP_SUMMARY")
    if gh:
        Path(gh).write_text(text, encoding="utf-8")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--draft", help="name of a file in _drafts/ to publish first")
    p.add_argument("--post", help="a specific file in _posts/ to push out")
    p.add_argument("--send-newsletter", action="store_true",
                   help="schedule the Kit email instead of leaving it a draft")
    p.add_argument("--skip-newsletter", action="store_true")
    p.add_argument("--skip-substack", action="store_true")
    p.add_argument("--skip-instagram", action="store_true")
    args = p.parse_args()

    if args.draft:
        post = publish_draft(args.draft)
    elif args.post:
        post = Path(args.post)
        if not post.is_absolute():
            post = REPO / post
        note("Website", "done", f"using existing post {post.name}")
    else:
        post = latest_post()
        note("Website", "done", f"using latest post {post.name}")

    # Build once: the figures are rendered and the markdown converted a single
    # time, then reused by both the Substack file and the newsletter.
    a = sx.build(post)

    if not args.skip_substack:
        substack(a)
    if not args.skip_newsletter:
        kit_broadcast(a, send=args.send_newsletter)
    if not args.skip_instagram:
        instagram(a)

    summary(a)
    if any(s[1] == "fail" for s in steps):
        sys.exit(1)


if __name__ == "__main__":
    main()
