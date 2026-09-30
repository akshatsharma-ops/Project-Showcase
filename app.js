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
const carouselControls = $('carousel-controls');
const carouselPrev = $('carousel-prev');
const carouselNext = $('carousel-next');
const projectsCarousel = $('projects-carousel');
const railCurrent = $('rail-current');
const railTotal = $('rail-total');
const railThumb = $('rail-thumb');
const railProgress = document.querySelector('.rail-progress');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let firstRender = true;

const ICONS = {
  open: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/></svg>',
  remove: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>'
};

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

  grid.innerHTML = projects.map((project, index) => cardHtml(project, index)).join('');
  grid.hidden = projects.length === 0;
  empty.hidden = projects.length !== 0 || !notice.hidden;

  $('empty-copy').textContent = editable
    ? 'Add your first project with the small + button in the bottom corner.'
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

  $('rail-foot').hidden = projects.length === 0;
  railTotal.textContent = String(projects.length);

  // The landing sequence plays once; later re-renders (after an edit) are instant.
  if (firstRender && projects.length) {
    grid.querySelectorAll('.card').forEach((card, i) => {
      card.style.setProperty('--i', i);
      card.classList.add('enter');
      card.addEventListener('animationend', e => {
        if (e.target === card) card.classList.remove('enter');
      });
    });
  }
  if (firstRender) {
    firstRender = false;
    requestAnimationFrame(() => document.documentElement.classList.remove('is-loading'));
  }

  requestAnimationFrame(updateCarouselControls);
}

function cardHtml(p, index = 0) {
  const link = safeLink(p.link);
  const image = safeImage(p.image);
  const tag = link ? 'a' : 'div';
  const attrs = link
    ? ` href="${esc(link)}"${p.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ''}`
    : '';

  const number = String(index + 1);
  const cta = link ? `<span class="card-cta" aria-hidden="true">${ICONS.open}</span>` : '';

  return `<article class="card">
  <${tag} class="card-link"${attrs} draggable="false">
    ${image
      ? `<div class="card-media"><img src="${esc(image)}" alt="${esc(p.title)}" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async" draggable="false">${cta}</div>`
      : `<div class="card-media blank"><span>No image</span>${cta}</div>`}
    <div class="card-body">
      <div class="card-kicker">Case study ${number}</div>
      <h2>${esc(p.title) || 'Untitled project'}</h2>
      ${p.description ? `<p>${esc(p.description)}</p>` : ''}
    </div>
  </${tag}>
  ${store.canEdit() ? `<div class="card-tools">
    <button type="button" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.title)}" title="Edit">${ICONS.edit}</button>
    <button type="button" class="danger" data-delete="${esc(p.id)}" aria-label="Delete ${esc(p.title)}" title="Delete">${ICONS.remove}</button>
  </div>` : ''}
</article>`;
}

/* ---------------- project carousel ---------------- */

const maxScroll = () => Math.max(0, grid.scrollWidth - grid.clientWidth);

function carouselStep() {
  const card = grid.querySelector('.card');
  if (!card) return grid.clientWidth * 0.4;
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
  return card.getBoundingClientRect().width + gap;
}

/* Snap positions = each card's left edge minus the rail's inset padding. */
function snapPoints() {
  const inset = parseFloat(getComputedStyle(grid).paddingLeft) || 0;
  const max = maxScroll();
  return [...grid.querySelectorAll('.card')].map(c => Math.min(max, Math.max(0, c.offsetLeft - inset)));
}

function currentIndex() {
  const points = snapPoints();
  if (!points.length) return 0;
  if (grid.scrollLeft >= maxScroll() - 2) {
    // At the end, report the last card rather than the one that happens to be first in view.
    return points.length - 1;
  }
  let best = 0;
  points.forEach((p, i) => { if (Math.abs(p - grid.scrollLeft) < Math.abs(points[best] - grid.scrollLeft)) best = i; });
  return best;
}

function updateCarouselControls() {
  const max = maxScroll();
  const hasOverflow = max > 4;
  const atStart = !hasOverflow || grid.scrollLeft <= 2;
  const atEnd = !hasOverflow || grid.scrollLeft >= max - 2;
  carouselControls.hidden = !hasOverflow;
  railProgress.hidden = !hasOverflow;
  carouselPrev.disabled = atStart;
  carouselNext.disabled = atEnd;
  projectsCarousel?.classList.toggle('at-start', atStart);
  projectsCarousel?.classList.toggle('at-end', atEnd);

  // Progress: the dark segment is as wide as the visible share of the rail.
  const size = Math.min(1, grid.clientWidth / Math.max(1, grid.scrollWidth));
  railThumb.style.setProperty('--size', (size * 100).toFixed(2) + '%');
  railThumb.style.setProperty('--size-n', Math.max(size, 0.01).toFixed(4));
  railThumb.style.setProperty('--pos', hasOverflow ? (grid.scrollLeft / max).toFixed(4) : 0);
  const active = currentIndex();
  railCurrent.textContent = String(active + 1);
  // On touch screens there is no hover, so the card in front gets the zoom instead.
  grid.querySelectorAll('.card').forEach((card, i) => card.classList.toggle('is-active', i === active));

  updateParallax();
}

/* Each image drifts slightly against the scroll direction, so the rail reads
   as windows onto the work rather than flat tiles. */
function updateParallax() {
  if (REDUCED_MOTION) return;
  const view = grid.getBoundingClientRect();
  const centre = view.left + view.width / 2;
  grid.querySelectorAll('.card').forEach(card => {
    const r = card.getBoundingClientRect();
    if (r.right < view.left - 50 || r.left > view.right + 50) return;
    const p = Math.max(-1, Math.min(1, (r.left + r.width / 2 - centre) / view.width));
    card.style.setProperty('--p', p.toFixed(3));
  });
}

let scrollFrame = 0;
function onRailScroll() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; updateCarouselControls(); });
}

function moveCarousel(direction) {
  // Pick the nearest stop strictly in the direction of travel. Comparing with a
  // tolerance (not ===) matters on Retina / zoomed screens, where scrollLeft is
  // often fractional and an exact match never happens.
  const here = grid.scrollLeft;
  const max = maxScroll();
  const points = [...new Set(snapPoints().map(Math.round))].sort((x, y) => x - y);
  if (!points.includes(0)) points.unshift(0);
  if (!points.includes(Math.round(max))) points.push(Math.round(max));
  const target = direction < 0
    ? [...points].reverse().find(x => x < here - 4)
    : points.find(x => x > here + 4);
  if (target === undefined) return;
  clearTimeout(settleTimer);
  grid.classList.remove('is-free');
  grid.scrollTo({ left: target, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
}

/* Free movement (wheel, drag) turns snapping off; once input stops, glide to the nearest card. */
let settleTimer;
function settleSoon(delay = 160, velocity = 0) {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const points = snapPoints();
    if (!points.length) return grid.classList.remove('is-free');
    const aim = grid.scrollLeft + velocity * 180;
    const nearest = points.reduce((a, b) => Math.abs(b - aim) < Math.abs(a - aim) ? b : a);
    grid.scrollTo({ left: nearest, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    // Re-enable snapping after the glide so it does not cut the animation short.
    setTimeout(() => grid.classList.remove('is-free'), 520);
  }, delay);
}

// The page itself does not scroll, so a vertical mouse wheel moves the rail sideways.
grid.addEventListener('wheel', e => {
  if (maxScroll() <= 4) return;
  const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  e.preventDefault();
  grid.classList.add('is-free');
  grid.scrollLeft += e.deltaMode === 1 ? delta * 32 : delta;
  settleSoon();
}, { passive: false });

// Mouse drag. Touch and pen already scroll natively.
let drag = null;
grid.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.card-tools')) return;
  drag = { x: e.clientX, start: grid.scrollLeft, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0 };
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    clearTimeout(settleTimer);
    grid.classList.add('is-free', 'is-dragging');
  }
  const now = performance.now();
  drag.v = (drag.lastX - e.clientX) / Math.max(1, now - drag.lastT);
  drag.lastX = e.clientX; drag.lastT = now;
  grid.scrollLeft = drag.start - dx;
});
window.addEventListener('pointerup', () => {
  if (!drag) return;
  const wasDrag = drag.moved, v = drag.v;
  drag = null;
  if (!wasDrag) return;
  grid.classList.remove('is-dragging');
  // Swallow the click that follows a drag so it does not open the project.
  grid.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); }, { capture: true, once: true });
  settleSoon(0, Math.max(-3, Math.min(3, v)));
});

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

carouselPrev.addEventListener('click', () => moveCarousel(-1));
carouselNext.addEventListener('click', () => moveCarousel(1));
grid.addEventListener('scroll', onRailScroll, { passive: true });
grid.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') { e.preventDefault(); moveCarousel(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); moveCarousel(1); }
});
window.addEventListener('resize', updateCarouselControls);

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
