# Project showcase

A single page listing your projects as cards. Each card is a link. You add, edit and delete them on the site itself.

**New here? Open `SETUP.md` and follow the five steps.** It takes about ten minutes and you only do it once.

## What this is

- One page, no build step, no framework, no npm install.
- Works out of the box from `projects.json`, so you can see it running before setting anything up.
- Connect Supabase (free) and it switches to a real database: edits made on the live site save instantly for everyone.
- Deploys to Vercel, Netlify, GitHub Pages or any static host by dragging the folder.

## Files

| File | What it is |
|---|---|
| `index.html` | The page. The big heading lives here. |
| `styles.css` | All styling. `--accent` at the top recolours everything. |
| `app.js` | The logic. You should not need to open this. |
| `config.js` | **Your two Supabase values go here.** |
| `supabase-setup.sql` | Paste into Supabase once to create the table. |
| `projects.json` | Example data, used only when `config.js` is empty. |
| `SETUP.md` | Step-by-step setup. |

## The fields on a card

| Field | Notes |
|---|---|
| Title | Required. |
| Description | Optional. Trimmed to three lines on the card. |
| Link | Type `google.com` or a full `https://…` — either works. |
| Image | Paste a URL or upload a file. Uploads are resized automatically. No image hosting needed. |
| Open in a new tab | On by default. Off means it opens in the same tab. |

The whole card is the link. The address is never shown on it — just the image, title and description, with an arrow on hover.

Anything that is not a web address is refused rather than saved as a broken link: a stray word with no dot, or a `javascript:`, `data:` or `mailto:` link.

## Who can edit

Visitors can only read. The + button and the Edit/Delete controls appear once you sign in with the user you created in Supabase. This is enforced by the database itself, not by hiding buttons, so it holds even if someone digs into the page.

## Changing the look

In `styles.css`:

- `--accent` — the one colour used for the + button, hover states and focus rings.
- `--gutter` — page margins.
- `--radius` — set to e.g. `8px` for rounded cards.

Type, spacing and the wordmark match the project-story template, so the two sit together as one family.

## Notes

- No analytics, trackers, external scripts or dependencies. The Supabase calls are plain `fetch`.
- All text is escaped and links are restricted to `http(s)`, so pasted content cannot inject anything into the page.
- Uploaded images are resized to 1200px wide and stored with the project record. For a handful of projects this is fine. If the page starts feeling heavy, host the images instead and paste their URLs.
- `assets/` holds the wordmark and the two Stabil Grotesk fonts, copied from the project-story template so this folder is self-contained. Use them within your organisation's existing brand and font permissions.
