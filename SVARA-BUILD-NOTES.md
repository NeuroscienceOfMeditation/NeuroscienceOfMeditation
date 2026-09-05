# Swar Yoga tool — build notes

Eight files go in the repo root next to `style.css`. `swar-yoga.html` replaces
yours; the rest are new.

| File | Size | Loaded |
|---|---|---|
| `swar-yoga.html` | 32 KB | replaces yours |
| `svara-tool.css` | 26 KB | on page load |
| `svara-engine.js` | 44 KB | on page load |
| `svara-knowledge.js` | 33 KB | on page load |
| `svara-voice.js` | 8 KB | on page load |
| `svara-ui.js` | 52 KB | on page load |
| `svara-corpus.js` | 209 KB | **lazily**, on the first question only |

Script order matters: engine → knowledge → voice → ui. The corpus is not in a
`<script src>` tag; it is injected on the first search so the page stays light
for people who never open the Ask tab.

---

## Ask the text

**One answer, not a pile of passages.** A direct 2–3 sentence answer in plain
prose, a quiet source line under it, an optional "What to actually do" box when
the practical section adds something the answer didn't already say, the verse
itself behind a collapsible, and the evidence grades at the bottom rather than
before you've read anything. Three related passages sit below, collapsed to one
line each.

Retrieval is BM25 over 60 sections with transliteration folding (so "sushumna"
reaches *suṣumnā*) and a curated concept map routing how people ask to where the
answer lives. Answers are quoted from your commentary, never generated.

Four things were wrong in the first version and are worth recording so they
don't creep back:

- **The introduction was never indexed.** Extraction only matched `## Verse N —`
  headings, so the ten front-matter and introduction sections — the ones that
  actually define what Svara Yoga *is* — were absent from the corpus entirely.
  That is why "what is swara yoga?" returned "What the Unstable State Is For".
  All ten are now indexed, and definitional questions route to them.
- **Sentences were selected by score, wherever they fell**, which tore fragments
  out of lists: "Two applications, one strong and one methodological. Learning."
  Selection now takes a contiguous run of sentences, requires each to stand on
  its own, and drops announcements like "Three protocols follow:".
- **Concept bonuses stacked.** A section listed under several concepts collected
  all of them, so verse 50 outranked verse 40 on "is breath retention safe" by
  matching two unrelated routes. Bonuses are capped, "breath" was removed as a
  routing term for being in nearly every section, and verse 50 was removed from
  the retention route where its safety content is incidental.
- **Grade markers leaked into prose** as literal `[E]` and `[S]` mid-sentence.
  They are stripped from text and shown only as badges.

---

## Spoken guidance

Uses the browser's built-in `speechSynthesis`. No API key, no audio files to
host, no network request — it works on a static site and offline once the page
has loaded.

**Where it speaks.** Observation cues as they change; the verdict when the
assessment renders ("You observed Ida. The rule expected Pingala. They
disagree."); each correction method when you select it, and its steps when you
press start; halfway and fifteen-second marks on longer timers; the pacer cues
on ujjayi and humming; and the completion line, which always tells you to check
which side is flowing before deciding it worked.

**The walkthrough.** "Talk me through the measurements" on the Tattva tab steps
through all seven dimensions one at a time, speaks each instruction, highlights
and scrolls to the matching field, and reads the ṣaṇmukhī eye-pressure warning
aloud when it reaches that one. Back / Say it again / Next, and it runs the
reading automatically at the end. It turns spoken guidance on for you if it is
off, since that is plainly what the button means.

**Off by default**, with the setting remembered per browser. The bar hides
itself completely on browsers with no speech support, and every flow works
silently — verified against a build with `speechSynthesis` removed entirely.

**Web Speech API quirks handled** in `svara-voice.js`, since all three will
otherwise bite you in production:
- `getVoices()` returns empty on first call in Chrome and fills in later, so the
  picker populates from the `voiceschanged` event.
- iOS Safari will not speak at all unless the first utterance came from a user
  gesture, so `prime()` fires from the toggle tap.
- Chrome goes silent partway through longer utterances without a periodic
  `pause()`/`resume()` ping, which runs only while speech is active.
- Utterances queue by default, which is wrong for a breathing pacer — a late
  "in" must not stack behind a stale one — so `say()` interrupts by default and
  the pacer stays silent for the first twelve seconds while the steps are read.

Text is normalised before speaking: em dashes become pauses, `[E, negative]`
grade markers are stripped, and IAST diacritics are folded so voices don't
stumble on *ṣaṇmukhī* or *haṃsa*. Speech stops on tab switch, on closing a
runner, and when the browser tab goes to the background.

---

## The four tabs

**Svara.** Camera guidance, a settling period, self-report, then the assessment.
Sunrise and lunar day are computed in-browser; the expected channel comes from
verse 65 and the tattva from verses 71–72. If observation and expectation
disagree, the correction step offers the four reversal methods of verses 66–67
and 50, each with its own grade, and then sends you back to observe again.

**Tattva.** The eightfold scheme of verses 145–147, split into four dimensions
you can measure and three you can only report. **Only the measured ones score.**
The reported ones are recorded and shown in the support list marked "not
scored". This is the source's own instruction — it warns that mixing verifiable
and unverifiable items into one composite lets the good items lend credibility
to the bad, and that the correct treatment is to disaggregate.

The measurable four:
- **Reach of the exhalation** (v158) — back of the hand, moved away until the
  breath is no longer felt, in finger-breadths. The only quantitative protocol
  in the entire treatise, and effectively a crude peak-expiratory-flow reading.
- **Direction of the jet** (v155) — centre, down, up, oblique.
- **Which side is open** (v153) — the mirror test.
- **Junctures of the breath** (v146) — rate and pause length, countable.

The reported three — taste (v157), body location (v156), colour under ṣaṇmukhī
(v151–152) — are captured but never allowed to decide the answer.

**Practice.** Ten practices, all from the text, filterable by what you want:
settle, cool, warm, switch sides, observe. Each carries its verse, its grade, its
steps, and a timer. Ujjayi and humming get a pacer because the text supports
lengthened exhalation; the rest run at natural rate with the circle as a timer
only, because verse 50's own instruction is "at a natural rate".

**Ask the text.** BM25 retrieval over all 51 commentary sections, with
transliteration folding (so "sushumna" reaches *suṣumnā*) and a curated concept
map so intent questions land on the right verse. Answers are passages from the
book with verse number and grade attached. Nothing is generated. If nothing
matches, it says so rather than inventing.

---

## Why there is no AI-generated answering

A generative Q&A needs an API key, and a key in client-side JavaScript on a
static GitHub Pages site is a key you have published. The retrieval approach
needs no key, no server, no per-query cost, and cannot hallucinate — every
sentence shown is one you can find in your own document. If you later want
generated answers, that requires a small serverless proxy (Cloudflare Worker or
Netlify Function) holding the key, and the corpus file already there becomes the
retrieval layer feeding it.

---

## What the tool refuses to do, and why

**Verse 64's abstention rule is never applied.** The text says that when
observation contradicts expectation you should refrain from acting. That rule is
unfalsifiable by construction: contrary observation is reinterpreted as an
inauspicious condition rather than as evidence against the scheme, and outcomes
are only tested when conditions are favourable, which censors the sample. It is
shown in the result panel, labelled, and never acted on.

**Verses 69–70 and 73–74 do not drive anything.** The weekday and zodiac
assignments are graded E-negative — the source states plainly that nothing in
them should be applied. They are displayed with the reason.

**No breath retention.** The source is direct that forceful retention with
abdominal or pelvic pressure reproduces Valsalva haemodynamics, that adverse
events are not rare enough to ignore, and that supervision was sound risk
management rather than gatekeeping. A web page is not supervision, so retention
practices are named and not taught. Ṣaṇmukhī is included but with the eyeball
pressure removed and its contraindications stated.

**No shape-reading from the mirror.** Comparing the two condensation patches for
size is graded E. Reading an element from the shape of the patch is graded X —
square, crescent, triangle and circle are yantra forms imported from
iconography, and a condensation patch is exactly the ambiguous stimulus where
expectation writes the answer.

---

## The one thing to decide before launch

**Verse 65 is graded E-negative, and it is the only rule that predicts a channel
from a date.** So the entire expected-svara calculation rests on a claim the
source says the evidence contradicts. This is not a flaw in the build; it is the
finding, and it lines up exactly with what your page already promises — that
you'll publish what the record shows, including where it disagrees with the
texts.

The tool handles it with a single compact line above the comparison, and the
full reasoning inside the "Why am I seeing this?" panel rather than plastered
across the page. If you would rather it read differently, that one string is in
`svara-ui.js`, in `renderResult`, under the comment "one compact line".

## The period is unresolved and it matters

The recension gives three different figures and reconciles none: 60 minutes
(v72, five phases in two and a half ghaṭikās), 150 minutes (v72 read the other
way, which other passages do), and 120 minutes (v73–74, twelve transits per day
and night). All three are in the dropdown with their verse and grade. **They
give different answers** — on the test date, 60 and 120 minutes report
misaligned while 150 reports aligned. Default is 60; 120 is closest to the
measured nasal cycle, which the source notes runs two to four hours with large
variance.

## Astronomy

Sunrise uses the full NOAA algorithm, verified within a minute against Delhi,
London at solstice and New York in December; polar day and night return null and
are handled. Tithi uses an abbreviated lunar series checked against known
syzygies — the 18 Jan 2026 new moon computes to 359.99° elongation, the 3 Mar
full moon to 180.00°. Within about 20 minutes of a tithi boundary the result
carries a caution that the lunar day may be off by one. The svarodaya day is
counted from sunrise, so an observation at 03:00 correctly belongs to the
previous day's cycle.
