import * as SecureStore from 'expo-secure-store';

// Supabase sessions are larger than SecureStore's ~2 KB per-value guidance, so values are split into chunks.
// Tokens live ONLY in SecureStore (never in ordinary SQLite tables, per architecture.md).
const CHUNK_SIZE = 1800;

const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');
const countKey = (k: string) => `${safe(k)}.count`;
const chunkKey = (k: string, i: number) => `${safe(k)}.${i}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const n = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await readCount(key);
    if (n === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null; // incomplete value: treat as no session
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = await readCount(key);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
    for (let i = 0; i < chunks.length; i++)
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]!);
    for (let i = chunks.length; i < previous; i++)
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    await SecureStore.setItemAsync(countKey(key), String(chunks.length)); // written last: marks the value complete
  },
  async removeItem(key: string): Promise<void> {
    const n = await readCount(key);
    await SecureStore.deleteItemAsync(countKey(key));
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  },
};
