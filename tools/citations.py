#!/usr/bin/env python3
"""
Build the reading register: every study cited anywhere on the site, in one CSV.

    python3 tools/citations.py            # writes citations.csv, prints a summary
    python3 tools/citations.py --new      # only rows added since the last run

Where the rows come from

  Posts with a "## Sources" section are parsed automatically. That is the
  normal case and nothing needs doing by hand.

  Five early posts cite their studies inline in the prose and have no Sources
  section. Those are listed in INLINE below, with whatever the post actually
  names. Where the post does not give a full citation the field is left empty
  and the row is flagged "check" in the Status column, which is the honest
  state of the record rather than a gap to be filled by guessing.

Re-run this after publishing and the register rebuilds from scratch, so a new
post's sources appear without anyone remembering to add them.
"""

import argparse
import csv
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "citations.csv"

COLUMNS = [
    "Authors", "Year", "Title", "Journal", "Volume/pages", "Link",
    "Cited in", "Post date", "Pillar", "Post URL", "Times cited", "Status",
]

# Posts that cite inline, with no "## Sources" section. Only what the post
# itself names — empty fields mean the post did not give that detail.
# (post slug, authors, year, title, journal, locator, link)
INLINE = [
    ("2026-10-10-does-forgiveness-change-your-brain", [
        ("Akhtar S, Barlow J", "2016", "Forgiveness therapy for the promotion of mental well-being: a systematic review and meta-analysis", "Trauma, Violence, & Abuse", "", ""),
        ("Ricciardi E and colleagues", "2013", "", "Frontiers in Human Neuroscience", "", ""),
        ("Michl LC and colleagues", "2013", "", "Journal of Abnormal Psychology", "", ""),
        ("Levy-Gigi E, Shamay-Tsoory S", "2022", "", "PLOS ONE", "", ""),
        ("Enright RD, Fitzgibbons RP", "", "The process model of forgiveness (phases)", "", "", ""),
        ("McCullough ME and colleagues", "", "", "", "", ""),
    ]),
    ("2026-10-12-nasal-cycle-physiology", [
        ("Kahana-Zweig R and colleagues", "2016", "Measuring and characterizing the human nasal cycle", "PLOS ONE", "11(10):e0162918", "https://doi.org/10.1371/journal.pone.0162918"),
        ("Hanif J, Jawad SSM, Eccles R", "2000", "The nasal cycle in health and disease", "Clinical Otolaryngology", "", ""),
        ("Pendolino AL and colleagues", "2018", "The nasal cycle: a comprehensive review", "Rhinology Online", "1:67–76", "https://www.rhinologyonline.org/Rhinology_online_issues/manuscript_16.pdf"),
        ("Gainche L and colleagues", "2016", "", "Journal of Clinical Sleep Medicine", "", ""),
        ("Gilbert AN, Rosenwasser AM", "", "", "", "", ""),
        ("Gungor A and colleagues", "1999", "", "", "", ""),
        ("Heetderks DL", "1927", "", "American Journal of the Medical Sciences", "", ""),
        ("Stoksted P", "", "", "", "", ""),
        ("Hasegawa M, Kern EB", "", "", "", "", ""),
    ]),
    ("2026-10-12-shiva-svarodaya-what-holds-up", [
        ("Telles S and colleagues", "2017", "", "BMC Research Notes", "", ""),
        ("Frohlich J, Frohlich F, Sklerov M", "2025", "", "PLOS ONE", "", ""),
        ("Nielsen JA and colleagues", "2013", "", "PLOS ONE", "", ""),
        ("Cordi M and colleagues", "2014", "", "Current Biology", "", ""),
        ("Kahana-Zweig R and colleagues", "2016", "Measuring and characterizing the human nasal cycle", "PLOS ONE", "11(10):e0162918", "https://doi.org/10.1371/journal.pone.0162918"),
        ("Werntz DA, Bickford RG, Bloom FE, Shannahoff-Khalsa DS", "1983", "Alternating cerebral hemispheric activity and the lateralization of autonomic nervous function", "Human Neurobiology", "", ""),
        ("Zelano C and colleagues", "2016", "Nasal respiration entrains human limbic oscillations and modulates cognitive function", "Journal of Neuroscience", "", ""),
    ]),
    ("2026-10-12-what-shiva-swarodaya-claims", [
        ("Hanif J, Jawad SSM, Eccles R", "2000", "The nasal cycle in health and disease", "Clinical Otolaryngology", "", ""),
        ("Pendolino AL and colleagues", "2018", "The nasal cycle: a comprehensive review", "Rhinology Online", "1:67–76", "https://www.rhinologyonline.org/Rhinology_online_issues/manuscript_16.pdf"),
        ("Kahana-Zweig R and colleagues", "2016", "Measuring and characterizing the human nasal cycle", "PLOS ONE", "11(10):e0162918", "https://doi.org/10.1371/journal.pone.0162918"),
        ("Gilbert AN, Rosenwasser AM", "", "", "", "", ""),
    ]),
    ("2026-10-18-how-to-measure-meditation", [
        ("Singh D and colleagues", "2026", "", "Applied Psychophysiology and Biofeedback", "", ""),
        ("Folstein JR, Van Petten C", "2008", "Influence of cognitive control and mismatch on the N2 component of the ERP: a review", "Psychophysiology", "", ""),
        ("Van Dam NT and colleagues", "2018", "Mind the hype: a critical evaluation and prescriptive agenda for research on mindfulness and meditation", "Perspectives on Psychological Science", "", ""),
        ("Goyal M and colleagues", "2014", "Meditation programs for psychological stress and well-being: a systematic review and meta-analysis", "JAMA Internal Medicine", "", ""),
    ]),
]


def front_matter(text):
    parts = text.split("---", 2)
    meta = {}
    if len(parts) > 2:
        for line in parts[1].splitlines():
            if ":" in line and not line.startswith(" "):
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"')
        return meta, parts[2]
    return meta, text


def parse_entry(raw):
    """Pull structured fields out of one numbered source line."""
    link = ""
    m = re.search(r"\[[^\]]*\]\((https?://[^)]+)\)", raw)
    if m:
        link = m.group(1)
        raw = raw[: m.start()].strip()

    journal = ""
    m = re.search(r"\*([^*]+)\*", raw)
    if m:
        journal = m.group(1).strip()

    year = ""
    m = re.search(r"\((\d{4})\)", raw)
    if m:
        year = m.group(1)

    locator = ""
    m = re.search(r"\(\d{4}\)\s*,?\s*([0-9]+[^.]*)", raw)
    if m:
        locator = m.group(1).strip().rstrip(".")

    if not journal:
        # The earliest posts list sources as a bare title plus a PubMed link,
        # with no author string and no journal. Keep it as a title.
        title = re.sub(r"\s*\(\d{4}\)\s*\.?$", "", raw.strip()).rstrip(".")
        return "", year, title, "", locator, link

    head = raw.split("*")[0].strip()
    bits = [b.strip() for b in head.split(". ") if b.strip()]
    authors = bits[0] if bits else head
    title = ". ".join(bits[1:]).rstrip(".") if len(bits) > 1 else ""
    return authors, year, title, journal, locator, link


def key(authors, year, title):
    first = re.split(r"[ ,]", authors.strip())[0].lower()
    t = re.sub(r"[^a-z]", "", title.lower())[:28]
    return (first, year, t)


def collect():
    rows = []
    inline = dict(INLINE)

    for f in sorted(list((REPO / "_posts").glob("*.md")) + list((REPO / "_posts").glob("*.html"))):
        meta, body = front_matter(f.read_text(encoding="utf-8"))
        post = dict(
            cited_in=meta.get("title", f.stem),
            date=meta.get("date", "")[:10],
            pillar=meta.get("pillar", ""),
            url=meta.get("permalink", ""),
        )

        sec = re.search(r"^##+ *Sources *$(.*?)(?=^##+ |\Z)", body, re.S | re.M)
        if sec:
            items = re.findall(r"^\s*\d+\.\s+(.*?)(?=^\s*\d+\.\s|\Z)", sec.group(1), re.S | re.M)
            for raw in items:
                raw = " ".join(raw.split())
                if not raw:
                    continue
                entry = parse_entry(raw)
                authors, year, title, journal, *_ = entry
                ok = bool(authors and journal and year)
                rows.append((entry, post, "listed" if ok else "check"))
        elif f.stem in inline:
            for authors, year, title, journal, locator, link in inline[f.stem]:
                status = "listed" if (title and journal and year) else "check"
                rows.append(((authors, year, title, journal, locator, link), post, status))

    counts = {}
    for (a, y, t, *_), _, _ in rows:
        counts[key(a, y, t)] = counts.get(key(a, y, t), 0) + 1

    out = []
    for (a, y, t, j, loc, link), post, status in rows:
        out.append({
            "Authors": a, "Year": y, "Title": t, "Journal": j,
            "Volume/pages": loc, "Link": link,
            "Cited in": post["cited_in"], "Post date": post["date"],
            "Pillar": post["pillar"], "Post URL": post["url"],
            "Times cited": counts[key(a, y, t)], "Status": status,
        })
    out.sort(key=lambda r: (r["Post date"], r["Authors"].lower()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--new", action="store_true",
                    help="print only rows not already in citations.csv")
    args = ap.parse_args()

    rows = collect()

    if args.new and OUT.exists():
        with OUT.open(encoding="utf-8") as fh:
            seen = {(r["Authors"], r["Year"], r["Cited in"]) for r in csv.DictReader(fh)}
        fresh = [r for r in rows if (r["Authors"], r["Year"], r["Cited in"]) not in seen]
        print(f"{len(fresh)} new row(s)")
        for r in fresh:
            print(f"  {r['Authors']} ({r['Year']}) — {r['Journal']} — in: {r['Cited in']}")
        if not fresh:
            return

    with OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    unique = len({key(r["Authors"], r["Year"], r["Title"]) for r in rows})
    posts = len({r["Cited in"] for r in rows})
    needs = sum(1 for r in rows if r["Status"] == "check")
    print(f"{OUT.relative_to(REPO)}: {len(rows)} citations, "
          f"{unique} distinct studies, across {posts} posts. "
          f"{needs} row(s) flagged 'check' — cited inline without a full reference.")


if __name__ == "__main__":
    main()
