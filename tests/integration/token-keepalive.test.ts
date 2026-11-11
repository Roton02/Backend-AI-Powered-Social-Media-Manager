// Token keep-alive. All platform calls are mocked: PASS_MOCKED.
import axios from 'axios';
import prisma from '../../src/shared/prisma';
import { runTokenKeepAlive } from '../../src/app/modules/social/services/token-keepalive.service';
import { publicAccount } from '../../src/app/modules/social/services/meta.service';
import { refreshTiktok } from '../../src/app/modules/social/services/tiktok.service';
import { freshAccessToken as youtubeAccessToken } from '../../src/app/modules/social/services/youtube.service';

jest.mock('axios');
jest.mock('../../src/shared/prisma', () => ({ __esModule: true, default: { socialAccount: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } } }));
jest.mock('../../src/shared/queue.service', () => ({ redisConnection: { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() } }));
jest.mock('../../src/app/modules/social/services/tiktok.service', () => ({ refreshTiktok: jest.fn() }));
jest.mock('../../src/app/modules/social/services/x.service', () => ({ refreshX: jest.fn() }));
jest.mock('../../src/app/modules/social/services/youtube.service', () => ({ freshAccessToken: jest.fn() }));

const db = prisma as any;
const DAY = 24 * 60 * 60 * 1000;
let encrypt: (v: string) => string;
beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  encrypt = (await import('../../src/app/modules/social/services/meta.service')).encryptToken;
});
const account = (platform: string, extra: any = {}) => ({ id: `acc-${platform}`, platform, connectionStatus: 'CONNECTED', accessToken: encrypt('access-secret'), refreshToken: encrypt('refresh-secret'), settings: {}, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  db.socialAccount.findUnique.mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, settings: { capabilities: { publishing: true } } }));
});

test('Meta: a valid Page token stores the data-access deadline; an invalid one is marked EXPIRED', async () => {
  db.socialAccount.findMany.mockResolvedValue([account('FACEBOOK')]);
  (axios.get as jest.Mock).mockResolvedValueOnce({ data: { data: { is_valid: true, expires_at: 0, data_access_expires_at: 1800000000 } } });
  expect(await runTokenKeepAlive()).toBe(1);
  expect(db.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'acc-FACEBOOK' }, data: { settings: { capabilities: { publishing: true }, dataAccessExpiresAt: 1800000000000, keepAliveAt: expect.any(Number) } } });

  jest.clearAllMocks();
  (axios.get as jest.Mock).mockResolvedValueOnce({ data: { data: { is_valid: false } } });
  await runTokenKeepAlive();
  expect(db.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'acc-FACEBOOK' }, data: { connectionStatus: 'EXPIRED' } });
});

test('a network error does not mark the account expired and is retried next run', async () => {
  db.socialAccount.findMany.mockResolvedValue([account('INSTAGRAM')]);
  (axios.get as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(await runTokenKeepAlive()).toBe(0);
  expect(db.socialAccount.update).not.toHaveBeenCalled();
  expect(log.mock.calls.flat().join(' ')).not.toMatch(/secret/);
  log.mockRestore();
});

test('TikTok is renewed weekly even while its access token is still valid; not again within the week', async () => {
  const tiktok = account('TIKTOK', { settings: { accessExpiresAt: Date.now() + DAY } });
  db.socialAccount.findMany.mockResolvedValue([tiktok]);
  db.socialAccount.findUnique.mockResolvedValue({ ...tiktok });
  (refreshTiktok as jest.Mock).mockResolvedValue({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 86400 });
  expect(await runTokenKeepAlive()).toBe(1);
  expect(refreshTiktok).toHaveBeenCalledWith('refresh-secret');

  jest.clearAllMocks();
  db.socialAccount.findMany.mockResolvedValue([{ ...tiktok, settings: { keepAliveAt: Date.now() - 2 * DAY } }]);
  expect(await runTokenKeepAlive()).toBe(0);
  expect(refreshTiktok).not.toHaveBeenCalled();
});

test('YouTube is refreshed daily; LinkedIn is skipped; expired accounts are not touched', async () => {
  db.socialAccount.findMany.mockResolvedValue([account('YOUTUBE'), account('LINKEDIN')]);
  expect(await runTokenKeepAlive()).toBe(1);
  expect(youtubeAccessToken).toHaveBeenCalledTimes(1);
  expect(db.socialAccount.findMany).toHaveBeenCalledWith({ where: { connectionStatus: { in: ['CONNECTED', 'LIMITED_ACCESS'] } } });
});

test('reconnectBy is the earliest platform deadline and is not set when none exists', () => {
  const soon = new Date(Date.now() + 3 * DAY);
  expect(publicAccount({ connectionStatus: 'CONNECTED', tokenExpiry: soon, settings: { dataAccessExpiresAt: Date.now() + 30 * DAY } }).reconnectBy).toBe(soon.toISOString());
  expect(publicAccount({ connectionStatus: 'CONNECTED', settings: {} }).reconnectBy).toBeNull();
  expect(JSON.stringify(publicAccount({ connectionStatus: 'CONNECTED', accessToken: 'x', refreshToken: 'y', settings: {} }))).not.toMatch(/accessToken|refreshToken/);
});
