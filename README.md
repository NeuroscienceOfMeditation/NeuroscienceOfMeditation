# Neuroscience of Meditation

Source for [neuroscienceofmeditation.in](https://neuroscienceofmeditation.in): evidence-checked yoga, breathwork and meditation.

## The Quiet Mind: a free film course

Short, evidence-checked films on what meditation, breathing and sleep do to the brain. Free with an email sign-up, which also subscribes people to the articles newsletter (Kit). All six films are on YouTube and in the course.

**Course page:** [neuroscienceofmeditation.in/free-course.html](https://neuroscienceofmeditation.in/free-course.html)

| # | Lesson | Length | YouTube |
|---|---|---|---|
| 1 | Mindfulness Is About Your Life | 1 min | [watch](https://youtu.be/mxqL16ifcoM) |
| 2 | Where Is Your Mind Right Now? | 1 min | [watch](https://youtu.be/tyCX-OuXxDM) |
| 3 | The Network That Never Rests | 3 min | [watch](https://youtu.be/MmfngOMQYNk) |
| 4 | Your Heart Slows When You Breathe Out | 1 min | [watch](https://youtu.be/jUO3wI35WPI) |
| 5 | Your Breath Is a Door | 3 min | [watch](https://youtu.be/sWvsucvu8yQ) |
| 6 | Sleep Is How You Begin Again | 1 min | [watch](https://youtu.be/yfMOEK7Hjww) |

### Editing the course

- Words, sources, practices, transcripts and each lesson's YouTube ID: `_data/free_course.yml`
- To release a lesson: paste its YouTube ID into `youtube:` in that file, and delete `published: false` from its page in `free-course/`
- Email sign-up box: `_includes/course-signup.html` (Kit form 9927031, the newsletter list)
- Lesson page design: `_layouts/film-lesson.html`; course home page: `free-course.html`
- Poster images: `films/` (named after each lesson's slug)
