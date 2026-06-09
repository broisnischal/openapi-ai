import localforage from 'localforage';

const store = localforage.createInstance({
  name: 'openapi-agent',
  storeName: 'spec_cache',
  description: 'Cached spec data for fast initial load',
});

interface CacheEntry<T> { data: T; expiry: number; }

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const item = await store.getItem<CacheEntry<T>>(key);
    if (!item) return null;
    if (Date.now() > item.expiry) { store.removeItem(key).catch(() => {}); return null; }
    return item.data;
  } catch { return null; }
}

export async function cacheSet<T>(key: string, data: T, ttlMs = 300_000): Promise<void> {
  try { await store.setItem(key, { data, expiry: Date.now() + ttlMs }); } catch { /**/ }
}

export async function cacheInvalidateSpec(): Promise<void> {
  try {
    const keys = await store.keys();
    await Promise.all(keys.filter(k => k.startsWith('spec_')).map(k => store.removeItem(k)));
  } catch { /**/ }
}
