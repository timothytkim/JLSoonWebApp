// Presentation mode: one large slide at a time for worship.
import { h, splitBlocks } from './util.js';
import { SECTIONS, SECTION_ORDER, passageRef } from './sections.js';
import { imageUrl } from './store.js';

const PREFS_KEY = 'soon-present-prefs';
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.6;

function loadPrefs() {
  try {
    return { scale: 1, theme: 'light', ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
  } catch {
    return { scale: 1, theme: 'light' };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export function buildSlides(content) {
  const slides = [];
  const parts = (text) => {
    const blocks = splitBlocks(text);
    return blocks.length ? blocks : [''];
  };
  const counter = (i, n) => (n > 1 ? `${i + 1} / ${n}` : '');

  for (const song of content.songs) {
    // Lyrics screens first, then one screen per image.
    const pages = [
      ...splitBlocks(song.lyrics).map((text) => ({ kind: 'lyrics', text })),
      ...(song.image_paths || []).map((path, i) => ({ kind: 'image', src: imageUrl(path), alt: `${song.title} 이미지 ${i + 1}` })),
    ];
    if (!pages.length) pages.push({ kind: 'lyrics', text: '' });
    pages.forEach((page, i) => slides.push({
      section: 'songs', itemId: song.id, title: song.title, meta: counter(i, pages.length), ...page,
    }));
  }
  for (const passage of content.passages) {
    const blocks = parts(passage.body);
    blocks.forEach((text, i) => slides.push({
      section: 'passages', kind: 'passage', itemId: passage.id, title: passageRef(passage), text,
      meta: [passage.title, counter(i, blocks.length)].filter(Boolean).join(' · '),
    }));
  }
  for (const commentary of content.commentaries) {
    slides.push({ section: 'commentaries', kind: 'commentary', itemId: commentary.id, title: commentary.title, text: commentary.body, meta: '' });
  }
  if (content.announcements.length) {
    slides.push({ section: 'announcements', kind: 'announcements', itemIds: content.announcements.map((a) => a.id), items: content.announcements });
  }
  return slides;
}

function slideView(slide) {
  if (!slide) {
    return h('div', { class: 'slide slide--empty' },
      h('p', { class: 'slide__title' }, '보여 줄 내용이 없습니다'),
      h('p', { class: 'slide__eyebrow' }, '먼저 찬양이나 성경 본문을 추가해 주세요.'));
  }

  if (slide.kind === 'announcements') {
    return h('div', { class: 'slide slide--announcements' },
      h('p', { class: 'slide__eyebrow' }, '광고'),
      h('ul', { class: 'slide__announcements' }, slide.items.map((a) =>
        h('li', { class: a.is_important ? 'is-important' : '' },
          h('h2', {}, a.is_important ? h('span', { class: 'badge' }, '중요') : null, a.title),
          a.body ? h('p', {}, a.body) : null))));
  }

  const label = SECTIONS[slide.section].label;
  if (slide.kind === 'image') {
    return h('div', { class: 'slide slide--image' },
      h('p', { class: 'slide__eyebrow' }, `${label} · ${slide.title}`, slide.meta ? ` · ${slide.meta}` : ''),
      h('img', { class: 'slide__image', src: slide.src, alt: slide.alt }));
  }
  return h('div', { class: `slide slide--${slide.kind}` },
    h('p', { class: 'slide__eyebrow' }, label, slide.meta ? ` · ${slide.meta}` : ''),
    h('h2', { class: 'slide__title' }, slide.title),
    slide.kind === 'commentary'
      ? h('div', { class: 'slide__text' }, splitBlocks(slide.text).map((p) => h('p', {}, p)))
      : h('div', { class: 'slide__text' }, slide.text));
}

/** Renders into root and returns a cleanup function. */
export function renderPresent(root, { service, content, from, back }) {
  const slides = buildSlides(content);
  const prefs = loadPrefs();
  const closeHref = back && back.startsWith('#/s/') ? back : `#/s/${service.id}`;
  let index = from ? Math.max(0, slides.findIndex((s) => s.itemId === from || s.itemIds?.includes(from))) : 0;

  const stage = h('main', { class: 'present__stage', tabindex: '-1' });
  const counter = h('span', { class: 'present__counter', 'aria-live': 'polite' });
  const prevButton = h('button', { type: 'button', class: 'pbtn pbtn--nav', onClick: () => go(index - 1) }, '◀ 이전');
  const nextButton = h('button', { type: 'button', class: 'pbtn pbtn--nav pbtn--next', onClick: () => go(index + 1) }, '다음 ▶');
  const themeButton = h('button', { type: 'button', class: 'pbtn', onClick: toggleTheme });

  const tabs = SECTION_ORDER
    .filter((key) => slides.some((s) => s.section === key))
    .map((key) => h('button', {
      type: 'button',
      class: 'ptab',
      dataset: { section: key },
      onClick: () => go(slides.findIndex((s) => s.section === key)),
    }, SECTIONS[key].label));

  const el = h('div', { class: 'present' },
    h('header', { class: 'present__top' },
      h('a', { class: 'pbtn', href: closeHref }, '✕ 닫기'),
      h('nav', { class: 'present__tabs', 'aria-label': '순서 바로가기' }, tabs),
      h('div', { class: 'present__tools' },
        h('button', { type: 'button', class: 'pbtn', 'aria-label': '글자 작게', onClick: () => setScale(prefs.scale - 0.1) }, '가−'),
        h('button', { type: 'button', class: 'pbtn', 'aria-label': '글자 크게', onClick: () => setScale(prefs.scale + 0.1) }, '가+'),
        themeButton,
        document.fullscreenEnabled
          ? h('button', { type: 'button', class: 'pbtn pbtn--fullscreen', onClick: toggleFullscreen }, '전체 화면')
          : null)),
    stage,
    h('footer', { class: 'present__bottom' }, prevButton, counter, nextButton));

  function update() {
    stage.replaceChildren(slideView(slides[index]));
    stage.scrollTop = 0;
    counter.textContent = slides.length ? `${index + 1} / ${slides.length}` : '';
    const next = slides[index + 1];
    if (next?.kind === 'image') new Image().src = next.src; // preload so the next screen appears instantly
    prevButton.disabled = index <= 0;
    nextButton.disabled = index >= slides.length - 1;
    const section = slides[index]?.section;
    tabs.forEach((tab) => {
      const active = tab.dataset.section === section;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function go(next) {
    if (next < 0 || next >= slides.length || next === index) return;
    index = next;
    update();
  }

  function setScale(value) {
    prefs.scale = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)) * 10) / 10;
    el.style.setProperty('--scale', prefs.scale);
    savePrefs(prefs);
  }

  function applyTheme() {
    el.dataset.theme = prefs.theme;
    themeButton.textContent = prefs.theme === 'dark' ? '밝게' : '어둡게';
  }

  function toggleTheme() {
    prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    savePrefs(prefs);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Enter':
        event.preventDefault(); go(index + 1); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace':
        event.preventDefault(); go(index - 1); break;
      case '+': case '=': setScale(prefs.scale + 0.1); break;
      case '-': setScale(prefs.scale - 0.1); break;
      case 'f': case 'F': if (document.fullscreenEnabled) toggleFullscreen(); break;
      case 'Escape': if (!document.fullscreenElement) location.hash = closeHref; break;
      default:
    }
  }

  // Horizontal swipe on touch screens.
  let touchStart = null;
  stage.addEventListener('touchstart', (e) => { touchStart = e.touches[0]; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.clientX;
    const dy = e.changedTouches[0].clientY - touchStart.clientY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
    touchStart = null;
  });

  // Keep tablets / laptops from dimming during worship.
  let wakeLock = null;
  const requestWakeLock = async () => {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported or denied */ }
  };
  const onVisibility = () => { if (document.visibilityState === 'visible') requestWakeLock(); };

  setScale(prefs.scale);
  applyTheme();
  update();
  root.replaceChildren(el);
  document.body.classList.add('is-presenting');
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  requestWakeLock();
  window.scrollTo(0, 0);
  stage.focus({ preventScroll: true });

  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    document.body.classList.remove('is-presenting');
    wakeLock?.release().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
}
