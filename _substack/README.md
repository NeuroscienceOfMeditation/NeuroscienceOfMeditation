# Substack

Files here are the website's articles, converted into something you can paste
straight into Substack. Anything in a folder starting with `_` stays off the
site, so nothing in here is public.

## Why this is a paste and not a button

Substack has no public API for creating posts. There is no official way for a
script to publish on your behalf — the only sanctioned routes in are the editor
and a one-time RSS import. Services that claim to post automatically either
charge for an unofficial workaround or drive a logged-in browser, and both can
break without warning or fall foul of Substack's terms.

So the job here is to remove every fiddly part of pasting instead. It takes
about a minute.

## Posting an article

1. Open the `.html` file for the article in this folder, in a browser. (On
   GitHub, click the file, then **Raw**, then save it and double-click it; or
   just open the file from your computer if you have the repo cloned.)
2. Click anywhere in the page, select everything from the title downwards
   (`Ctrl` + `A`), and copy.
3. In Substack, start a new post and paste. Give it a few seconds: the images
   are pulled in from neuroscienceofmeditation.in automatically.
4. Set the title and subtitle. They are printed in the panel at the top of the
   file so you can copy them.
5. Open **Settings** on the Substack post and paste the **canonical URL**, also
   in that panel. This tells Google your site published it first, so the
   Substack copy does not compete with your own page in search results.

That last step matters more than it sounds. Without it, two identical articles
on two domains compete with each other, and Substack usually wins because it is
the bigger site.

## What the conversion changes, and why

| On the site | On Substack | Reason |
|---|---|---|
| Inline SVG charts | PNG images | Substack strips inline SVG, so the charts would vanish |
| The questionnaire embed | A link | Substack strips iframes and scripts |
| `/img/photo.webp` | the full `https://…` URL | Substack can only fetch an image it has a complete address for |

Everything else — headings, tables, bold, links, block quotes — pastes across
intact.

## Making the file for a new article

The weekly task does this for you. To do it by hand:

```
python3 tools/substack-export.py _posts/2026-10-10-my-article.md
```

Or convert every article at once with `--all`. It needs Python with the
`markdown` and `playwright` packages.

## Backfilling the older articles

Substack can import an existing blog from its RSS feed when you set a
publication up. Yours is at **neuroscienceofmeditation.in/feed.xml**. In
Substack, look under **Settings → Import**. It is a one-time bulk copy, not an
ongoing sync, so it is useful for getting the first few articles across in one
go and no use afterwards.

Check what it produced before publishing. An RSS import usually brings the text
and loses the finer formatting.
