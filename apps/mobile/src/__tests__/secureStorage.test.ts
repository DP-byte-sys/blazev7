const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));
import { chunkedSecureStorage as s } from '../lib/secureStorage';

beforeEach(() => mockStore.clear());

describe('chunkedSecureStorage', () => {
  it('round-trips values larger than one SecureStore chunk', async () => {
    const big = 'x'.repeat(5000) + 'END';
    await s.setItem('sb-abc-auth-token', big);
    expect(await s.getItem('sb-abc-auth-token')).toBe(big);
    for (const v of mockStore.values()) expect(v.length).toBeLessThanOrEqual(1800);
  });
  it('returns null for unknown keys', async () => {
    expect(await s.getItem('nope')).toBeNull();
  });
  it('removes stale chunks when a value shrinks', async () => {
    await s.setItem('k', 'y'.repeat(6000));
    await s.setItem('k', 'small');
    expect(await s.getItem('k')).toBe('small');
    expect([...mockStore.keys()].sort()).toEqual(['k.0', 'k.count']);
  });
  it('removeItem deletes everything', async () => {
    await s.setItem('k', 'z'.repeat(4000));
    await s.removeItem('k');
    expect(mockStore.size).toBe(0);
    expect(await s.getItem('k')).toBeNull();
  });
  it('treats an incomplete value as no session', async () => {
    await s.setItem('k', 'w'.repeat(4000));
    mockStore.delete('k.1');
    expect(await s.getItem('k')).toBeNull();
  });
  it('sanitises keys SecureStore would reject', async () => {
    await s.setItem('weird key/with:chars', 'v');
    expect(await s.getItem('weird key/with:chars')).toBe('v');
  });
});
