# Setup — connect the database (about 10 minutes)

Do these five steps in order. You only do this once.

Before you start, the page already works: open `index.html` and you will see example cards. It reads `projects.json`. The steps below swap that for a real database so you can edit from the live site.

---

## Step 1 — Create the Supabase project

1. Go to **supabase.com** and sign up (free).
2. Click **New project**.
3. Name it anything, e.g. `project-showcase`.
4. Set a database password. You will not need it again — save it somewhere anyway.
5. Pick the region closest to you and click **Create new project**.

Wait about a minute while it sets up.

---

## Step 2 — Create the table

1. In the left sidebar click **SQL Editor**.
2. Click **New query**.
3. Open `supabase-setup.sql` from this folder, copy everything, paste it in.
4. Click **Run** (bottom right).

You should see *Success. No rows returned*. That is correct.

To check it worked: click **Table Editor** in the sidebar. You should see a `projects` table.

---

## Step 3 — Create your login

This is the account you will use to edit the site.

1. Sidebar → **Authentication** → **Users**.
2. Click **Add user** → **Create new user**.
3. Enter your email and a password.
4. Turn **Auto Confirm User** ON. (Without this you cannot sign in.)
5. Click **Create user**.

---

## Step 4 — Paste your two keys

1. Sidebar → **Project Settings** (gear icon) → **API**.
2. Copy **Project URL**.
3. Copy the **anon public** key. *(Not `service_role` — never use that one here.)*
4. Open `config.js` in VS Code and paste them in:

```js
window.SUPABASE_URL = 'https://abcdefgh.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

5. Save the file.

Now open `index.html` again. The example cards are gone and the page is empty — it is reading the database, which has nothing in it yet. Click **Sign in** at the top right, use the email and password from Step 3, and add your first project.

> **Is it safe to publish the anon key?** Yes. It is designed to be public. The rules from Step 2 mean it can only *read*. Adding, editing and deleting require a signed-in user.

---

## Step 5 — Put it online with Vercel

1. Go to **vercel.com** and sign up.
2. Click **Add New** → **Project**.
3. Choose **Deploy** and drag this whole folder into the upload area. *(Or connect a GitHub repo if you keep the folder there.)*
4. There is nothing to configure — no build command, no framework. Click **Deploy**.

You will get a URL like `project-showcase.vercel.app`. That is your live site.

From now on you add and edit projects **on the live site**: open it, sign in, use the + button. Changes save to the database and everyone sees them straight away. You never need to re-deploy or upload a file again.

---

## Everyday use

| To do this | Do this |
|---|---|
| Add a project | Sign in on the live site → **+** button |
| Change a link or title | Sign in → **Edit** on the card |
| Remove a project | Sign in → **Delete** on the card |
| Change the big heading | Edit the `<h1>` in `index.html`, redeploy |
| Change the accent colour | Edit `--accent` in `styles.css`, redeploy |

Only the last two need a redeploy, because they are part of the page rather than the data.

---

## If something goes wrong

The page tells you what it could not do. The most common causes:

**"Could not reach the database"**
- A typo in `config.js`, or a trailing space in the URL or key.
- The URL should end in `.supabase.co` with no slash at the end.

**"Invalid login credentials"**
- Wrong email or password.
- Or you skipped **Auto Confirm User** in Step 3. Delete the user and add them again with it on.

**Cards show, but + and Edit do not appear**
- You are signed out. Click **Sign in** at the top right.

**"new row violates row-level security policy"**
- Step 2 did not run fully. Open the SQL Editor and run `supabase-setup.sql` again.

**Everything disappeared and example cards came back**
- `config.js` is empty or was overwritten, so the page fell back to `projects.json`. Paste your keys back in.

---

## Reading the list from another app

Your projects are a plain REST endpoint, so anything can read them. Read-only, no library needed:

```js
const res = await fetch(
  'https://YOUR-PROJECT.supabase.co/rest/v1/projects?select=*&order=created_at.asc',
  { headers: { apikey: 'YOUR-ANON-KEY' } }
);
const projects = await res.json();
// [{ id, title, description, link, image, open_in_new_tab, created_at }, ...]
```

Same two values as `config.js`. Because the rules only allow reads with this key, it is safe to use in any front end.

---

## If you skip the database

Leave `config.js` empty and the page runs from `projects.json`: you edit in the browser, click **Download projects.json**, and upload that file to your host. It works, but every change needs a re-upload. That is the mode the folder ships in, so you can see the page working before setting anything up.
