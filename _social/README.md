# Social posts

The Publish button writes an Instagram caption here for each article. Files in
a folder starting with `_` stay off the website.

## Why Instagram is not automatic

Posting to Instagram through its API needs all of this:

1. An Instagram **Business or Creator** account. Personal accounts are locked
   out of the publishing API entirely.
2. That account **linked to a Facebook Page**. A Business account without one
   still cannot publish through the API.
3. A **Meta developer app**.
4. **Meta App Review** for the `instagram_business_content_publish` permission,
   submitted with a screencast. Reviews take roughly two to four weeks, and
   rejections are common. Until it passes, the app stays in development mode
   and can only post to accounts you have added as test users.

That is a real project, not a setting, and none of it can be done from here —
it needs your Meta account and your screen recording. So the button stops at
writing the caption.

If you ever do get through App Review, the hook is already in place:
`instagram()` in `tools/publish.py` is where the posting call would go, and the
two-step flow is create a media container with the image URL, then publish the
container. The article images are already public URLs on your site, which is
what that call needs.

## Posting one by hand

Each file holds the caption, the image URL and the article link.

1. Open the `.txt` file for the article.
2. Download the image named at the bottom (it is a URL on your own site).
3. Post it on Instagram and paste the caption.
4. Update the link in your bio if the article is the one you want people to
   reach.

The caption is a starting point, not a finished thing. It uses the article's
one-line takeaway as the hook. Rewrite the first line if a better one occurs to
you — the first line is the only part most people read.

## A note on the hashtags

The ones the button adds are generic. Hashtags do very little on their own and
a wall of them reads as spam, so treat them as a placeholder. If you find a
small set that actually brings people to your account, put those in
`instagram()` in `tools/publish.py` and they will be used from then on.
