/* Project showcase.

   Two ways to run, chosen automatically:
   - Supabase  — when config.js has a URL and key. Edits save to the database
                 and are live for everyone straight away. No sign-in required.
   - Local file — when config.js is empty. Reads projects.json and keeps your
                 edits in this browser until you download the file.

   See README.md. */

const SUPA_URL = String(window.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPA_KEY = String(window.SUPABASE_ANON_KEY || '').trim();
const USING_SUPABASE = Boolean(SUPA_URL && SUPA_KEY);

const STORE_KEY = 'showcase-hub-v1';
const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 0.8;

const $ = id => document.getElementById(id);
const grid = $('grid'), empty = $('empty'), notice = $('notice');
const editorDialog = $('editor');

let projects = [];
let published = [];     // local mode only: what projects.json holds
let dirty = false;      // local mode only
let editingId = null;
let pendingImage = '';
let lastFocus = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = v => JSON.parse(JSON.stringify(v));

/* Accepts "google.com" as well as a full URL. A bare domain is never resolved
   against this page (which would give localhost/google.com); it gets https://
   instead. Only http(s) is ever emitted, so javascript:/data: are rejected. */
function safeLink(url) {
  let value = String(url ?? '').trim();
  if (!value) return '';
  if (value.startsWith('//')) value = 'https:' + value;
  else if (!/^https?:\/\//i.test(value)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return '';
    // Typing a scheme is optional, but a bare host must look like a domain,
    // so a stray word does not become a dead link.
    if (!/^[^/?#]+\.[^/?#]/.test(value)) return '';
    value = 'https://' + value;
  }
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? u.href : '';
  } catch { return ''; }
}

function safeImage(src) {
  const value = String(src ?? '').trim();
  if (!value) return '';
  if (/^data:image\/(png|jpeg|jpg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  if (/^(https?:)?\/\//i.test(value)) return safeLink(value.startsWith('//') ? location.protocol + value : value);
  if (/^[\w./-]+$/.test(value) && !value.startsWith('/')) return value;
  return '';
}

function tidy(p) {
  return {
    id: p.id || uid(),
    title: String(p.title ?? ''),
    description: String(p.description ?? ''),
    link: String(p.link ?? ''),
    image: String(p.image ?? ''),
    openInNewTab: p.openInNewTab !== false
  };
}

/* ---------------- Supabase (plain REST, no SDK) ---------------- */

const fromRow = r => tidy({ ...r, openInNewTab: r.open_in_new_tab !== false });
const toRow = p => ({
  title: p.title, description: p.description,
  link: p.link, image: p.image, open_in_new_tab: p.openInNewTab
});

async function rest(path, options = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || body.hint || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/* ---------------- one interface, two backends ---------------- */

const store = USING_SUPABASE ? {
  mode: 'supabase',
  canEdit: () => true,
  async list() {
    return (await rest('projects?select=*&order=created_at.asc')).map(fromRow);
  },
  async create(record) {
    const rows = await rest('projects', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify(toRow(record))
    });
    return fromRow(rows[0]);
  },
  async update(id, record) {
    const rows = await rest(`projects?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify(toRow(record))
    });
    return fromRow(rows[0]);
  },
  async remove(id) {
    await rest(`projects?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  sync() { /* already saved server-side */ }
} : {
  mode: 'local',
  canEdit: () => true,
  async list() {
    let file = [];
    try {
      const res = await fetch('projects.json', { cache: 'no-store' });
      const body = res.ok ? await res.json() : [];
      file = (Array.isArray(body) ? body : body.projects || []).map(tidy);
    } catch { file = []; }
    published = file;

    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { stored = null; }

    // A local draft is only valid while the published file it was based on is
    // unchanged. If projects.json has moved on, the file wins.
    if (stored && stored.baseline === JSON.stringify(file) && Array.isArray(stored.working)) {
      dirty = true;
      return stored.working.map(tidy);
    }
    if (stored) forget();
    dirty = false;
    return clone(file);
  },
  // The caller owns the projects array in both modes; these just hand the
  // record back, and sync() writes the whole list once it has been updated.
  async create(record) { return record; },
  async update(id, record) { return record; },
  async remove() {},
  sync() { remember(); }
};

function remember() {
  dirty = true;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ baseline: JSON.stringify(published), working: projects }));
  } catch {
    toast('Could not save locally. Download projects.json to keep this.');
  }
}
function forget() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* nothing to clear */ }
}

/* ---------------- load + render ---------------- */

async function load() {
  try {
    projects = await store.list();
    showNotice('');
  } catch (error) {
    projects = [];
    showNotice(setupHelp(error));
  }
  render();
}

function setupHelp(error) {
  const detail = esc(error.message || 'Unknown error');
  if (!USING_SUPABASE) return `Could not read projects.json. ${detail}`;
  return `<strong>Could not reach the database.</strong> ${detail}
    <br><br>Worth checking, in order:
    <br>1. <code>config.js</code> has the Project URL and the <em>anon public</em> key, both without extra spaces.
    <br>2. You ran <code>supabase-setup.sql</code> in the Supabase SQL Editor.
    <br>3. The table is called <code>projects</code> and lives in the <code>public</code> schema.`;
}

function showNotice(html) {
  notice.innerHTML = html;
  notice.hidden = !html;
}

function render() {
  const editable = store.canEdit();

  grid.innerHTML = projects.map(cardHtml).join('');
  grid.hidden = projects.length === 0;
  empty.hidden = projects.length !== 0 || !notice.hidden;

  $('empty-copy').textContent = editable
    ? 'Add your first project with the + button in the corner.'
    : 'Nothing has been published here yet.';

  $('add').hidden = !editable;

  const bar = $('publish-bar');
  bar.hidden = !(store.mode === 'local' && dirty);
  $('publish-detail').textContent =
    'Your edits are saved in this browser. Download the file and upload it to your host to publish.';

  if (editable) {
    grid.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(b.dataset.edit)));
    grid.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => remove(b.dataset.delete)));
  }
}

function cardHtml(p) {
  const link = safeLink(p.link);
  const image = safeImage(p.image);
  const tag = link ? 'a' : 'div';
  const attrs = link
    ? ` href="${esc(link)}"${p.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ''}`
    : '';

  return `<article class="card">
  <${tag} class="card-link"${attrs}>
    ${image
      ? `<div class="card-media"><img src="${esc(image)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></div>`
      : `<div class="card-media blank"><span>No image</span></div>`}
    <div class="card-body">
      <h2>${esc(p.title) || 'Untitled project'}${link ? '<span class="arrow" aria-hidden="true">↗</span>' : ''}</h2>
      ${p.description ? `<p>${esc(p.description)}</p>` : ''}
    </div>
  </${tag}>
  ${store.canEdit() ? `<div class="card-tools">
    <button type="button" data-edit="${esc(p.id)}">Edit</button>
    <button type="button" class="danger" data-delete="${esc(p.id)}">Delete</button>
  </div>` : ''}
</article>`;
}

/* ---------------- editor ---------------- */

function openEditor(id = null) {
  editingId = id;
  lastFocus = document.activeElement;
  const p = id ? projects.find(x => x.id === id) : null;

  $('editor-title').textContent = p ? 'Edit project' : 'Add a project';
  $('save').textContent = p ? 'Save changes' : 'Add project';
  $('f-title').value = p ? p.title : '';
  $('f-description').value = p ? p.description : '';
  $('f-link').value = p ? p.link : '';
  $('f-newtab').checked = p ? p.openInNewTab !== false : true;

  pendingImage = p ? p.image : '';
  $('f-image-url').value = pendingImage && !pendingImage.startsWith('data:') ? pendingImage : '';
  paintThumb(pendingImage);

  $('e-title').hidden = true;
  $('e-link').hidden = true;
  editorDialog.showModal();
  $('f-title').focus();
}

function paintThumb(src) {
  const thumb = $('thumb');
  const safe = safeImage(src);
  thumb.dataset.empty = safe ? 'false' : 'true';
  thumb.innerHTML = safe ? `<img src="${esc(safe)}" alt=""><span>No image</span>` : '<span>No image</span>';
}

/* Downscale before storing so rows stay small and the page loads fast. */
async function fileToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function save(event) {
  event.preventDefault();

  const title = $('f-title').value.trim();
  const rawLink = $('f-link').value.trim();
  const link = rawLink ? safeLink(rawLink) : '';

  $('e-title').hidden = Boolean(title);
  $('e-link').hidden = !(rawLink && !link);
  if (!title || (rawLink && !link)) {
    (!title ? $('f-title') : $('f-link')).focus();
    return;
  }

  const record = tidy({
    id: editingId || uid(),
    title,
    description: $('f-description').value.trim(),
    link,
    image: pendingImage,
    openInNewTab: $('f-newtab').checked
  });

  const button = $('save');
  button.disabled = true;

  try {
    if (editingId) {
      const saved = await store.update(editingId, record);
      const i = projects.findIndex(p => p.id === editingId);
      if (i > -1) projects[i] = saved;
    } else {
      projects.push(await store.create(record));
    }
    store.sync();
    editorDialog.close();
    render();
    toast(editingId ? 'Project updated.' : 'Project added.');
  } catch (error) {
    toast(error.message || 'Could not save.');
  } finally {
    button.disabled = false;
  }
}

async function remove(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete "${p.title || 'this project'}"? This cannot be undone.`)) return;
  try {
    await store.remove(id);
    projects = projects.filter(x => x.id !== id);
    store.sync();
    render();
    toast('Project deleted.');
  } catch (error) {
    toast(error.message || 'Could not delete.');
  }
}

/* ---------------- publish (local mode only) ---------------- */

function exportJson() {
  const blob = new Blob([JSON.stringify(projects, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'projects.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Downloaded. Upload this file to your host to publish.');
}

async function discard() {
  if (!confirm('Discard your local changes and go back to the published projects.json?')) return;
  forget();
  projects = clone(published);
  dirty = false;
  render();
  toast('Local changes discarded.');
}

/* ---------------- misc ---------------- */

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

$('add').addEventListener('click', () => openEditor());
$('cancel').addEventListener('click', () => editorDialog.close());
$('cancel-2').addEventListener('click', () => editorDialog.close());
$('form').addEventListener('submit', save);
editorDialog.addEventListener('close', () => lastFocus?.focus());

$('f-image-url').addEventListener('input', e => {
  pendingImage = e.target.value.trim();
  paintThumb(pendingImage);
});

$('f-image-file').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    pendingImage = await fileToDataUrl(file);
    $('f-image-url').value = '';
    paintThumb(pendingImage);
  } catch {
    toast('Could not read that image file.');
  }
  e.target.value = '';
});

$('clear-image').addEventListener('click', () => {
  pendingImage = '';
  $('f-image-url').value = '';
  paintThumb('');
});

$('export').addEventListener('click', exportJson);
$('discard').addEventListener('click', discard);

window.addEventListener('beforeunload', e => {
  if (store.mode === 'local' && dirty) { e.preventDefault(); e.returnValue = ''; }
});

load();
