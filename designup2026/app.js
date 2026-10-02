/* dentsu at DesignUp 2026.
   No dependencies. Everything here is progressive: without script the page
   still reads top to bottom, the rail still scrolls and the video links out. */

const $ = id => document.getElementById(id);
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Landing sequence ---------------- */
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('is-loading')));

/* ---------------- Scroll reveal ---------------- */
const reveals = document.querySelectorAll('.reveal');

if (REDUCED_MOTION || !('IntersectionObserver' in window)) {
  reveals.forEach(el => el.classList.add('is-in'));
} else {
  // Siblings in a grid arrive one after another rather than all at once.
  document.querySelectorAll('.cap-grid, .people').forEach(list => {
    [...list.children].forEach((el, i) => el.style.setProperty('--d', `${(i % 5) * 0.07}s`));
  });
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  reveals.forEach(el => io.observe(el));
}

/* ---------------- Work rail ---------------- */
const rail = $('work-rail');
const prev = $('rail-prev');
const next = $('rail-next');
const thumb = $('rail-thumb');
const current = $('rail-current');
const stories = [...rail.querySelectorAll('.story')];

function step() {
  const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
  return stories[0].getBoundingClientRect().width + gap;
}

function updateRail() {
  const max = rail.scrollWidth - rail.clientWidth;
  const pos = max > 0 ? rail.scrollLeft / max : 0;
  const size = Math.min(1, rail.clientWidth / rail.scrollWidth);
  thumb.style.setProperty('--size', `${size * 100}%`);
  thumb.style.setProperty('--size-n', size);
  thumb.style.setProperty('--pos', pos);
  prev.disabled = rail.scrollLeft <= 2;
  next.disabled = rail.scrollLeft >= max - 2;
  const index = Math.min(stories.length, Math.round(rail.scrollLeft / step()) + 1);
  current.textContent = String(max - rail.scrollLeft <= 2 ? stories.length : index).padStart(2, '0');
}

const scrollBy = dir => rail.scrollBy({ left: dir * step(), behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
prev.addEventListener('click', () => scrollBy(-1));
next.addEventListener('click', () => scrollBy(1));
rail.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') { e.preventDefault(); scrollBy(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); scrollBy(-1); }
});
rail.addEventListener('scroll', () => requestAnimationFrame(updateRail), { passive: true });
window.addEventListener('resize', updateRail);
updateRail();

/* Drag to scroll with a mouse; touch and trackpads scroll natively. */
let drag = null;
rail.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  drag = { x: e.clientX, left: rail.scrollLeft, moved: false };
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) > 5) {
    drag.moved = true;
    rail.style.scrollSnapType = 'none';
    rail.style.cursor = 'grabbing';
  }
  if (drag.moved) rail.scrollLeft = drag.left - dx;
});
window.addEventListener('pointerup', () => {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  rail.style.cursor = '';
  if (!moved) return;
  // Let go, then settle onto the nearest card.
  const target = Math.round(rail.scrollLeft / step()) * step();
  rail.scrollTo({ left: target, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  setTimeout(() => { rail.style.scrollSnapType = ''; }, 450);
  // Swallow the click that ends a drag, so it doesn't open a case study.
  rail.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, { capture: true, once: true });
});
rail.addEventListener('dragstart', e => e.preventDefault());

/* ---------------- Video: load YouTube only on play ---------------- */
const video = $('xen-video');
video.querySelector('.video-play').addEventListener('click', () => {
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${video.dataset.video}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  iframe.title = video.dataset.title;
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  video.replaceChildren(iframe);
  iframe.focus();
});
