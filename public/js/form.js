// Generic, large-type edit form built from field definitions.
import { h, toast, errorMessage, setDirty, confirmDiscard, formatDate, todayISO } from './util.js';
import { BIBLE_BOOKS } from './sections.js';
import { imageUrl } from './store.js';
import { renderCalendar } from './calendar.js';

let formCount = 0;

/**
 * fields: [{ name, label, type: text|textarea|number|date|email|password|checkbox, required, hint, ... }]
 * onSubmit(data) may throw; errors are shown and the form stays open.
 */
export function renderForm({ title, fields, values = {}, submitLabel = '저장', onSubmit, onCancel, autofocus = true }) {
  const formId = ++formCount;
  const controls = {};
  const grid = h('div', { class: 'form__fields' });

  for (const field of fields) {
    const id = `f${formId}-${field.name}`;
    const hintId = field.hint ? `${id}-hint` : null;

    if (field.type === 'calendar') {
      // An always-visible month calendar instead of a small native date input.
      let value = values[field.name] || todayISO();
      const shown = h('p', { class: 'calendar-field__value', 'aria-live': 'polite' });
      const warning = h('p', { class: 'calendar-field__warning' });
      const update = () => {
        shown.textContent = formatDate(value);
        const existing = field.marked?.get(value);
        warning.textContent = existing ? `이 날짜에 이미 "${existing.join('", "')}" 예배가 있습니다.` : '';
        warning.hidden = !existing;
      };
      const calendar = renderCalendar({
        selected: value,
        marked: field.marked,
        onSelect: (iso) => {
          value = iso;
          setDirty(true);
          calendar.setSelected(iso);
          update();
        },
      });
      update();
      controls[field.name] = { get value() { return value; } };
      grid.append(h('div', { class: 'field field--full' },
        h('p', { class: 'field__label' }, field.label),
        shown,
        warning,
        calendar));
      continue;
    }

    if (field.type === 'images') {
      // Existing paths stay as strings; new files are kept as File objects until the form is saved.
      const images = { kept: [...(values[field.name] || [])], added: [] };
      const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, id });
      const thumbs = h('div', { class: 'image-grid' });
      const thumb = (src, index, onRemove) => h('figure', { class: 'thumb' },
        h('img', { src, alt: `이미지 ${index + 1}` }),
        h('button', { type: 'button', class: 'btn btn--danger thumb__remove', onClick: onRemove }, '삭제'));
      const draw = () => thumbs.replaceChildren(
        ...images.kept.map((path, i) => thumb(imageUrl(path), i, () => {
          images.kept.splice(i, 1);
          setDirty(true);
          draw();
        })),
        ...images.added.map((added, i) => thumb(added.url, images.kept.length + i, () => {
          URL.revokeObjectURL(added.url);
          images.added.splice(i, 1);
          draw();
        })));
      picker.addEventListener('change', () => {
        for (const file of picker.files) images.added.push({ file, url: URL.createObjectURL(file) });
        picker.value = '';
        setDirty(true);
        draw();
      });
      draw();
      controls[field.name] = images;
      grid.append(h('div', { class: 'field field--full' },
        h('p', { class: 'field__label' }, field.label, h('span', { class: 'field__optional' }, ' (선택)')),
        field.hint ? h('p', { class: 'field__hint' }, field.hint) : null,
        thumbs,
        h('button', { type: 'button', class: 'btn field__add-image', onClick: () => picker.click() }, '+ 이미지 추가'),
        picker));
      continue;
    }

    if (field.type === 'checkbox') {
      const input = h('input', { type: 'checkbox', id, name: field.name });
      input.checked = Boolean(values[field.name]);
      controls[field.name] = input;
      grid.append(h('label', { class: 'field field--check', for: id }, input, h('span', {}, field.label)));
      continue;
    }

    let control;
    if (field.type === 'textarea') {
      control = h('textarea', { id, name: field.name, rows: field.rows || 6, required: field.required, placeholder: field.placeholder, 'aria-describedby': hintId });
      control.addEventListener('input', () => autoGrow(control));
    } else {
      control = h('input', {
        id,
        name: field.name,
        type: field.type || 'text',
        required: field.required,
        placeholder: field.placeholder,
        min: field.min,
        list: field.list,
        autocomplete: field.autocomplete || (field.list ? 'off' : null),
        inputmode: field.type === 'number' ? 'numeric' : null,
        'aria-describedby': hintId,
      });
    }
    control.value = values[field.name] ?? '';
    controls[field.name] = control;

    grid.append(h('div', { class: `field field--${field.width || 'full'}` },
      h('label', { class: 'field__label', for: id },
        field.label,
        !field.required && field.type !== 'password' ? h('span', { class: 'field__optional' }, ' (선택)') : null),
      field.hint ? h('p', { class: 'field__hint', id: hintId }, field.hint) : null,
      control));
  }

  const submitButton = h('button', { type: 'submit', class: 'btn btn--primary' }, submitLabel);
  const form = h('form', { class: 'form' },
    title ? h('h3', { class: 'form__title' }, title) : null,
    fields.some((f) => f.list === 'bible-books')
      ? h('datalist', { id: 'bible-books' }, BIBLE_BOOKS.map((book) => h('option', { value: book })))
      : null,
    grid,
    h('div', { class: 'form__actions' },
      submitButton,
      onCancel ? h('button', {
        type: 'button',
        class: 'btn',
        onClick: () => { if (confirmDiscard()) onCancel(); },
      }, '취소') : null));

  form.addEventListener('input', () => setDirty(true));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = {};
    for (const field of fields) {
      const control = controls[field.name];
      if (field.type === 'images') data[field.name] = { kept: control.kept, added: control.added.map((a) => a.file) };
      else if (field.type === 'checkbox') data[field.name] = control.checked;
      else if (field.type === 'number') data[field.name] = control.value === '' ? null : Number(control.value);
      else if (field.type === 'password') data[field.name] = control.value;
      else data[field.name] = control.value.trim();
    }

    submitButton.disabled = true;
    submitButton.textContent = '저장 중…';
    try {
      await onSubmit(data);
      setDirty(false);
    } catch (err) {
      toast(errorMessage(err), { error: true });
      if (form.isConnected) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
    }
  });

  // Once attached: size textareas to content, then focus the first field.
  requestAnimationFrame(() => {
    if (!form.isConnected) return;
    form.querySelectorAll('textarea').forEach(autoGrow);
    if (autofocus) {
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      form.querySelector('input:not([type=checkbox]), textarea')?.focus({ preventScroll: true });
    }
  });

  return form;
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 4}px`;
}
