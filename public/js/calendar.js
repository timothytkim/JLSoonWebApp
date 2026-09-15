// Month calendar with large day buttons. Used for picking a service date and for the schedule page.
import { h, toISODate, todayISO } from './util.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * selected: 'YYYY-MM-DD' | null
 * marked: Map<'YYYY-MM-DD', string[]> — dates that already have services (titles)
 * onSelect(iso, titlesOrNull)
 * Returns the element; call el.setSelected(iso) to move the highlight.
 */
export function renderCalendar({ selected = null, marked = new Map(), onSelect, initialMonth }) {
  const [startYear, startMonth] = (initialMonth || selected || todayISO()).split('-').map(Number);
  let year = startYear;
  let month = startMonth - 1;

  const title = h('p', { class: 'calendar__title', 'aria-live': 'polite' });
  const grid = h('div', { class: 'calendar__grid' });

  const showMonth = (y, m) => {
    const d = new Date(y, m, 1);
    year = d.getFullYear();
    month = d.getMonth();
    draw();
  };

  const el = h('div', { class: 'calendar' },
    h('div', { class: 'calendar__head' },
      h('button', { type: 'button', class: 'btn calendar__nav', 'aria-label': '이전 달', onClick: () => showMonth(year, month - 1) }, '‹'),
      title,
      h('button', { type: 'button', class: 'btn calendar__nav', 'aria-label': '다음 달', onClick: () => showMonth(year, month + 1) }, '›')),
    grid,
    h('div', { class: 'calendar__foot' },
      h('span', { class: 'calendar__legend' }, h('span', { class: 'calendar__dot', 'aria-hidden': 'true' }), '예배가 있는 날'),
      h('button', {
        type: 'button',
        class: 'btn calendar__today',
        onClick: () => {
          const [y, m] = todayISO().split('-').map(Number);
          showMonth(y, m - 1);
        },
      }, '오늘로 이동')));

  function draw() {
    title.textContent = `${year}년 ${month + 1}월`;
    const today = todayISO();
    const firstWeekday = new Date(year, month, 1).getDay();
    const dayCount = new Date(year, month + 1, 0).getDate();

    const cells = WEEKDAYS.map((name, i) =>
      h('span', { class: `calendar__weekday${i === 0 ? ' calendar__weekday--sun' : ''}`, 'aria-hidden': 'true' }, name));
    for (let i = 0; i < firstWeekday; i++) cells.push(h('span', { 'aria-hidden': 'true' }));

    for (let day = 1; day <= dayCount; day++) {
      const iso = toISODate(new Date(year, month, day));
      const titles = marked.get(iso) || null;
      const classes = ['calendar__day'];
      if ((firstWeekday + day - 1) % 7 === 0) classes.push('calendar__day--sun');
      if (iso === today) classes.push('is-today');
      if (titles) classes.push('is-marked');
      if (iso === selected) classes.push('is-selected');

      let label = `${month + 1}월 ${day}일`;
      if (iso === today) label += ', 오늘';
      if (titles) label += `, 예배: ${titles.join(', ')}`;
      if (iso === selected) label += ', 선택됨';

      cells.push(h('button', {
        type: 'button',
        class: classes.join(' '),
        'aria-label': label,
        onClick: () => onSelect?.(iso, titles),
      }, day));
    }
    grid.replaceChildren(...cells);
  }

  el.setSelected = (iso) => {
    selected = iso;
    draw();
  };

  draw();
  return el;
}
