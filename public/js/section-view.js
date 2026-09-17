// Section page: list of songs / passages / commentaries / announcements with inline editing.
import { h, toast, errorMessage, setDirty, confirmDiscard } from './util.js';
import { SECTIONS, itemHeading, itemMeta } from './sections.js';
import { renderForm } from './form.js';
import * as store from './store.js';
import { icon } from './icons.js';

export function renderSection({ service, content, sectionKey, reload, presentHref }) {
  const def = SECTIONS[sectionKey];
  const items = content[sectionKey];
  const canEdit = store.isEditor();
  let openForm = null; // { close } for the single form that may be open

  function openEditor(slot, restore, item) {
    if (openForm) {
      if (!confirmDiscard()) return;
      openForm.close();
    }
    const close = () => {
      openForm = null;
      setDirty(false);
      restore();
    };
    const form = renderForm({
      title: item ? `${def.noun} 수정` : `새 ${def.noun}`,
      fields: def.fields,
      values: item || {},
      submitLabel: item ? '저장' : '추가',
      onCancel: close,
      onSubmit: async (data) => {
        const uploaded = [];
        try {
          if (data.image_paths) {
            for (const file of data.image_paths.added) uploaded.push(await store.uploadImage(file, service.id));
            data.image_paths = [...data.image_paths.kept, ...uploaded];
          }
          const payload = item
            ? { id: item.id, ...data }
            : { ...data, service_id: service.id, position: items.reduce((max, i) => Math.max(max, i.position), -1) + 1 };
          await store.saveItem(sectionKey, payload);
        } catch (err) {
          store.deleteImages(uploaded); // don't leave orphaned files behind
          throw err;
        }
        if (data.image_paths) {
          store.deleteImages((item?.image_paths || []).filter((path) => !data.image_paths.includes(path)));
        }
        setDirty(false);
        toast(item ? '저장되었습니다' : '추가되었습니다');
        await reload();
      },
    });
    slot.replaceChildren(form);
    openForm = { close };
  }

  async function move(index, direction) {
    if (!confirmDiscard()) return;
    const ids = items.map((i) => i.id);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await store.reorderItems(sectionKey, ids);
      await reload();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  async function remove(item) {
    if (!confirm(`"${itemHeading(sectionKey, item)}"을(를) 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return;
    if (!confirmDiscard()) return;
    try {
      await store.deleteItem(sectionKey, item.id);
      store.deleteImages(item.image_paths || []);
      toast('삭제되었습니다');
      await reload();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  }

  function block(item, index) {
    const slot = h('article', { class: `block${item.is_important ? ' block--important' : ''}` });
    const body = item[def.bodyField];
    const images = item.image_paths || [];
    const meta = itemMeta(sectionKey, item);
    const numbered = sectionKey !== 'announcements' && items.length > 1;

    // replaceChildren stringifies null, so drop empty parts first.
    const restore = () => slot.replaceChildren(...[
      h('div', { class: 'block__head' },
        numbered ? h('span', { class: 'block__num' }, index + 1) : null,
        h('h2', { class: 'block__title' }, itemHeading(sectionKey, item)),
        item.is_important ? h('span', { class: 'badge' }, '중요') : null),
      meta ? h('p', { class: 'block__meta' }, meta) : null,
      body ? h('div', { class: `block__body block__body--${sectionKey}` }, body) : null,
      images.length ? h('div', { class: 'block__images' }, images.map((path, i) =>
        h('img', { src: store.imageUrl(path), alt: `${item.title} 이미지 ${i + 1}`, loading: 'lazy' }))) : null,
      h('div', { class: 'block__actions' },
        h('div', { class: 'block__actions-main' },
          h('a', { class: 'btn', href: presentHref(service.id, item.id) }, '크게 보기'),
          canEdit ? h('button', { type: 'button', class: 'btn', onClick: () => openEditor(slot, restore, item) }, '수정') : null),
        canEdit ? h('div', { class: 'block__actions-sub' },
          items.length > 1 ? [
            h('button', { type: 'button', class: 'btn', disabled: index === 0, onClick: () => move(index, -1) }, '↑ 위로'),
            h('button', { type: 'button', class: 'btn', disabled: index === items.length - 1, onClick: () => move(index, 1) }, '↓ 아래로'),
          ] : null,
          h('button', { type: 'button', class: 'btn btn--danger', onClick: () => remove(item) }, '삭제')) : null),
    ].filter(Boolean));

    restore();
    return slot;
  }

  const addSlot = h('div', { class: 'add-slot' });
  const restoreAdd = () => addSlot.replaceChildren(
    canEdit ? h('button', { type: 'button', class: 'add-button', onClick: () => openEditor(addSlot, restoreAdd) }, `+ ${def.noun} 추가하기`) : '');
  restoreAdd();

  return h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('a', { class: 'back-link', href: `#/s/${service.id}` }, '← ', service.title),
      h('h1', { class: 'page-title' },
        icon(def.icon, 'icon page-title__icon'),
        def.label),
      items.length || canEdit ? h('div', { class: 'page-head__actions' },
        items.length ? h('a', { class: 'btn btn--primary', href: presentHref(service.id, items[0].id) }, icon('play', 'icon btn__icon'), `${def.label} 크게 보기`) : null,
        canEdit ? h('button', { type: 'button', class: 'btn', onClick: () => openEditor(addSlot, restoreAdd) }, `+ ${def.noun} 추가`) : null) : null),
    items.length
      ? h('div', { class: 'blocks' }, items.map(block))
      : h('div', { class: 'empty' },
        h('p', {}, def.empty),
        !canEdit && !store.isDemo() ? h('p', { class: 'muted' }, '내용을 추가하려면 편집자 계정으로 로그인하세요.') : null),
    addSlot);
}
