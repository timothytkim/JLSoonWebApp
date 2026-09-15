// Small DOM + formatting helpers shared across views.

/** Create an element. Children may be nodes, strings, arrays, or null. Text is never parsed as HTML. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

let toastTimer;
export function toast(message, { error = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('toast--error', error);
  el.setAttribute('role', error ? 'alert' : 'status');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, error ? 6000 : 2500);
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const todayISO = () => toISODate(new Date());

/** '2026-09-20' → '2026년 9월 20일 (일)' */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const day = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${day})`;
}

/** Split text into blocks separated by blank lines. */
export function splitBlocks(text = '') {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** Downscale an image file to a JPEG blob (white background, so transparent PNGs stay readable). */
export async function resizeImage(file, { maxSize, quality }) {
  if (!file.type.startsWith('image/')) throw new UserError(`"${file.name}"은(는) 이미지 파일이 아닙니다.`);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new UserError(`"${file.name}" 이미지를 열 수 없습니다. JPG나 PNG 파일로 올려 주세요.`);
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new UserError('이미지를 처리하지 못했습니다.'))), 'image/jpeg', quality);
  });
}

/** An error whose message is already written for the user. */
export class UserError extends Error {}

export function errorMessage(err) {
  if (err instanceof UserError) return err.message;
  const message = err?.message || String(err);
  if (err?.name === 'QuotaExceededError') return '이 기기의 저장 공간이 부족합니다. 데모 모드에서는 이미지를 많이 넣을 수 없습니다.';
  if (/Bucket not found/i.test(message)) return '이미지 저장소가 아직 준비되지 않았습니다. 관리자가 supabase/schema.sql을 다시 실행해야 합니다.';
  if (/image_paths/i.test(message)) return '데이터베이스 업데이트가 필요합니다. 관리자가 supabase/schema.sql을 다시 실행해야 합니다.';
  if (/maximum allowed size|Payload too large/i.test(message)) return '이미지 파일이 너무 큽니다.';
  if (/Invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/Email not confirmed/i.test(message)) return '이메일 인증이 아직 완료되지 않았습니다.';
  if (err?.code === 'PGRST116' || err?.code === '42501' || /row-level security/i.test(message)) {
    return '저장할 권한이 없습니다. 편집자 계정으로 로그인했는지 확인해 주세요.';
  }
  if (/Failed to fetch|NetworkError/i.test(message)) return '인터넷 연결을 확인해 주세요.';
  return `문제가 발생했습니다: ${message}`;
}

// Tracks whether an edit form has unsaved input, so navigation can warn first.
let dirty = false;
export const setDirty = (value) => { dirty = value; };
export const isDirty = () => dirty;

/** Returns true when it is safe to discard the open form (nothing typed, or user agreed). */
export function confirmDiscard() {
  if (!dirty) return true;
  if (!confirm('저장하지 않은 내용이 있습니다. 저장하지 않고 계속할까요?')) return false;
  dirty = false;
  return true;
}

window.addEventListener('beforeunload', (event) => {
  if (dirty) event.preventDefault();
});
