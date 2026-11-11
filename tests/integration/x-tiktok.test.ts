// Isolated X and TikTok connection/publishing tests. X, TikTok, Redis and Prisma are mocked: nothing is posted.
import express from 'express';
import { createHash } from 'crypto';
import config from '../../src/config';
import axios from 'axios';
import prisma from '../../src/shared/prisma';
const request = require('supertest');
import { decryptToken, encryptToken } from '../../src/app/modules/social/services/meta.service';
import { publishX } from '../../src/app/modules/social/services/x.service';
import { publishTiktok, chunkPlan } from '../../src/app/modules/social/services/tiktok.service';
import { oauthController } from '../../src/app/modules/social/controllers/oauth/oauth.controller';
import { redisConnection } from '../../src/shared/queue.service';
jest.mock('../../src/shared/queue.service', () => ({ redisConnection: { getdel: jest.fn(), get: jest.fn(), set: jest.fn().mockResolvedValue('OK'), del: jest.fn() } }));
jest.mock('axios');
jest.mock('../../src/shared/prisma', () => ({ __esModule: true, default: { socialAccount: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } } }));
const ax = axios as any, db = prisma as any;
const app = express(); app.use(express.json());
app.use((req, _res, next) => { (req as any).user = { id: 'user' }; next(); });
app.get('/auth/:platform', oauthController.getAuthUrl); app.get('/callback/:platform', oauthController.handleCallback);
app.use((e: any, _q: any, r: any, _n: any) => r.status(e.statusCode || 500).json({ message: e.message }));
const MB = 1024 * 1024;
const fresh = { accessExpiresAt: Date.now() + 3600_000 };
beforeEach(() => {
  jest.clearAllMocks(); process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  (redisConnection.set as jest.Mock).mockResolvedValue('OK');
  config.app.backendUrl = 'http://localhost:5000'; config.app.frontendUrl = 'http://localhost:3005';
  config.social.x_client_id = 'x-id'; config.social.x_client_secret = 'x-secret';
  config.social.tiktok_client_id = 'tt-key'; config.social.tiktok_client_secret = 'tt-secret';
});
const savedState = () => JSON.parse((redisConnection.set as jest.Mock).mock.calls[0][1]);

describe('X', () => {
  test('authorization URL uses PKCE S256, posting scopes and keeps the verifier server-side', async () => {
    const response = await request(app).get('/auth/x').set('x-workspace-id', 'workspace');
    const url = new URL(response.body.result.url);
    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize');
    expect(url.searchParams.get('scope')).toBe('tweet.read tweet.write users.read media.write offline.access');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/v1/social/callback/x');
    const state = savedState();
    expect(state.provider).toBe('x');
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(state.codeVerifier).digest('base64url'));
    expect(response.body.result.url).not.toContain(state.codeVerifier);
    config.social.x_client_secret = undefined as any;
    expect((await request(app).get('/auth/x').set('x-workspace-id', 'workspace')).status).toBe(503);
  });

  test('callback exchanges the code with the verifier and saves the profile with encrypted tokens', async () => {
    (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace', provider: 'x', codeVerifier: 'ver' }));
    ax.post.mockResolvedValue({ data: { access_token: 'x-access', refresh_token: 'x-refresh', expires_in: 7200, scope: 'tweet.read tweet.write users.read media.write offline.access' } });
    ax.get.mockResolvedValue({ data: { data: { id: '42', name: 'Pitret', username: 'pitret' } } });
    db.socialAccount.findFirst.mockResolvedValue(null);
    const response = await request(app).get('/callback/x?state=s&code=c').set('Cookie', 'meta_oauth=s');
    expect(response.headers.location).toBe('http://localhost:3005/accounts?connected=x');
    const [, body, opts] = ax.post.mock.calls[0];
    expect(body.get('code_verifier')).toBe('ver'); expect(opts.headers.Authorization).toMatch(/^Basic /);
    const data = db.socialAccount.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ platform: 'X', externalAccountId: '42', accountName: 'Pitret (@pitret)', connectionStatus: 'CONNECTED', tokenExpiry: null });
    expect(data.settings.capabilities.publishing).toBe(true);
    expect(JSON.stringify(data)).not.toContain('x-refresh'); expect(decryptToken(data.refreshToken)).toBe('x-refresh');
  });

  test('a TikTok state is never accepted on the X callback', async () => {
    (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace', provider: 'tiktok', codeVerifier: 'v' }));
    const response = await request(app).get('/callback/x?state=s&code=c').set('Cookie', 'meta_oauth=s');
    expect(response.headers.location).toContain('error=connection_failed'); expect(ax.post).not.toHaveBeenCalled();
  });

  test('publishes text with an uploaded image using a valid token', async () => {
    ax.get.mockResolvedValue({ data: Buffer.from('jpeg'), headers: { 'content-type': 'image/jpeg' } });
    ax.request.mockResolvedValueOnce({ data: { data: { id: 'm1' } } }).mockResolvedValueOnce({ data: { data: { id: 'p1' } } });
    expect(await publishX({ id: 'acc', token: 'tok', settings: fresh }, 'Hello', 'https://res.cloudinary.com/x.jpg')).toEqual({ id: 'p1' });
    expect(ax.post).not.toHaveBeenCalled();
    const [upload, post] = ax.request.mock.calls.map((c: any) => c[0]);
    expect(upload.url).toBe('https://api.x.com/2/media/upload'); expect(upload.data.get('media_category')).toBe('tweet_image');
    expect(post).toMatchObject({ url: 'https://api.x.com/2/tweets', data: { text: 'Hello', media: { media_ids: ['m1'] } }, headers: { Authorization: 'Bearer tok' } });
  });

  test('an expired access token is refreshed once and the rotated refresh token is saved', async () => {
    db.socialAccount.findUnique.mockResolvedValue({ id: 'acc', refreshToken: encryptToken('old-refresh'), accessToken: encryptToken('old'), settings: { capabilities: { publishing: true }, accessExpiresAt: 0 } });
    ax.post.mockResolvedValue({ data: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 7200 } });
    ax.request.mockResolvedValue({ data: { data: { id: 'p2' } } });
    await publishX({ id: 'acc', token: 'old', settings: { accessExpiresAt: 0 } }, 'Hi');
    expect(ax.post.mock.calls[0][1].get('refresh_token')).toBe('old-refresh');
    const saved = db.socialAccount.update.mock.calls[0][0].data;
    expect(decryptToken(saved.refreshToken)).toBe('new-refresh'); expect(saved.settings.capabilities.publishing).toBe(true);
    expect(ax.request.mock.calls[0][0].headers.Authorization).toBe('Bearer new-access');
    expect(redisConnection.del).toHaveBeenCalledWith('token-refresh:acc');
  });

  test('a revoked refresh token marks the account expired and nothing is posted', async () => {
    db.socialAccount.findUnique.mockResolvedValue({ id: 'acc', refreshToken: encryptToken('r'), accessToken: encryptToken('a'), settings: {} });
    ax.post.mockRejectedValue({ response: { status: 400, data: { error: 'invalid_request' } } });
    const error: any = await publishX({ id: 'acc', token: 'a', settings: {} }, 'Hi').catch(e => e);
    expect(error.metaError).toMatchObject({ status: 401 });
    expect(db.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'acc' }, data: { connectionStatus: 'EXPIRED' } });
    expect(ax.request).not.toHaveBeenCalled();
  });

  test('missing X API credits is reported as a definite rejection with a clear reason', async () => {
    ax.request.mockRejectedValue({ response: { status: 402, data: { title: 'CreditsDepleted', detail: 'no credits' } } });
    const error: any = await publishX({ id: 'acc', token: 't', settings: fresh }, 'Hi').catch(e => e);
    expect(error.metaError).toMatchObject({ status: 402, code: 'CreditsDepleted' });
    expect(error.metaError.message).toContain('API credits');
  });
});

describe('TikTok', () => {
  test('authorization URL uses the client key, comma scopes and a hex PKCE challenge', async () => {
    const url = new URL((await request(app).get('/auth/tiktok').set('x-workspace-id', 'workspace')).body.result.url);
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('client_key')).toBe('tt-key');
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.publish');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/v1/social/callback/tiktok');
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(savedState().codeVerifier).digest('hex'));
  });

  test('callback saves the creator with encrypted tokens and their TikTok name', async () => {
    (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace', provider: 'tiktok', codeVerifier: 'ver' }));
    ax.post
      .mockResolvedValueOnce({ data: { access_token: 'tt-access', refresh_token: 'tt-refresh', expires_in: 7200, open_id: 'open1', scope: 'user.info.basic,video.publish' } })
      .mockResolvedValueOnce({ data: { data: { creator_username: 'shop', creator_nickname: 'Shop', privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } });
    db.socialAccount.findFirst.mockResolvedValue(null);
    const response = await request(app).get('/callback/tiktok?state=s&code=c').set('Cookie', 'meta_oauth=s');
    expect(response.headers.location).toBe('http://localhost:3005/accounts?connected=tiktok');
    expect(ax.post.mock.calls[0][1].get('code_verifier')).toBe('ver');
    const data = db.socialAccount.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ platform: 'TIKTOK', externalAccountId: 'open1', accountName: 'Shop (@shop)', connectionStatus: 'CONNECTED' });
    expect(decryptToken(data.accessToken)).toBe('tt-access'); expect(JSON.stringify(data)).not.toContain('tt-refresh');
  });

  test('a token error returned with HTTP 200 fails the connection and saves nothing', async () => {
    (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace', provider: 'tiktok', codeVerifier: 'ver' }));
    ax.post.mockResolvedValue({ data: { error: 'invalid_grant', error_description: 'bad code' } });
    const response = await request(app).get('/callback/tiktok?state=s&code=c').set('Cookie', 'meta_oauth=s');
    expect(response.headers.location).toContain('error=connection_failed'); expect(db.socialAccount.create).not.toHaveBeenCalled();
  });

  test('chunk plan follows TikTok rules', () => {
    expect(chunkPlan(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 });
    expect(chunkPlan(64 * MB)).toEqual({ chunkSize: 64 * MB, count: 1 });
    expect(chunkPlan(95 * MB + 7)).toEqual({ chunkSize: 10 * MB, count: 9 });
  });

  test('uploads a video privately when public posting is not offered and returns once complete', async () => {
    const ok = (data: any) => ({ data: { data, error: { code: 'ok' } } });
    ax.post
      .mockResolvedValueOnce(ok({ privacy_level_options: ['FOLLOWER_OF_CREATOR', 'SELF_ONLY'], duet_disabled: true }))
      .mockResolvedValueOnce(ok({ publish_id: 'pub1', upload_url: 'https://upload.tiktok/u' }))
      .mockResolvedValueOnce(ok({ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [] }));
    ax.get.mockResolvedValue({ data: Buffer.alloc(1000) });
    ax.put.mockResolvedValue({ status: 201 });
    expect(await publishTiktok({ id: 'acc', token: 't', settings: fresh }, 'Caption', 'https://res.cloudinary.com/d/video/upload/a.mp4')).toEqual({ id: 'pub1' });
    expect(ax.post.mock.calls[1][1]).toMatchObject({ post_info: { title: 'Caption', privacy_level: 'SELF_ONLY', disable_duet: true }, source_info: { source: 'FILE_UPLOAD', video_size: 1000, chunk_size: 1000, total_chunk_count: 1 } });
    expect(ax.put.mock.calls[0][2].headers['Content-Range']).toBe('bytes 0-999/1000');
  });

  test('a TikTok rejection at init is a definite rejection and nothing is uploaded', async () => {
    ax.post
      .mockResolvedValueOnce({ data: { data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] }, error: { code: 'ok' } } })
      .mockRejectedValueOnce({ response: { status: 403, data: { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'Please review our integration guidelines' } } } });
    ax.get.mockResolvedValue({ data: Buffer.alloc(10) });
    const error: any = await publishTiktok({ id: 'acc', token: 't', settings: fresh }, 'Hi', 'https://x/video/upload/a.mp4').catch(e => e);
    expect(error.metaError).toMatchObject({ status: 403, code: 'unaudited_client_can_only_post_to_private_accounts' });
    expect(ax.put).not.toHaveBeenCalled();
  });

  test('a failed TikTok processing result is reported with its reason', async () => {
    const ok = (data: any) => ({ data: { data, error: { code: 'ok' } } });
    ax.post.mockResolvedValueOnce(ok({ privacy_level_options: ['SELF_ONLY'] })).mockResolvedValueOnce(ok({ publish_id: 'p', upload_url: 'u' })).mockResolvedValueOnce(ok({ status: 'FAILED', fail_reason: 'duration_check_failed' }));
    ax.get.mockResolvedValue({ data: Buffer.alloc(10) }); ax.put.mockResolvedValue({ status: 201 });
    const error: any = await publishTiktok({ id: 'acc', token: 't', settings: fresh }, 'Hi', 'https://x/video/upload/a.mp4').catch(e => e);
    expect(error.metaError).toMatchObject({ status: 422, code: 'duration_check_failed' });
  });
});
