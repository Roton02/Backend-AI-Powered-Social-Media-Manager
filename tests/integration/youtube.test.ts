// Isolated YouTube connection/publishing tests. Google, Redis and Prisma are mocked: nothing is uploaded.
import express from 'express';
import config from '../../src/config';
import axios from 'axios';
import prisma from '../../src/shared/prisma';
const request = require('supertest');
import { decryptToken, encryptToken } from '../../src/app/modules/social/services/meta.service';
import { publishYoutube, videoDetails, isVideoUrl } from '../../src/app/modules/social/services/youtube.service';
import { oauthController } from '../../src/app/modules/social/controllers/oauth/oauth.controller';
import { redisConnection } from '../../src/shared/queue.service';
jest.mock('../../src/shared/queue.service', () => ({ redisConnection: { getdel: jest.fn(), get: jest.fn(), set: jest.fn().mockResolvedValue('OK'), del: jest.fn() } }));
jest.mock('axios');
jest.mock('../../src/shared/prisma', () => ({ __esModule: true, default: { socialAccount: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() } } }));
const ax = axios as any, db = prisma as any;
const app = express(); app.use(express.json());
app.use((req, _res, next) => { (req as any).user = { id: 'user' }; next(); });
app.get('/auth/:platform', oauthController.getAuthUrl); app.get('/callback/:platform', oauthController.handleCallback);
app.use((e: any, _q: any, r: any, _n: any) => r.status(e.statusCode || 500).json({ message: e.message }));
const upload = 'https://www.googleapis.com/auth/youtube.upload';
beforeEach(() => {
  jest.clearAllMocks(); process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  config.app.backendUrl = 'http://localhost:5000'; config.app.frontendUrl = 'http://localhost:3005';
  config.social.youtube_client_id = 'yt-id'; config.social.youtube_client_secret = 'yt-secret';
});

test('authorization URL asks for upload access with a refresh token and a browser-bound state', async () => {
  const response = await request(app).get('/auth/youtube').set('x-workspace-id', 'workspace');
  const url = new URL(response.body.result.url);
  expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(url.searchParams.get('client_id')).toBe('yt-id');
  expect(url.searchParams.get('scope')).toBe(`${upload} https://www.googleapis.com/auth/youtube.readonly`);
  expect(url.searchParams.get('access_type')).toBe('offline'); expect(url.searchParams.get('prompt')).toBe('consent');
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/v1/social/callback/youtube');
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(JSON.parse((redisConnection.set as jest.Mock).mock.calls[0][1])).toMatchObject({ provider: 'youtube' });
  config.social.youtube_client_id = undefined as any;
  expect((await request(app).get('/auth/youtube').set('x-workspace-id', 'workspace')).status).toBe(503);
});

test('callback saves the channel with encrypted access and refresh tokens', async () => {
  (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace', provider: 'youtube' }));
  ax.post.mockResolvedValue({ data: { access_token: 'yt-access', refresh_token: 'yt-refresh', expires_in: 3599, scope: `${upload} https://www.googleapis.com/auth/youtube.readonly` } });
  ax.get.mockResolvedValue({ data: { items: [{ id: 'UC123', snippet: { title: 'Pitret Channel' } }] } });
  db.socialAccount.findFirst.mockResolvedValue(null);
  const response = await request(app).get('/callback/youtube?state=s&code=c').set('Cookie', 'meta_oauth=s');
  expect(response.headers.location).toBe('http://localhost:3005/accounts?connected=youtube');
  const data = db.socialAccount.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ workspaceId: 'workspace', platform: 'YOUTUBE', externalAccountId: 'UC123', accountName: 'Pitret Channel', connectionStatus: 'CONNECTED', tokenExpiry: null });
  expect(data.settings.capabilities.publishing).toBe(true);
  expect(JSON.stringify(data)).not.toContain('yt-refresh'); expect(decryptToken(data.refreshToken)).toBe('yt-refresh');
});

test('a Google account without a channel gets a clear error and nothing is saved', async () => {
  (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace', provider: 'youtube' }));
  ax.post.mockResolvedValue({ data: { access_token: 'yt-access', refresh_token: 'yt-refresh', scope: upload } });
  ax.get.mockResolvedValue({ data: { items: [] } });
  const response = await request(app).get('/callback/youtube?state=s&code=c').set('Cookie', 'meta_oauth=s');
  expect(response.headers.location).toContain('error=youtube_no_channel'); expect(db.socialAccount.create).not.toHaveBeenCalled();
});

test('title comes from the first line and unsupported characters are removed', () => {
  expect(videoDetails('\n  My <new> video\nMore details')).toEqual({ title: 'My new video', description: '\n  My new video\nMore details' });
  expect(videoDetails('x'.repeat(150)).title).toHaveLength(100);
  expect(isVideoUrl('https://res.cloudinary.com/d/video/upload/v1/a.mp4')).toBe(true);
  expect(isVideoUrl('https://res.cloudinary.com/d/image/upload/v1/a.jpg')).toBe(false);
});

test('publishing refreshes access, uploads the video and returns the video ID', async () => {
  const stream = { destroy: jest.fn() };
  ax.post
    .mockResolvedValueOnce({ data: { access_token: 'fresh' } })
    .mockResolvedValueOnce({ headers: { location: 'https://upload.googleapis.com/session' } });
  ax.get.mockResolvedValue({ data: stream, headers: { 'content-length': '1234' } });
  ax.put.mockResolvedValue({ data: { id: 'vid123' } });
  const account = { id: 'acc', refreshToken: encryptToken('yt-refresh') };
  expect(await publishYoutube(account, 'Launch day\nDetails', 'https://res.cloudinary.com/d/video/upload/a.mp4')).toEqual({ id: 'vid123' });
  expect(ax.post.mock.calls[0][1].get('refresh_token')).toBe('yt-refresh');
  const [initUrl, meta, initOpts] = ax.post.mock.calls[1];
  expect(initUrl).toContain('uploadType=resumable');
  expect(meta).toEqual({ snippet: { title: 'Launch day', description: 'Launch day\nDetails', categoryId: '22' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } });
  expect(initOpts.headers.Authorization).toBe('Bearer fresh');
  expect(ax.put).toHaveBeenCalledWith('https://upload.googleapis.com/session', stream, expect.objectContaining({ headers: expect.objectContaining({ 'Content-Length': '1234' }) }));
});

test('revoked Google access marks the channel expired and reports a definite rejection', async () => {
  ax.post.mockRejectedValue({ response: { status: 400, data: { error: 'invalid_grant' } } });
  const error: any = await publishYoutube({ id: 'acc', refreshToken: encryptToken('yt-refresh') }, 'Hi', 'https://x/video/upload/a.mp4').catch(e => e);
  expect(error.metaError).toMatchObject({ status: 401, code: 'invalid_grant' });
  expect(db.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'acc' }, data: { connectionStatus: 'EXPIRED' } });
  expect(ax.get).not.toHaveBeenCalled();
});
