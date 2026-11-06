// 衣橱持久化：保存在浏览器 IndexedDB（照片也能存，空间比 localStorage 大得多）。
import { STARTER_ITEMS } from './wardrobe.js';

const DB = 'xiaoyou-wardrobe';
const STORE = 'items';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

export async function loadItems() {
  const items = await tx('readonly', (s) => s.getAll());
  const ids = new Set(items.map((i) => i.id));
  const merged = [...STARTER_ITEMS.filter((i) => !ids.has(i.id)), ...items];
  return merged.filter((i) => !i.deleted);
}
export const saveItem = (item) => tx('readwrite', (s) => s.put(item));
export const deleteItem = (item) =>
  item.builtin ? tx('readwrite', (s) => s.put({ ...item, deleted: true })) : tx('readwrite', (s) => s.delete(item.id));

const HISTORY_KEY = 'xiaoyou-outfit-history';
export function recentWorn() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').slice(-2).flat(); } catch { return []; }
}
export function recordWorn(ids) {
  let h = [];
  try { h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch {}
  h.push(ids);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-14)));
}
