// App entry: routing, layout shell, and the home / services / login pages.
import { h, toast, formatDate, todayISO, errorMessage, isDirty, setDirty, confirmDiscard } from './util.js';
import * as store from './store.js';
import { SECTIONS, SECTION_ORDER, itemHeading } from './sections.js';
import { renderForm } from './form.js';
import { renderSection } from './section-view.js';
import { renderPresent } from './present.js';
import { renderCalendar } from './calendar.js';
import { icon } from './icons.js';

const app = document.getElementById('app');
const cache = { services: null, content: new Map() };
let lastServiceId = null;
let cleanup = null;
let renderToken = 0;
let lastRenderedHash = null;

/** Map of 'YYYY-MM-DD' → service titles, for marking dates on calendars. */
function servicesByDate(services, exceptId = null) {
  const byDate = new Map();
  for (const service of services) {
    if (service.id === exceptId) continue;
    byDate.set(service.service_date, [...(byDate.get(service.service_date) || []), service.title]);
  }
  return byDate;
}

function serviceFields(services, exceptId = null) {
  return [
    { name: 'service_date', label: '예배 날짜', type: 'calendar', marked: servicesByDate(services, exceptId) },
    { name: 'title', label: '예배 이름', type: 'text', required: true, placeholder: '예: 9월 셋째 주 순예배' },
  ];
}

// ───────────────────────────────────────────── Data cache

async function getServices() {
  if (!cache.services) cache.services = await store.listServices();
  return cache.services;
}

async function getContent(serviceId) {
  if (!cache.content.has(serviceId)) cache.content.set(serviceId, await store.getContent(serviceId));
  return cache.content.get(serviceId);
}

function invalidate({ services = false, serviceId = null } = {}) {
  if (services) cache.services = null;
  if (serviceId) cache.content.delete(serviceId);
}

/** The nearest upcoming service, or the most recent one. Services are sorted newest first. */
function pickCurrent(services) {
  const today = todayISO();
  const upcoming = services.filter((s) => s.service_date >= today);
  return upcoming[upcoming.length - 1] || services[0] || null;
}

export function presentHref(serviceId, fromItemId) {
  const params = new URLSearchParams({ back: location.hash || `#/s/${serviceId}` });
  if (fromItemId) params.set('from', fromItemId);
  return `#/present/${serviceId}?${params}`;
}

// ───────────────────────────────────────────── Router

async function render() {
  const token = ++renderToken;
  cleanup?.();
  cleanup = null;

  const [path, queryString = ''] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean);
  const query = new URLSearchParams(queryString);
  const stale = () => token !== renderToken;

  try {
    if (parts[0] === 'login') {
      const services = await getServices();
      if (stale()) return;
      return renderShell({ services, main: renderLogin() });
    }

    const services = await getServices();
    if (stale()) return;

    if (parts.length === 0) {
      const current = pickCurrent(services);
      if (current) return location.replace(`#/s/${current.id}`);
      return renderShell({ services, main: renderServices(services) });
    }

    if (parts[0] === 'services') {
      // Keep the service tabs available from the schedule page.
      const service = services.find((s) => s.id === lastServiceId) || pickCurrent(services);
      const content = service ? await getContent(service.id) : null;
      if (stale()) return;
      return renderShell({ services, service, content, active: 'services', main: renderServices(services) });
    }

    if (parts[0] === 's' || parts[0] === 'present') {
      const service = services.find((s) => s.id === parts[1]);
      if (!service) return renderShell({ services, main: renderNotFound('예배를 찾을 수 없습니다.') });
      const content = await getContent(service.id);
      if (stale()) return;
      lastServiceId = service.id;

      if (parts[0] === 'present') {
        cleanup = renderPresent(app, { service, content, from: query.get('from'), back: query.get('back') });
        return;
      }

      const sectionKey = parts[2];
      const reload = async () => {
        invalidate({ serviceId: service.id });
        await render();
      };
      if (!sectionKey) {
        return renderShell({ services, service, content, active: 'overview', main: renderOverview(service, content, services) });
      }
      if (SECTIONS[sectionKey]) {
        return renderShell({
          services, service, content, active: sectionKey,
          main: renderSection({ service, content, sectionKey, reload, presentHref }),
        });
      }
    }

    renderShell({ services, main: renderNotFound('페이지를 찾을 수 없습니다.') });
  } catch (err) {
    console.error(err);
    if (stale()) return;
    app.replaceChildren(h('div', { class: 'fatal' },
      h('h1', {}, '내용을 불러오지 못했습니다'),
      h('p', {}, errorMessage(err)),
      h('button', { type: 'button', class: 'btn btn--primary', onClick: () => { invalidate({ services: true }); cache.content.clear(); render(); } }, '다시 시도')));
  }
}

let currentHash = location.hash;
let revertingHash = false;
window.addEventListener('hashchange', () => {
  if (revertingHash) {
    revertingHash = false;
    return;
  }
  if (isDirty() && !confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 이동할까요?')) {
    revertingHash = true;
    location.hash = currentHash;
    return;
  }
  setDirty(false);
  currentHash = location.hash;
  render();
});

// ───────────────────────────────────────────── Layout

function renderShell({ services, service = null, content = null, active = null, main }) {
  const navLink = (key, iconName, label, href, count) => h('a', {
    href,
    class: `nav__link${active === key ? ' is-active' : ''}`,
    'aria-current': active === key ? 'page' : null,
  },
  icon(iconName, 'icon nav__icon'),
  h('span', { class: 'nav__label' }, label),
  count != null ? h('span', { class: 'nav__count' }, count) : null);

  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'sidebar__top' },
      h('a', { class: 'brand', href: '#/' }, 'Neat Soon'),
      renderAuthControl()),
    service ? h('a', { class: 'current', href: '#/services' },
      h('span', { class: 'current__text' },
        h('span', { class: 'current__date' }, formatDate(service.service_date)),
        h('span', { class: 'current__title' }, service.title)),
      h('span', { class: 'current__change' }, '변경 ›')) : null,
    h('nav', { class: 'nav', 'aria-label': '메뉴' },
      navLink('services', 'calendar', [h('span', { class: 'nav__label-extra' }, '전체 '), '일정'], '#/services'),
      service ? [
        h('div', { class: 'nav__divider', 'aria-hidden': 'true' }),
        navLink('overview', 'home', '개요', `#/s/${service.id}`),
        SECTION_ORDER.map((key) => navLink(key, SECTIONS[key].icon, SECTIONS[key].label, `#/s/${service.id}/${key}`, content[key].length)),
      ] : null),
    service ? h('a', { class: 'btn btn--primary btn--block sidebar__start', href: presentHref(service.id) }, icon('play', 'icon btn__icon'), '예배 화면 시작') : null,
    store.isDemo() ? h('p', { class: 'demo-note' }, '데모 모드: 이 기기의 브라우저에만 저장됩니다.') : null);

  // The sidebar's demo note is hidden on phones, so the page repeats it inline there.
  const demoNote = store.isDemo() ? h('p', { class: 'demo-note demo-note--inline' }, '데모 모드: 이 기기의 브라우저에만 저장됩니다.') : null;
  app.replaceChildren(h('div', { class: 'layout' }, sidebar, h('main', { class: 'main' }, demoNote, main)));
  // Keep the scroll position when re-rendering the same page (e.g. after saving an item).
  if (location.hash !== lastRenderedHash) window.scrollTo(0, 0);
  lastRenderedHash = location.hash;
}

function renderAuthControl() {
  if (store.isDemo()) return null;
  if (store.currentUser()) {
    return h('button', { type: 'button', class: 'link-button', onClick: logout }, '로그아웃');
  }
  return h('a', { class: 'link-button', href: '#/login' }, '편집자 로그인');
}

async function logout() {
  if (!confirmDiscard()) return;
  try {
    await store.signOut();
    toast('로그아웃되었습니다');
  } catch (err) {
    toast(errorMessage(err), { error: true });
  }
}

// ───────────────────────────────────────────── Pages

function renderOverview(service, content, services) {
  const canEdit = store.isEditor();
  const headSlot = h('div');

  const showHead = () => headSlot.replaceChildren(h('header', { class: 'page-head' },
    h('p', { class: 'page-head__eyebrow' }, formatDate(service.service_date)),
    h('h1', { class: 'page-title' }, service.title),
    canEdit ? h('div', { class: 'page-head__actions' },
      h('button', { type: 'button', class: 'btn', onClick: showEdit }, '예배 정보 수정'),
      h('button', { type: 'button', class: 'btn btn--danger', onClick: removeService }, '예배 삭제')) : null));

  function showEdit() {
    headSlot.replaceChildren(renderForm({
      title: '예배 정보 수정',
      fields: serviceFields(services, service.id),
      values: service,
      onCancel: showHead,
      onSubmit: async (data) => {
        await store.saveService({ id: service.id, ...data });
        setDirty(false);
        invalidate({ services: true });
        toast('저장되었습니다');
        await render();
      },
    }));
  }

  async function removeService() {
    const total = SECTION_ORDER.reduce((sum, key) => sum + content[key].length, 0);
    const warning = total ? `\n이 예배에 등록된 내용 ${total}개도 함께 삭제됩니다.` : '';
    if (!confirm(`"${service.title}" 예배를 삭제할까요?${warning}\n삭제하면 되돌릴 수 없습니다.`)) return;
    try {
      await store.deleteService(service.id);
      invalidate({ services: true, serviceId: service.id });
      lastServiceId = null;
      toast('삭제되었습니다');
      location.hash = '#/';
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  showHead();

  // Home-screen style widgets: square tiles with a caption underneath.
  const tile = (key) => {
    const def = SECTIONS[key];
    const items = content[key];
    return h('div', { class: 'widget' },
      h('a', { class: 'tile', href: `#/s/${service.id}/${key}` },
        items.length
          ? h('ul', { class: 'tile__list' }, items.slice(0, 3).map((item) => h('li', {}, itemHeading(key, item))))
          : h('p', { class: 'tile__empty' }, canEdit ? '눌러서 추가하기' : '아직 없습니다'),
        h('span', { class: 'tile__foot' },
          icon(def.icon, 'icon tile__icon'),
          h('span', { class: 'tile__label' }, def.label))),
      h('p', { class: 'widget__caption' }, `${items.length}개`));
  };

  // Wide widget: the order of service, with a round start button.
  const orderRow = (key) => h('li', {},
    h('a', { class: 'order__row', href: `#/s/${service.id}/${key}` },
      icon(SECTIONS[key].icon, 'icon order__icon'),
      h('span', { class: 'order__label' }, SECTIONS[key].label),
      h('span', { class: 'order__count' }, content[key].length)));

  return h('div', { class: 'page' },
    headSlot,
    h('div', { class: 'widgets' },
      h('div', { class: 'widget widget--wide' },
        h('div', { class: 'panel' },
          h('p', { class: 'panel__eyebrow' }, '예배 순서'),
          h('ul', { class: 'order' }, SECTION_ORDER.map(orderRow)),
          h('a', { class: 'fab', href: presentHref(service.id), 'aria-label': '예배 화면 시작' }, icon('play', 'icon fab__icon'))),
        h('p', { class: 'widget__caption' }, '예배 화면 시작')),
      SECTION_ORDER.map(tile)));
}

/** Schedule page: a month calendar of every service, then upcoming and past lists. */
function renderServices(services) {
  const canEdit = store.isEditor();
  const current = pickCurrent(services);
  const today = todayISO();
  const PAST_LIMIT = 8;
  const body = h('div', { class: 'schedule' });

  const row = (service) => h('li', {},
    h('a', { class: 'service-row', href: `#/s/${service.id}` },
      h('span', { class: 'service-row__date' }, formatDate(service.service_date)),
      h('span', { class: 'service-row__title' }, service.title),
      service.service_date === today
        ? h('span', { class: 'badge badge--accent' }, '오늘')
        : service.id === current?.id ? h('span', { class: 'badge badge--accent' }, '가까운 예배') : null));

  function showSchedule() {
    const upcoming = services.filter((s) => s.service_date >= today).reverse(); // soonest first
    const past = services.filter((s) => s.service_date < today); // most recent first
    const pastList = h('ul', { class: 'service-list' }, past.slice(0, PAST_LIMIT).map(row));
    const moreButton = past.length > PAST_LIMIT
      ? h('button', {
        type: 'button',
        class: 'btn',
        onClick: () => {
          pastList.replaceChildren(...past.map(row));
          moreButton.remove();
        },
      }, `지난 예배 ${past.length - PAST_LIMIT}개 더 보기`)
      : null;

    const calendar = renderCalendar({
      marked: servicesByDate(services),
      initialMonth: current?.service_date,
      onSelect: (iso) => {
        const found = services.find((s) => s.service_date === iso);
        if (found) location.hash = `#/s/${found.id}`;
        else if (canEdit) showCreate(iso);
      },
    });

    body.replaceChildren(...[
      h('p', { class: 'muted' }, canEdit
        ? '점이 있는 날짜를 누르면 그 예배로 이동하고, 빈 날짜를 누르면 그 날짜로 새 예배를 만듭니다.'
        : '점이 있는 날짜를 누르면 그 예배로 이동합니다.'),
      calendar,
      h('h2', { class: 'section-heading' }, `다가오는 예배 (${upcoming.length})`),
      upcoming.length
        ? h('ul', { class: 'service-list' }, upcoming.map(row))
        : h('p', { class: 'muted' }, '예정된 예배가 없습니다.'),
      past.length ? h('h2', { class: 'section-heading' }, `지난 예배 (${past.length})`) : null,
      past.length ? pastList : null,
      moreButton,
      !canEdit && !store.isDemo() && !services.length
        ? h('p', { class: 'muted' }, '예배를 만들려면 편집자 계정으로 로그인하세요.')
        : null,
    ].filter(Boolean));
  }

  function showCreate(date = today) {
    body.replaceChildren(renderForm({
      title: '새 예배 만들기',
      fields: serviceFields(services),
      values: { service_date: date, title: '순예배' },
      submitLabel: '만들기',
      onCancel: showSchedule,
      onSubmit: async (data) => {
        const created = await store.saveService(data);
        setDirty(false);
        invalidate({ services: true });
        toast('새 예배를 만들었습니다');
        location.hash = `#/s/${created.id}`;
      },
    }));
  }

  showSchedule();

  return h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { class: 'page-title' },
        icon('calendar', 'icon page-title__icon'),
        '예배 일정'),
      canEdit ? h('div', { class: 'page-head__actions' },
        h('button', {
          type: 'button',
          class: 'btn btn--primary',
          onClick: () => { if (confirmDiscard()) showCreate(); },
        }, '+ 새 예배 만들기')) : null),
    body);
}

function renderLogin() {
  if (store.isDemo()) {
    return h('div', { class: 'page page--narrow' },
      h('h1', { class: 'page-title' }, '로그인'),
      h('p', {}, '지금은 데모 모드라서 로그인 없이 바로 편집할 수 있습니다.'),
      h('a', { class: 'btn btn--primary', href: '#/' }, '처음 화면으로'));
  }

  const user = store.currentUser();
  if (user) {
    return h('div', { class: 'page page--narrow' },
      h('h1', { class: 'page-title' }, '로그인됨'),
      h('p', {}, `${user.email} 계정으로 로그인되어 있습니다.`),
      store.isEditor()
        ? h('p', {}, '편집 권한이 있습니다. 예배 내용을 추가하고 수정할 수 있습니다.')
        : h('p', { class: 'notice' }, '이 계정에는 아직 편집 권한이 없습니다. 관리자에게 권한을 요청해 주세요.'),
      h('div', { class: 'button-row' },
        h('a', { class: 'btn btn--primary', href: '#/' }, '처음 화면으로'),
        h('button', { type: 'button', class: 'btn', onClick: logout }, '로그아웃')));
  }

  return h('div', { class: 'page page--narrow' },
    h('h1', { class: 'page-title' }, '편집자 로그인'),
    h('p', { class: 'muted' }, '예배 내용을 보기만 할 때는 로그인하지 않아도 됩니다.'),
    renderForm({
      fields: [
        { name: 'email', label: '이메일', type: 'email', required: true, autocomplete: 'username' },
        { name: 'password', label: '비밀번호', type: 'password', required: true, autocomplete: 'current-password' },
      ],
      submitLabel: '로그인',
      onSubmit: async ({ email, password }) => {
        await store.signIn(email, password);
        setDirty(false);
        toast(store.isEditor() ? '로그인되었습니다' : '로그인되었지만 편집 권한이 없는 계정입니다');
        location.hash = '#/';
      },
    }));
}

function renderNotFound(message) {
  return h('div', { class: 'page' },
    h('h1', { class: 'page-title' }, message),
    h('a', { class: 'btn btn--primary', href: '#/' }, '처음 화면으로'));
}

// ───────────────────────────────────────────── Boot

async function boot() {
  try {
    await store.initStore();
  } catch (err) {
    console.error(err);
    app.replaceChildren(h('div', { class: 'fatal' },
      h('h1', {}, '서버에 연결하지 못했습니다'),
      h('p', {}, '인터넷 연결을 확인한 뒤 새로고침해 주세요.'),
      h('button', { type: 'button', class: 'btn btn--primary', onClick: () => location.reload() }, '새로고침')));
    return;
  }
  store.onAuthChange(() => {
    cache.content.clear();
    invalidate({ services: true });
    render();
  });
  render();
}

boot();
