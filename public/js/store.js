// Data layer. Uses Supabase when configured, otherwise a browser-only demo store.
import { todayISO, resizeImage } from './util.js';

const CONTENT_TABLES = ['songs', 'passages', 'commentaries', 'announcements'];
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
const IMAGE_BUCKET = 'song-images';

let adapter = null;
let user = null;
let editor = false;
const authListeners = new Set();

export async function initStore() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    adapter = await createSupabaseAdapter(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    adapter = createLocalAdapter();
    editor = true;
  }
}

export const isDemo = () => adapter.demo;
export const isEditor = () => editor;
export const currentUser = () => user;
export const onAuthChange = (fn) => authListeners.add(fn);

export const signIn = (email, password) => adapter.signIn(email, password);
export const signOut = () => adapter.signOut();
export const listServices = () => adapter.listServices();
export const saveService = (service) => adapter.saveService(service);
export const deleteService = (id) => adapter.deleteService(id);
export const getContent = (serviceId) => adapter.getContent(serviceId);
export const saveItem = (table, item) => adapter.saveItem(table, item);
export const deleteItem = (table, id) => adapter.deleteItem(table, id);
export const reorderItems = (table, orderedIds) => adapter.reorderItems(table, orderedIds);

/** Resizes and stores an image; returns the value to keep in `image_paths`. */
export const uploadImage = (file, serviceId) => adapter.uploadImage(file, serviceId);
/** Best-effort removal of stored images (never throws). */
export const deleteImages = async (paths = []) => {
  if (!paths.length) return;
  try { await adapter.deleteImages(paths); } catch (err) { console.warn('Image cleanup failed', err); }
};
/** Displayable URL for a stored image path. Demo images are already data: URLs. */
export const imageUrl = (path) => (path.startsWith('data:') ? path : adapter.imageUrl(path));

// ───────────────────────────────────────────── Supabase

async function createSupabaseAdapter(url, key) {
  const { createClient } = await import(SUPABASE_JS);
  const db = createClient(url, key);
  const bucket = () => db.storage.from(IMAGE_BUCKET);

  const run = async (query) => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };

  // Serialize session updates so the editor check always finishes before listeners run.
  let pending = Promise.resolve();
  const applySession = (session) => {
    pending = pending.then(async () => {
      const nextUser = session?.user ?? null;
      if (nextUser?.id === user?.id) return;
      user = nextUser;
      editor = false;
      if (user) {
        const { data } = await db.from('editors').select('user_id').eq('user_id', user.id).maybeSingle();
        editor = Boolean(data);
      }
      authListeners.forEach((fn) => fn());
    });
    return pending;
  };

  const { data } = await db.auth.getSession();
  await applySession(data.session);
  // Supabase recommends not awaiting other client calls inside this callback.
  db.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => applySession(session), 0);
  });

  return {
    demo: false,

    async signIn(email, password) {
      const { data: result, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await applySession(result.session);
    },

    async signOut() {
      await db.auth.signOut();
      await applySession(null);
    },

    listServices: () => run(db.from('services').select('*').order('service_date', { ascending: false })),

    saveService({ id, title, service_date }) {
      const row = { title, service_date };
      return id
        ? run(db.from('services').update(row).eq('id', id).select().single())
        : run(db.from('services').insert(row).select().single());
    },

    async deleteService(id) {
      const songs = await run(db.from('songs').select('image_paths').eq('service_id', id));
      await run(db.from('services').delete().eq('id', id));
      await deleteImages(songs.flatMap((song) => song.image_paths || []));
    },

    async getContent(serviceId) {
      const lists = await Promise.all(CONTENT_TABLES.map((table) =>
        run(db.from(table).select('*').eq('service_id', serviceId).order('position').order('created_at'))));
      return Object.fromEntries(CONTENT_TABLES.map((table, i) => [table, lists[i]]));
    },

    saveItem(table, item) {
      const { id, created_at, updated_at, ...row } = item;
      return id
        ? run(db.from(table).update(row).eq('id', id).select().single())
        : run(db.from(table).insert(row).select().single());
    },

    deleteItem: (table, id) => run(db.from(table).delete().eq('id', id)),

    async reorderItems(table, orderedIds) {
      await Promise.all(orderedIds.map((id, position) => run(db.from(table).update({ position }).eq('id', id))));
    },

    async uploadImage(file, serviceId) {
      const blob = await resizeImage(file, { maxSize: 2000, quality: 0.88 });
      const path = `${serviceId}/${uid()}.jpg`;
      await run(bucket().upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
      return path;
    },

    deleteImages: (paths) => run(bucket().remove(paths.filter((p) => !p.startsWith('data:')))),

    imageUrl: (path) => bucket().getPublicUrl(path).data.publicUrl,
  };
}

// ───────────────────────────────────────────── Demo (localStorage)

const DEMO_KEY = 'soon-worship-demo-v1';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function createLocalAdapter() {
  let db = null;
  try { db = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { /* ignore */ }
  if (!db) db = seedData();

  const persist = () => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(db));
    } catch (err) {
      // Only a full quota is worth reporting; a missing localStorage just means no persistence.
      if (err?.name === 'QuotaExceededError') throw err;
    }
  };
  // Apply a change and persist it, rolling back if the browser storage is full.
  const commit = (mutate) => {
    const backup = JSON.stringify(db);
    try {
      const result = mutate();
      persist();
      return result;
    } catch (err) {
      db = JSON.parse(backup);
      throw err;
    }
  };
  try { persist(); } catch { /* storage full; keep running in memory */ }

  const now = () => new Date().toISOString();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const byPosition = (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at);

  const upsert = (table, data) => commit(() => {
    const existing = data.id && db[table].find((row) => row.id === data.id);
    if (existing) {
      Object.assign(existing, data, { updated_at: now() });
      return clone(existing);
    }
    const row = { ...data, id: uid(), created_at: now(), updated_at: now() };
    db[table].push(row);
    return clone(row);
  });

  return {
    demo: true,
    async signIn() {},
    async signOut() {},

    async listServices() {
      return clone([...db.services].sort((a, b) => b.service_date.localeCompare(a.service_date)));
    },
    async saveService(service) { return upsert('services', service); },
    async deleteService(id) {
      commit(() => {
        db.services = db.services.filter((s) => s.id !== id);
        for (const table of CONTENT_TABLES) db[table] = db[table].filter((row) => row.service_id !== id);
      });
    },

    async getContent(serviceId) {
      return Object.fromEntries(CONTENT_TABLES.map((table) =>
        [table, clone(db[table].filter((row) => row.service_id === serviceId).sort(byPosition))]));
    },
    async saveItem(table, item) { return upsert(table, item); },
    async deleteItem(table, id) {
      commit(() => { db[table] = db[table].filter((row) => row.id !== id); });
    },
    async reorderItems(table, orderedIds) {
      commit(() => orderedIds.forEach((id, position) => {
        const row = db[table].find((r) => r.id === id);
        if (row) row.position = position;
      }));
    },

    // Demo images live inside localStorage as data: URLs, so keep them small.
    async uploadImage(file) {
      const blob = await resizeImage(file, { maxSize: 1280, quality: 0.8 });
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    },
    async deleteImages() {},
    imageUrl: (path) => path,
  };
}

function seedData() {
  const serviceId = uid();
  const t = new Date().toISOString();
  const base = { service_id: serviceId, created_at: t, updated_at: t };
  return {
    services: [{ id: serviceId, title: '순예배 (예시)', service_date: todayISO(), created_at: t, updated_at: t }],
    songs: [{
      ...base, id: uid(), position: 0, title: '예시 찬양', image_paths: [],
      lyrics: '주님 앞에 함께 모여\n감사의 노래 부릅니다\n\n우리 마음 하나 되어\n주님만 바라봅니다',
    }],
    passages: [{
      ...base, id: uid(), position: 0, book: '요한복음', chapter: 3, verse_start: 16, verse_end: null,
      title: '하나님의 사랑',
      body: '16 하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라',
    }],
    commentaries: [{
      ...base, id: uid(), position: 0, title: '오늘 말씀 나눔',
      body: '이곳에 말씀 해설을 적습니다.\n\n빈 줄을 넣으면 문단이 나뉘어 읽기 편합니다.',
    }],
    announcements: [
      { ...base, id: uid(), position: 0, title: '다음 모임 안내', body: '다음 주 같은 시간, 같은 장소에서 모입니다.', is_important: true },
      { ...base, id: uid(), position: 1, title: '기도 제목 나눔', body: '나누고 싶은 기도 제목을 순장님께 알려 주세요.', is_important: false },
    ],
  };
}
