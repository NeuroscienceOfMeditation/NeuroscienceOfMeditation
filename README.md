# Neuroscience of Meditation

Source for [neuroscienceofmeditation.in](https://neuroscienceofmeditation.in): evidence-checked yoga, breathwork and meditation.

## The Quiet Mind: a free film course (in preparation)

Six short, evidence-checked films on what meditation, breathing and sleep do to the brain. They are being re-released on YouTube with voiceover first; the course pages on the website will embed those YouTube videos and go live afterwards.

| # | Lesson | Length |
|---|---|---|
| 1 | Mindfulness Is About Your Life | 1 min |
| 2 | Where Is Your Mind Right Now? | 1 min |
| 3 | The Network That Never Rests | 3 min |
| 4 | Your Heart Slows When You Breathe Out | 1 min |
| 5 | Your Breath Is a Door | 3 min |
| 6 | Sleep Is How You Begin Again | 1 min |

### Editing the course

- Words, sources, practices, transcripts and each lesson's YouTube ID: `_data/free_course.yml`
- Lesson page design: `_layouts/film-lesson.html`
- Course home page: `free-course.html`
- Poster images: `films/` (named after each lesson's slug)
- To put the course live: delete `published: false` from `free-course.html` and the pages in `free-course/`, and add it back to `_data/catalog.yml`.
