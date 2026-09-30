# Drafts

Files in this folder are never published. Make.com puts new blog drafts here.

To publish a draft:
1. Open the draft file on GitHub and click the pencil (Edit) icon.
2. Change the file path at the top from `_drafts/my-post.md` to `_posts/YYYY-MM-DD-my-post.md` (use today's date).
3. Click "Commit changes". The post goes live in 1-2 minutes and appears on Words of Yoga automatically.
4. Email it to the newsletter: see `_newsletter/README.md` for the steps and a ready-made email to copy.

## Optional settings at the top of a post

Between the two `---` lines of a post you can add:

- `description:` one or two sentences. Shown under the title, in the article list, and in link previews on WhatsApp and search results.
- `pillar:` the small label above the title, e.g. `Claim check`, `Reflection`.
- `sources:` the number of studies cited. Only posts with this show the "How this article was checked" note.
- `image:` a picture for link previews, e.g. `/img/og-default.jpg`. A 1200×630 JPG looks best. Without it, the site's default preview card is used.
- `takeaway:` one sentence shown in a "The short version" box above the article, e.g. `takeaway: "The practice seems to calm you, but brain balancing is the weakest part of the story."`
- `cover:` the small drawing shown for the post in lists: `wave`, `ripple`, `book`, `breath`, `cycle` or `light`. Leave it out and it follows the pillar (Claim check gets `wave`, Reflection `ripple`, Reading `book`, Swar Yoga `breath`, Research `cycle`, Philosophy `light`).

## Aṇūṭṭara issues

Each issue lives in its own folder: `_anuttara/issue-01/`, `_anuttara/issue-02/` and so on.

- `index.md` is the issue's contents page (title, description, the words on the cover).
- Every other `.md` file is one piece. `order:` sets its place in the issue (1, 2, 3 …), `section:` is the small label above the title (Editor's letter, Swara, Research notes, Essay, Practice), and `sources:` (optional) shows "N studies cited".
- Write in Markdown, like the blog posts. A Sanskrit verse can go in a box like this:

      <div class="verse">
        <p class="dev" lang="sa">Devanagari here</p>
        <p class="iast" lang="sa-Latn">transliteration here</p>
        <p class="tr">Translation here. <span class="ref">— Verse 149</span></p>
      </div>

**Drafts stay off the site.** A file with `published: false` is not built. When the whole issue is ready, change it to `published: true` in every file in the folder (including `index.md`). The Aṇūṭṭara page then switches from "in preparation" to "Read Issue 01" on its own.

To start the next issue, copy the `issue-01` folder, rename it `issue-02`, change `issue: 1` to `issue: 2` in each file, and replace the pieces.
