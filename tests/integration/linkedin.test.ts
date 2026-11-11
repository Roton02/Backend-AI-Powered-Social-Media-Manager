// Isolated LinkedIn connection/publishing tests. LinkedIn, Redis and Prisma are mocked: nothing is posted.
import express from 'express';
import config from '../../src/config';
import axios from 'axios';
import prisma from '../../src/shared/prisma';
const request = require('supertest');
import { decryptToken } from '../../src/app/modules/social/services/meta.service';
import { escapeLinkedinText, publishLinkedin } from '../../src/app/modules/social/services/linkedin.service';
import { oauthController } from '../../src/app/modules/social/controllers/oauth/oauth.controller';
import { redisConnection } from '../../src/shared/queue.service';
jest.mock('../../src/shared/queue.service', () => ({ redisConnection: { getdel: jest.fn(), get: jest.fn(), set: jest.fn().mockResolvedValue('OK'), del: jest.fn() } }));
jest.mock('axios');
jest.mock('../../src/shared/prisma', () => ({ __esModule: true, default: { socialAccount: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() } } }));
const ax = axios as any, db = prisma as any;
const app = express(); app.use(express.json());
app.use((req, _res, next) => { (req as any).user = { id: 'user' }; next(); });
app.get('/auth/:platform', oauthController.getAuthUrl); app.get('/callback/:platform', oauthController.handleCallback);
app.get('/selection', oauthController.getSelection); app.post('/selection', oauthController.confirmSelection);
app.use((e: any, _q: any, r: any, _n: any) => r.status(e.statusCode || 500).json({ message: e.message }));
beforeEach(() => {
  jest.clearAllMocks(); process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  config.app.backendUrl = 'http://localhost:5000'; config.app.frontendUrl = 'http://localhost:3005';
  config.social.linkedin_client_id = 'li-id'; config.social.linkedin_client_secret = 'li-secret';
  config.social.linkedin_pages_client_id = 'pages-id'; config.social.linkedin_pages_client_secret = 'pages-secret';
});

test('authorization URL requests member posting scopes with a browser-bound state', async () => {
  const response = await request(app).get('/auth/linkedin').set('x-workspace-id', 'workspace');
  expect(response.status).toBe(200);
  const url = new URL(response.body.result.url);
  expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
  expect(url.searchParams.get('scope')).toBe('openid profile w_member_social');
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/v1/social/callback/linkedin');
  expect(url.searchParams.get('state')).toHaveLength(64);
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(JSON.parse((redisConnection.set as jest.Mock).mock.calls[0][1])).toMatchObject({ workspaceId: 'workspace', provider: 'linkedin' });
});

test('missing LinkedIn credentials give a clear unavailable message', async () => {
  config.social.linkedin_client_id = undefined as any;
  expect((await request(app).get('/auth/linkedin').set('x-workspace-id', 'workspace')).status).toBe(503);
});

test('callback saves the member with an encrypted token and publishing capability', async () => {
  (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace', provider: 'linkedin' }));
  ax.post.mockResolvedValue({ data: { access_token: 'li-secret-token', expires_in: 5184000, scope: 'openid,profile,w_member_social' } });
  ax.get.mockResolvedValue({ data: { sub: 'abc123', name: 'Taimur Roton' } });
  db.socialAccount.findFirst.mockResolvedValue(null);
  const response = await request(app).get('/callback/linkedin?state=s&code=c').set('Cookie', 'meta_oauth=s');
  expect(response.status).toBe(302); expect(response.headers.location).toBe('http://localhost:3005/accounts?connected=linkedin');
  const data = db.socialAccount.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ workspaceId: 'workspace', platform: 'LINKEDIN', externalAccountId: 'abc123', accountName: 'Taimur Roton', connectionStatus: 'CONNECTED' });
  expect(data.settings).toEqual({ capabilities: { publishing: true, messaging: false, comments: false }, authorUrn: 'urn:li:person:abc123' });
  expect(data.accessToken).not.toContain('li-secret-token'); expect(decryptToken(data.accessToken)).toBe('li-secret-token');
});

test('a Facebook state is never accepted on the LinkedIn callback', async () => {
  (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace' }));
  const response = await request(app).get('/callback/linkedin?state=s&code=c').set('Cookie', 'meta_oauth=s');
  expect(response.headers.location).toContain('error=connection_failed');
  expect(ax.post).not.toHaveBeenCalled(); expect(db.socialAccount.create).not.toHaveBeenCalled();
});

test('reserved characters are escaped so LinkedIn keeps the full text', () => {
  expect(escapeLinkedinText('Sale (50%) #deal @you')).toBe('Sale \\(50%\\) \\#deal \\@you');
});

test('publishes text with an uploaded image as the member and returns the post URN', async () => {
  const account = { id: 'acc', token: 't', externalAccountId: 'abc123', settings: { authorUrn: 'urn:li:person:abc123' } };
  ax.request
    .mockResolvedValueOnce({ data: { value: { uploadUrl: 'https://upload.example/u', image: 'urn:li:image:1' } } })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ headers: { 'x-restli-id': 'urn:li:share:9' }, data: {} });
  ax.get.mockResolvedValue({ data: Buffer.from('jpeg') });
  expect(await publishLinkedin(account, 'Hello (world)', 'https://res.cloudinary.com/x.jpg')).toEqual({ id: 'urn:li:share:9' });
  const post = ax.request.mock.calls[2][0];
  expect(post.url).toBe('https://api.linkedin.com/rest/posts');
  expect(post.data).toMatchObject({ author: 'urn:li:person:abc123', commentary: 'Hello \\(world\\)', visibility: 'PUBLIC', content: { media: { id: 'urn:li:image:1' } } });
  expect(post.headers['LinkedIn-Version']).toMatch(/^\d{6}$/);
});

test('a LinkedIn rejection keeps its reason for the worker and marks expired tokens', async () => {
  ax.request.mockRejectedValue({ response: { status: 401, data: { serviceErrorCode: 65601, message: 'Token revoked' } } });
  const error: any = await publishLinkedin({ id: 'acc', token: 't', externalAccountId: 'abc' }, 'Hi').catch(e => e);
  expect(error.metaError).toEqual({ status: 401, code: 65601, message: 'Token revoked' });
  expect(db.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'acc' }, data: { connectionStatus: 'EXPIRED' } });
});

test('Page connection uses the separate Pages app and organization scopes', async () => {
  const url = new URL((await request(app).get('/auth/linkedin-pages').set('x-workspace-id', 'workspace')).body.result.url);
  expect(url.searchParams.get('client_id')).toBe('pages-id');
  expect(url.searchParams.get('scope')).toBe('r_organization_admin w_organization_social');
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/v1/social/callback/linkedin-pages');
  config.social.linkedin_pages_client_id = undefined as any;
  expect((await request(app).get('/auth/linkedin-pages').set('x-workspace-id', 'workspace')).status).toBe(503);
});

test('Page callback offers only Pages the member can post for, without exposing the token', async () => {
  (redisConnection.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ userId: 'user', workspaceId: 'workspace', provider: 'linkedin-pages' }));
  ax.post.mockResolvedValue({ data: { access_token: 'org-secret-token', expires_in: 5184000, scope: 'r_organization_admin,w_organization_social' } });
  ax.get.mockImplementation(async (url: string) => url.endsWith('/organizationAcls')
    ? { data: { elements: [{ organization: 'urn:li:organization:1', role: 'ADMINISTRATOR' }, { organization: 'urn:li:organization:2', role: 'ANALYST' }] } }
    : { data: { localizedName: 'Pitret Solutions' } });
  const response = await request(app).get('/callback/linkedin-pages?state=s&code=c').set('Cookie', 'meta_oauth=s');
  expect(response.headers.location).toMatch(/\/accounts\?selection=[a-f0-9]{64}$/);
  const stored = (redisConnection.set as jest.Mock).mock.calls.find(c => String(c[0]).startsWith('selection:'))![1];
  expect(stored).not.toContain('org-secret-token');
  (redisConnection.get as jest.Mock).mockResolvedValue(stored);
  const list = await request(app).get('/selection?selection=' + 'a'.repeat(64)).set('x-workspace-id', 'workspace');
  expect(list.body.result).toEqual([{ id: 'urn:li:organization:1', name: 'Pitret Solutions', instagram: null }]);
  expect(JSON.stringify(list.body)).not.toContain('org-secret-token');
  expect((await request(app).get('/selection?selection=' + 'a'.repeat(64)).set('x-workspace-id', 'other')).status).toBe(403);
});

test('confirming a Page saves it as a LinkedIn account that posts as the organization', async () => {
  const session = { userId: 'user', workspaceId: 'workspace', provider: 'linkedin-pages', pages: [{ id: 'urn:li:organization:1', name: 'Pitret Solutions' }], accessToken: 'org-secret-token', expires: null, scope: 'r_organization_admin w_organization_social' };
  (redisConnection.get as jest.Mock).mockResolvedValue(require('../../src/app/modules/social/services/meta.service').encryptToken(JSON.stringify(session)));
  db.socialAccount.findFirst.mockResolvedValue(null);
  const response = await request(app).post('/selection').set('x-workspace-id', 'workspace').send({ selection: 'a'.repeat(64), pageIds: ['urn:li:organization:1'] });
  expect(response.status).toBe(200);
  const data = db.socialAccount.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ platform: 'LINKEDIN', externalAccountId: 'urn:li:organization:1', accountName: 'Pitret Solutions (Page)', connectionStatus: 'CONNECTED' });
  expect(data.settings).toEqual({ capabilities: { publishing: true, messaging: false, comments: false }, authorUrn: 'urn:li:organization:1', kind: 'page' });
  expect(decryptToken(data.accessToken)).toBe('org-secret-token');
  expect((await request(app).post('/selection').set('x-workspace-id', 'workspace').send({ selection: 'a'.repeat(64), pageIds: ['urn:li:organization:9'] })).status).toBe(400);
});

test('Page posts use the organization as author and image owner', async () => {
  ax.request
    .mockResolvedValueOnce({ data: { value: { uploadUrl: 'https://upload.example/u', image: 'urn:li:image:2' } } })
    .mockResolvedValueOnce({ data: {} })
    .mockResolvedValueOnce({ headers: { 'x-restli-id': 'urn:li:share:10' }, data: {} });
  ax.get.mockResolvedValue({ data: Buffer.from('jpeg') });
  await publishLinkedin({ id: 'acc', token: 't', externalAccountId: 'urn:li:organization:1', settings: { authorUrn: 'urn:li:organization:1', kind: 'page' } }, 'Hi', 'https://res.cloudinary.com/x.jpg');
  expect(ax.request.mock.calls[0][0].data).toEqual({ initializeUploadRequest: { owner: 'urn:li:organization:1' } });
  expect(ax.request.mock.calls[2][0].data.author).toBe('urn:li:organization:1');
});
