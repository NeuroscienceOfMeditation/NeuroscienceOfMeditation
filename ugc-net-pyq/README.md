# UGC NET PYQ Analytics: Yoga (100) and Indian Knowledge System (103)

A static web app for UGC NET Paper II practice. You can host it free on GitHub Pages: there is no server, no database and no login. Anyone with the link can open it and start practising.

- **Syllabus-mapped questions.** Every question carries its `macro_unit` (syllabus unit) and `micro_topic`, shown as tags above the question.
- **All NTA formats.** Single answer, Match List I with List II, Assertion–Reason, multiple statements and sequence questions.
- **Feedback.** After you answer: correct or incorrect, a detailed explanation, and a highlighted **Trend Insight** box. The box has two parts: a frequency line the app counts from the dated papers loaded, and the written `trend_analysis` on what the examiner focuses on.
- **Filters.** Subject, exam year or session, syllabus unit, micro-topic, question format, attempt status and a search box that ignores diacritics ("klesha" finds "kleśa").
- **Review mistakes (spaced repetition).** Wrong answers go into a mistake book. A review loop repeats anything you miss until you get every question right, then spaces the next checks 1, 3 and 7 days apart.
- **Analytics.** Unit weightage, a unit × session trend grid, your accuracy by unit, and micro-topic frequency.
- **Shareable links.** The address bar keeps the current view, filters and question, so you can send someone a link to a single question.

Progress is stored in the visitor's own browser (`localStorage`). *Export progress* and *Import* in the sidebar move it between devices.

---

## What is in the data right now

`data/` ships with **4 sample questions**: 2 Yoga, 2 IKS, one in each NTA format. They are **PYQ-pattern model questions**. They are written to the NTA formats and checked against the primary texts, but **they are not reproductions of a specific paper**. They carry no exam year, and the app never counts them as exam appearances.

Their `trend_analysis` text describes how each micro-topic is framed and what to watch for. It deliberately makes no claims like "asked 7 times since 2019", because those counts can only come from the real papers. When you add official papers (December 2018 to June 2026) with `exam_year` and `exam_cycle`, the frequency line in every Trend Insight box, the year filter and the Analytics trend grid fill in automatically and exactly.

Unit titles in `data/syllabus.json` follow the NTA syllabi as published by exam portals. Check them against the official PDFs at [ugcnet.nta.ac.in](https://ugcnet.nta.ac.in) before you rely on the exact wording.

---

## Files

```
ugc-net-pyq/
├── index.html              the page
├── assets/app.css          compiled Tailwind CSS (committed, so no build step is needed to publish)
├── assets/favicon.svg
├── data/
│   ├── syllabus.json       subjects, codes, the 10 units of each, and which question files to load
│   ├── yoga.json           Yoga questions
│   └── iks.json            IKS questions
├── js/
│   ├── app.js              state, events, rendering
│   ├── data.js             loads and checks the question files
│   ├── filters.js          sidebar filter logic
│   ├── srs.js              spaced-repetition scheduling and the review loop
│   ├── analytics.js        counts behind Analytics and the Trend Insight frequency line
│   ├── store.js            localStorage (progress, preferences, theme)
│   ├── util.js
│   └── views/              HTML for the sidebar, question card, practice, review, analytics
├── src/input.css           Tailwind source and colour tokens (light and dark)
├── tailwind.config.js
├── tests/logic.test.js     tests for the data check, filters, analytics and spaced repetition
└── package.json            only needed to rebuild the CSS or run the tests
```

---

## Adding questions

Open `data/yoga.json` or `data/iks.json` and add an object to the list. This is a complete example of an official paper question:

```json
{
  "id": "YOGA-2025J-042",
  "subject": "yoga",
  "exam_year": 2025,
  "exam_cycle": "June",
  "source": { "type": "official", "note": "Paper date, shift and question number go here" },
  "question_type": "mcq",
  "question_text": "According to Yoga Sūtra 2.4, which of the following is NOT a state of the kleśas?",
  "options": ["Prasupta", "Tanu", "Kṣipta", "Udāra"],
  "correct_answer": 3,
  "detailed_explanation": "**Answer: (3) Kṣipta.**\n\nYS 2.4 names four states: prasupta, tanu, vicchinna and udāra. Kṣipta is one of the five citta-bhūmis.",
  "macro_unit": "Yoga Unit 4: Patanjala Yoga Sutra",
  "micro_topic": "Kleshas and their removal",
  "trend_analysis": "**Frequency.** …\n\n**What the examiner targets.**\n- …\n- …",
  "references": ["Yoga Sūtra 2.4 with Vyāsa's bhāṣya"]
}
```

The id, session and note in that example only show the format. Use the real ones from your paper.

### Fields

| Field | Required | What it holds |
|---|---|---|
| `id` | yes | Unique and permanent. Progress is saved against it, so never renumber. Suggested form: `YOGA-2025J-042` (subject, year, J/D, question number). |
| `subject` | yes | `yoga` or `iks` (the `id`s in `syllabus.json`). |
| `exam_year`, `exam_cycle` | for real PYQs | e.g. `2025` and `"June"` or `"December"`. Use `null` for both on a model question. |
| `source.type` | recommended | `official` (from the NTA paper), `memory_based` (reconstructed by candidates) or `model` (PYQ-pattern, undated). Defaults to `official` when a year is given, otherwise `model`. `source.note` appears on hover. |
| `question_type` | recommended | `mcq`, `match`, `assertion_reason`, `statements` or `sequence`. Defaults to `mcq`. |
| `question_text` | yes | The question stem. |
| `lists` | for `match` | `{ "list_i": { "title": "List I", "items": [...] }, "list_ii": { "title": "List II", "items": [...] } }`. Items are labelled A, B, C… and I, II, III… automatically. |
| `items` | for `statements` and `sequence` | The statements or items, labelled A, B, C… automatically. |
| `assertion`, `reason` | for `assertion_reason` | The two statements. |
| `prompt` | no | The line before the options, e.g. "Choose the correct answer from the options given below:". |
| `options` | yes | The answer texts, in the paper's order. Displayed as (1), (2), (3), (4). |
| `correct_answer` | yes | The **number** of the correct option, 1 to 4 (as in NTA answer keys). |
| `detailed_explanation` | yes | Shown after answering. |
| `macro_unit` | yes | Must match a unit label exactly (list below). |
| `micro_topic` | yes | The exact sub-topic. Spell it the same way every time, because the frequency counts group by this text. |
| `trend_analysis` | yes | Shown in the Trend Insight box. |
| `references` | no | Sources, shown under the explanation. |

**Formatting inside text fields:** a blank line (`\n\n`) starts a new paragraph, a line starting with `- ` is a bullet, and `**text**` is bold. Nothing else is interpreted; HTML is shown as plain text.

### Valid `macro_unit` labels

**Yoga (100)**

- `Yoga Unit 1: Fundamentals of Yoga`
- `Yoga Unit 2: Yoga Texts I: Principal Upanishads, Bhagavad Gita and Yoga Vasishtha`
- `Yoga Unit 3: Yoga Texts II: Yoga Upanishads`
- `Yoga Unit 4: Patanjala Yoga Sutra`
- `Yoga Unit 5: Hatha Yoga Texts`
- `Yoga Unit 6: Allied Sciences: Psychology, Human Biology, Diet and Nutrition`
- `Yoga Unit 7: Yoga and Health`
- `Yoga Unit 8: Therapeutic Yoga`
- `Yoga Unit 9: Applications of Yoga`
- `Yoga Unit 10: Practical Yoga: Shatkarma, Asana, Pranayama, Mudra, Bandha, Dhyana`

**Indian Knowledge System (103)**

- `IKS Unit 1: Indian Philosophical Systems (Part A)`
- `IKS Unit 2: Indian Philosophical Systems (Part B)`
- `IKS Unit 3: Astronomy`
- `IKS Unit 4: Health and Well-being`
- `IKS Unit 5: Architecture`
- `IKS Unit 6: Mathematics`
- `IKS Unit 7: Chemistry and Metallurgy`
- `IKS Unit 8: Life Sciences, Agriculture and Ecology`
- `IKS Unit 9: Kala (Arts)`
- `IKS Unit 10: Ancient India and World History`

A label is built as `<short> Unit <no>: <title>` from `syllabus.json`. If you correct a unit title there, update the matching `macro_unit` values too.

### The data check

Every question is checked when the page loads. A question with a problem (a missing field, `correct_answer` out of range, a `macro_unit` that isn't in the syllabus, a duplicate `id`, and so on) is skipped. The sidebar then shows **"N questions skipped by the data check"**, with the reason for each. If a whole file has a syntax error (usually a missing comma), the page says which file.

To split a subject over several files (say one per year), list them in `question_files` in `syllabus.json`:
`"question_files": ["yoga-2019-2022.json", "yoga-2023-2026.json"]`.

---

## How the spaced repetition works

1. A wrong answer anywhere puts the question in the mistake book, due at once.
2. **Review mistakes** runs a loop over the due questions. A question you miss comes back after three others (sooner if fewer are left). The loop ends only when every question in it has been answered correctly: 100%.
3. Each correct review pushes the next check further out, to 1, then 3, then 7 days (counted from midnight). Clear the 7-day check and the question retires.
4. Missing a question at any stage sends it back to the start.

"Review all now" ignores the schedule, which is useful the week before the exam. Review uses the sidebar's subject, year, unit and topic filters, and says so if filters are hiding some of your mistakes.

---

## Try it on your computer

The page loads its data with `fetch`, which browsers block for files opened straight from disk. Serve the folder instead:

```bash
cd ugc-net-pyq
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Publish on GitHub Pages

### If this folder stays in the neuroscienceofmeditation repository

This repository is already published by GitHub Pages at `neuroscienceofmeditation.in`. Once the branch holding this folder is merged into `main`, the dashboard is live at:

**https://neuroscienceofmeditation.in/ugc-net-pyq/**

`_config.yml` keeps the README, the Tailwind sources and the tests out of the published site.

### As its own repository (no command line)

1. Sign in at [github.com](https://github.com), select **+** (top right), then **New repository**. Name it, e.g. `ugc-net-pyq`, set it to **Public**, and select **Create repository**.
2. On the new repository's page, select **uploading an existing file**. Drag in **the contents of this folder**: `index.html`, `assets`, `data`, `js` (and optionally `src`, `tests`, `README.md`, `package.json`, `tailwind.config.js`). Do not upload `node_modules`. Select **Commit changes**.
3. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to **main** and the folder to **/ (root)**, then select **Save**.
4. After a minute or two, the Pages settings show the address: `https://<your-username>.github.io/ugc-net-pyq/`. Share that link.

### As its own repository (with git)

```bash
cp -r ugc-net-pyq ~/ugc-net-pyq && cd ~/ugc-net-pyq
git init -b main
git add .
git commit -m "UGC NET PYQ dashboard"
git remote add origin https://github.com/<your-username>/ugc-net-pyq.git
git push -u origin main
```

Then do step 3 above. `.gitignore` already excludes `node_modules`, and `.nojekyll` tells GitHub Pages to serve the files as they are.

### Updating

Edit a file in `data/` on github.com (the pencil icon), then commit. The site updates within a minute or two. Visitors keep their progress, as long as question `id`s don't change.

---

## Changing the design

The styles are Tailwind CSS compiled into `assets/app.css`. You only need to rebuild after changing classes in `index.html` or `js/`, never for data changes:

```bash
npm install          # once
npm run build:css    # or: npm run watch:css while editing
npm test             # checks the data files and the app logic
```

Colours are CSS variables at the top of `src/input.css`, with separate light and dark values. The Theme button cycles through system, light and dark.
