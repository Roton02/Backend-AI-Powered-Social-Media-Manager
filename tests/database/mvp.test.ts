// Real Express, Prisma/MongoDB, bcrypt/JWT and Redis/BullMQ.
// Only outbound email, Meta and AI inference are mocked. No normal workers are started.
import '../../src/loadEnv';
import { featureFlags } from '../../src/config/features';
const otherFeatureTest = process.env.SCHEDULER_ONLY === '1' ? test.skip : test;
import { randomBytes, randomUUID, createHash, createHmac } from 'crypto';
import { MongoClient } from 'mongodb';
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import prisma from '../../src/shared/prisma';
import { queueService, redisConnection } from '../../src/shared/queue.service';
import { encryptToken, metaRequest } from '../../src/app/modules/social/services/meta.service';
import { processPublishPost, reconcilePublishing } from '../../src/workers/publishing.worker';
import { aiAgentService } from '../../src/app/modules/ai/services/ai.agent.service';
import { ollamaProvider } from '../../src/app/modules/ai/services/ollama.provider';
const request = require('supertest');
jest.mock('../../src/helpers/sendEmail', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/app/modules/social/services/meta.service', () => ({
  ...jest.requireActual('../../src/app/modules/social/services/meta.service'),
  metaRequest: jest.fn().mockRejectedValue(new Error('External delivery disabled in database tests')),
}));
jest.mock('../../src/app/modules/ai/services/ollama.provider', () => ({ ollamaProvider: { generateResponse: jest.fn() } }));
jest.setTimeout(60000);
const run = `mvp-${randomUUID()}`;
const emails = [0, 1].map(i => `${run}-${i}@example.invalid`);
let password = randomBytes(18).toString('hex');
const phones = [0, 1].map(i => `test-${run}-${i}`);
const mongo = new MongoClient(process.env.DATABASE_URL!);
const reader = new PrismaClient();
const users: any[] = [], workspaces: any[] = [], accounts: any[] = [];
const queues = new Map<string, Queue>();
const queueNames = new Map<string, string>();
let worker: Worker | undefined;
let before: Record<string, string> = {};
let getQueueSpy: jest.SpyInstance;
async function snapshot() {
  const result: Record<string, string> = {};
  for (const { name } of await mongo.db().listCollections().toArray()) {
    const rows = await mongo.db().collection(name).find().sort({ _id: 1 }).toArray();
    result[name] = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  return result;
}
const api = (method: string, path: string, user = 0, ws = user) => {
  let call = request(app)[method](`/api/v1${path}`);
  if (users[user]) call = call.set('Authorization', `Bearer ${users[user].accessToken}`);
  if (workspaces[ws]) call = call.set('x-workspace-id', workspaces[ws].id);
  return call;
};
async function waitUntil(fn: () => Promise<boolean>) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Timed out waiting for isolated test job');
}
beforeAll(async () => {
  await mongo.connect(); before = await snapshot();
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.FACEBOOK_CLIENT_SECRET = 'test-webhook-secret';
  getQueueSpy = jest.spyOn(queueService, 'getQueue').mockImplementation(async name => {
    if (!queues.has(name)) {
      const uniqueName = `${run}-${name}`;
      queueNames.set(name, uniqueName);
      queues.set(name, new Queue(uniqueName, { connection: redisConnection }));
    }
    return queues.get(name)!;
  });
});
afterAll(async () => {
  if (worker) await worker.close();
  // Only keys under this unguessable run's queue names are owned by this test.
  for (const [name, q] of queues) {
    await q.close();
    const prefix = `bull:${queueNames.get(name)}:`;
    let cursor = '0';
    do { const [next, keys] = await redisConnection.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100); cursor = next; if (keys.length) await redisConnection.del(...keys); } while (cursor !== '0');
  }
  // Re-discover only records whose exact generated identities belong to this run,
  // so cleanup also works if an HTTP assertion failed after an insert.
  const ownedUsers = await prisma.user.findMany({ where: { email: { in: emails } } });
  const ownedWorkspaces = await prisma.workspace.findMany({ where: { ownerId: { in: ownedUsers.map(u => u.id) }, slug: { in: [run + '-0', run + '-1'] } } });
  const workspaceIds = ownedWorkspaces.map(w => w.id);
  for (const model of [prisma.unifiedMessage, prisma.conversation, prisma.postStatus, prisma.aIKnowledgeBase, prisma.socialAccount, prisma.workspaceMember] as any[]) {
    await model.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  }
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.pendingUser.deleteMany({ where: { email: { in: emails }, phone: { in: phones } } });
  await prisma.otp.deleteMany({ where: { email: { in: emails } } });
  await prisma.user.deleteMany({ where: { id: { in: ownedUsers.map(u => u.id) }, email: { in: emails } } });
  const after = await snapshot();
  await reader.$disconnect(); await prisma.$disconnect(); await mongo.close();
  getQueueSpy?.mockRestore(); await redisConnection.quit();
  expect(after).toEqual(before); // Hashes only: proves all existing documents are unchanged.
});
test('registration and OTP verification persist real users; email delivery is mocked', async () => {
  for (let i = 0; i < 2; i++) {
    const body = { userName: run, email: emails[i], phone: phones[i], password, address: 'Test only' };
    const signup = await request(app).post('/api/v1/users/request').send(body);
    expect(signup.status).toBe(201);
    const pending = await reader.pendingUser.findUniqueOrThrow({ where: { email: emails[i] } });
    expect(pending.password === password).toBe(false);
    expect((await request(app).post('/api/v1/users/create').send({ email: emails[i], phone: 'wrong-phone', otp: pending.otpCode })).status).toBe(409);
    expect((await request(app).post('/api/v1/users/create').send({ email: emails[i], phone: phones[i], otp: 'wrong' })).status).toBe(401);
    const verified = await request(app).post('/api/v1/users/create').send({ email: emails[i], phone: phones[i], otp: pending.otpCode });
    expect(verified.status).toBe(201); users.push(verified.body.result);
    expect(verified.body.result.role).toBe('Client');
    expect(await reader.pendingUser.findUnique({ where: { email: emails[i] } })).toBeNull();
  }
});
test('real login, profile and blocked-user enforcement', async () => {
  expect((await request(app).post('/api/v1/auth/login').send({ email: emails[0], password: 'wrong' })).status).toBe(401);
  const login = await request(app).post('/api/v1/auth/login').send({ email: emails[0], password });
  expect(login.status).toBe(200); users[0] = login.body.result;
  const profile = await api('get', '/auth/profile'); expect(profile.status).toBe(200); expect(profile.body.result).not.toHaveProperty('password');
  await prisma.user.update({ where: { id: users[0].id }, data: { status: 'Blocked' } });
  expect((await api('get', '/auth/profile')).status).toBe(401);
  await prisma.user.update({ where: { id: users[0].id }, data: { status: 'Active' } });
});
otherFeatureTest('password reset persists new hash and rejects reset-token replay or normal authentication', async () => {
  expect((await request(app).post('/api/v1/auth/send-otp').send({ email: emails[0] })).status).toBe(200);
  const otp = await reader.otp.findUniqueOrThrow({ where: { email: emails[0] } });
  const verified = await request(app).post('/api/v1/auth/verify-otp').send({ email: emails[0], otp: otp.otpCode });
  expect(verified.status).toBe(200);
  const token = verified.body.result.forgetToken;
  expect((await request(app).get('/api/v1/auth/profile').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  const replacement = randomBytes(18).toString('hex');
  expect((await request(app).patch('/api/v1/auth/reset-password').set('Authorization', `Bearer ${token}`).send({ newPassword: replacement })).status).toBe(200);
  expect((await request(app).patch('/api/v1/auth/reset-password').set('Authorization', `Bearer ${token}`).send({ newPassword: password })).status).toBe(401);
  expect((await request(app).post('/api/v1/auth/login').send({ email: emails[0], password })).status).toBe(401);
  password = replacement;
  const login = await request(app).post('/api/v1/auth/login').send({ email: emails[0], password });
  expect(login.status).toBe(200); users[0] = login.body.result;
});
test('workspace creation persists nested membership; another tenant is denied', async () => {
  for (let i = 0; i < 2; i++) {
    const result = await api('post', '/workspace', i).send({ name: run, slug: run + '-' + i, ownerId: 'untrusted' });
    expect(result.status).toBe(201); workspaces.push(result.body.result);
    const membership = await reader.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: result.body.result.id, userId: users[i].id } } });
    expect(membership?.role).toBe('owner');
  }
  expect((await api('get', '/workspace', 1, 0)).status).toBe(403);
  expect((await api('get', '/workspace/my', 0)).body.result.id).toBe(workspaces[0].id);
  expect((await api('post', '/workspace').send({ name: run, slug: run + '-0' })).status).toBe(409);
});
otherFeatureTest('business knowledge and FAQ CRUD persist and cannot cross tenants', async () => {
  const settings = { ai_auto_reply: false, business_description: 'Test business', opening_hours: '9 to 5', delivery_information: 'Pickup only', return_policy: 'Ask staff', products_services: 'Test service', custom_instructions: 'Be concise' };
  expect((await api('patch', '/workspace').send({ settings })).status).toBe(200);
  expect((await reader.workspace.findUniqueOrThrow({ where: { id: workspaces[0].id } })).settings).toEqual(settings);
  const added = await api('post', '/ai/knowledge-base').send({ question: 'Hours?', answer: '9 to 5' });
  expect(added.status).toBe(201); const id = added.body.result.id;
  expect((await api('patch', `/ai/knowledge-base/${id}`, 1).send({ question: 'Hours?', answer: 'malicious' })).status).toBe(404);
  expect((await api('patch', `/ai/knowledge-base/${id}`).send({ question: 'Hours?', answer: '10 to 6' })).status).toBe(200);
  expect((await reader.aIKnowledgeBase.findUniqueOrThrow({ where: { id } })).answer).toBe('10 to 6');
  expect((await api('delete', `/ai/knowledge-base/${id}`, 1)).status).toBe(404);
  expect((await api('delete', `/ai/knowledge-base/${id}`)).status).toBe(200);
});
test('account tokens stay encrypted/redacted; unique account identity is enforced', async () => {
  for (let i = 0; i < 2; i++) accounts.push(await prisma.socialAccount.create({ data: { workspaceId: workspaces[i].id, platform: 'FACEBOOK', externalAccountId: `${run}-page-${i}`, accountName: run, accessToken: encryptToken('fixture-token'), connectionStatus: 'CONNECTED', settings: { capabilities: { publishing: true, messaging: true, comments: true } } } }));
  const response = await api('get', '/social/accounts'); expect(response.status).toBe(200); expect(response.body.result).toHaveLength(1); expect(response.body.result[0]).not.toHaveProperty('accessToken');
  const { id, createdAt, updatedAt, ...duplicate } = accounts[0];
  await expect(prisma.socialAccount.create({ data: duplicate })).rejects.toMatchObject({ code: 'P2002' });
});
test('draft, UTC schedule, cancellation and queue-loss recovery use real MongoDB/Redis', async () => {
  const draft = await api('post', '/publishing').send({ accountId: accounts[0].id, content: 'Test draft', draft: true });
  expect(draft.status).toBe(200);
  const schedule = new Date(Date.now() + 3600000).toISOString();
  const scheduled = await api('post', '/publishing').send({ accountId: accounts[0].id, content: 'Test schedule', scheduledAt: schedule });
  expect(scheduled.status).toBe(200);
  const row = await reader.postStatus.findUniqueOrThrow({ where: { jobId: scheduled.body.result.jobId } });
  expect(row.scheduledAt.toISOString()).toBe(schedule);
  let queue = await queueService.getQueue('publishing-queue');
  expect(await (await queue.getJob(row.jobId))!.getState()).toBe('delayed');
  await (await queue.getJob(row.jobId))!.remove(); await queue.close();
  queues.delete('publishing-queue'); // producer restart; durable post survives independently
  await reconcilePublishing(workspaces[0].id);
  queue = await queueService.getQueue('publishing-queue');
  expect(await (await queue.getJob(row.jobId))!.getState()).toBe('delayed');
  expect((await api('post', `/publishing/${row.jobId}/cancel`, 1).send({})).status).toBe(409);
  expect((await api('post', `/publishing/${row.jobId}/cancel`).send({})).status).toBe(200);
  await processPublishPost({ data: { postId: row.id } }); expect(metaRequest).not.toHaveBeenCalled();
});
test('delayed worker executes once; stale in-flight jobs become failed without resend (Meta mocked)', async () => {
  (metaRequest as jest.Mock).mockResolvedValue({ id: 'test-platform-result' });
  const due = new Date(Date.now() + 3000);
  const created = await api('post', '/publishing').send({ accountId: accounts[0].id, content: 'Isolated scheduled test', scheduledAt: due.toISOString() });
  expect(created.status).toBe(200);
  const row = await reader.postStatus.findUniqueOrThrow({ where: { jobId: created.body.result.jobId } });
  worker = new Worker(queueNames.get('publishing-queue')!, processPublishPost, { connection: redisConnection });
  await waitUntil(async () => (await reader.postStatus.findUniqueOrThrow({ where: { id: row.id } })).status === 'PUBLISHED');
  expect((await reader.postStatus.findUniqueOrThrow({ where: { id: row.id } })).publishedAt!.getTime()).toBeGreaterThanOrEqual(due.getTime());
  await Promise.all([processPublishPost({ data: { postId: row.id } }), processPublishPost({ data: { postId: row.id } })]);
  expect(metaRequest).toHaveBeenCalledTimes(1);
  await worker.close(); worker = undefined;
  const stale = await prisma.postStatus.create({ data: { workspaceId: workspaces[0].id, accountId: accounts[0].id, platform: 'FACEBOOK', content: 'Stale test', jobId: randomUUID(), mediaUrls: [], status: 'PROCESSING', updatedAt: new Date(Date.now() - 11 * 60000) } });
  await reconcilePublishing(workspaces[0].id);
  expect((await reader.postStatus.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('FAILED');
  expect(metaRequest).toHaveBeenCalledTimes(1); (metaRequest as jest.Mock).mockClear();
});
otherFeatureTest('signed incoming events persist, deduplicate and isolate; takeover suppresses AI', async () => {
  const payload = { object: 'page', entry: [{ id: accounts[0].externalAccountId, messaging: [{ sender: { id: run + '-customer' }, recipient: { id: accounts[0].externalAccountId }, timestamp: Date.now(), message: { mid: run + '-message', text: 'Hours?' } }] }] };
  const raw = JSON.stringify(payload);
  const signature = 'sha256=' + createHmac('sha256', process.env.FACEBOOK_CLIENT_SECRET!).update(raw).digest('hex');
  for (let i = 0; i < 2; i++) expect((await request(app).post('/api/v1/social/webhooks/facebook').set('Content-Type', 'application/json').set('x-hub-signature-256', signature).send(raw)).status).toBe(200);
  const incoming = await reader.unifiedMessage.findMany({ where: { workspaceId: workspaces[0].id } }); expect(incoming).toHaveLength(1);
  expect((await api('get', '/social/conversations', 1)).body.result).toHaveLength(0);
  const conversationId = incoming[0].conversationId!;
  expect((await api('patch', `/social/conversations/${conversationId}/takeover`, 1).send({ enabled: true })).status).toBe(404);
  expect((await api('patch', `/social/conversations/${conversationId}/takeover`).send({ enabled: true })).status).toBe(200);
  expect((await reader.conversation.findUniqueOrThrow({ where: { id: conversationId } })).humanTakeover).toBe(true);
  await aiAgentService.processMessage(incoming[0].id, workspaces[0].id); expect(ollamaProvider.generateResponse).not.toHaveBeenCalled(); expect(metaRequest).not.toHaveBeenCalled();
  (metaRequest as jest.Mock).mockResolvedValue({ message_id: 'test-reply' });
  const requestId = randomUUID();
  for (let i = 0; i < 2; i++) expect((await api('post', `/social/inbox/${incoming[0].id}/reply`).send({ text: 'Test manual reply', requestId })).status).toBe(200);
  expect(metaRequest).toHaveBeenCalledTimes(1);
  expect((await api('patch', `/social/inbox/${incoming[0].id}/read`).send({})).status).toBe(200);
  expect((await api('post', `/social/inbox/${incoming[0].id}/reply`).send({ text: 'Test manual reply', requestId })).status).toBe(200);
  expect(metaRequest).toHaveBeenCalledTimes(1);
  expect(await reader.unifiedMessage.count({ where: { workspaceId: workspaces[0].id, direction: 'outgoing', status: 'sent' } })).toBe(1);
});

(process.env.RUN_DB_BROWSER === '1' ? test : test.skip)('real browser logs in through actual backend and persists a draft in MongoDB', async () => {
  const puppeteer = require('puppeteer');
  const { spawn } = require('child_process');
  const path = require('path');
  const net = require('net');
  const frontend = path.resolve(__dirname, '../../../Frontend');
  if (!require('fs').existsSync(path.join(frontend, '.next/BUILD_ID'))) throw new Error('Build Frontend before running test:db:browser.');
  const reservation = net.createServer();
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const frontendPort = reservation.address().port;
  await new Promise<void>(resolve => reservation.close(resolve));
  const web = spawn(process.execPath, [path.join(frontend, 'node_modules/next/dist/bin/next'), 'start', '--port', String(frontendPort)], { cwd: frontend, stdio: 'ignore' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const backendUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const origin = `http://localhost:${frontendPort}`;
  let browser: any;
  try {
    await waitUntil(async () => { try { return (await fetch(origin + '/sign-in')).ok; } catch { return false; } });
    browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Dhaka");
    const errors: string[] = []; page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', async (req: any) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith('/socket.io')) return req.abort();
      if (!url.pathname.startsWith('/api/v1/')) return req.continue();
      // Forward to the real ephemeral Express server; no API fixtures or synthesized success.
      // The proxy avoids changing the frontend .env or its baked-in backend address.
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'authorization,content-type,x-workspace-id', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE' } });
      try {
        const headers: Record<string, string> = {};
        for (const key of ['authorization', 'content-type', 'x-workspace-id']) if (req.headers()[key]) headers[key] = req.headers()[key];
        const response = await fetch(backendUrl + url.pathname + url.search, { method: req.method(), headers, body: req.postData() });
        await req.respond({ status: response.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }, body: await response.text() });
      } catch { await req.abort(); }
    });
    await page.goto(origin + '/sign-in');
    await page.type('#email', emails[0]); await page.type('#password', password); await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('sign-in') && document.body.innerText.includes('Dashboard'));
    await page.goto(origin + '/create-post');
    await page.waitForSelector(`input[type="checkbox"][value="${accounts[0].id}"]`);
    await page.click(`input[type="checkbox"][value="${accounts[0].id}"]`);
    await page.type('textarea', 'browser-' + run);
    await page.evaluate(() => (Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Save draft') as HTMLButtonElement).click());
    await page.waitForFunction(() => (document.querySelector('textarea') as HTMLTextAreaElement)?.value === '');
    const saved = await reader.postStatus.findFirst({ where: { workspaceId: workspaces[0].id, content: 'browser-' + run } });
    expect(saved?.status).toBe('DRAFT'); expect(saved?.accountId).toBe(accounts[0].id);
    await page.click(`input[type="checkbox"][value="${accounts[0].id}"]`); // successful saves clear the selection
    await page.type('textarea', 'browser-schedule-' + run);
    await page.evaluate(() => {
      const input = document.querySelector('input[type="datetime-local"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2030-01-15T12:30');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Schedule post'));
    await page.evaluate(() => (Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Schedule post') as HTMLButtonElement).click());
    await page.waitForFunction(() => (document.querySelector('textarea') as HTMLTextAreaElement)?.value === '');
    const scheduled = await reader.postStatus.findFirstOrThrow({ where: { workspaceId: workspaces[0].id, content: 'browser-schedule-' + run } });
    expect(scheduled.status).toBe('PENDING');
    expect(scheduled.scheduledAt.toISOString()).toBe('2030-01-15T06:30:00.000Z');
    await page.goto(origin + '/posts');
    await page.waitForFunction((text: string) => document.body.innerText.includes(text), {}, 'browser-schedule-' + run);
    await page.evaluate((text: string) => {
      const article = Array.from(document.querySelectorAll('article')).find(a => a.textContent?.includes(text))!;
      (Array.from(article.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Cancel') as HTMLButtonElement).click();
    }, 'browser-schedule-' + run);
    await waitUntil(async () => (await reader.postStatus.findUniqueOrThrow({ where: { id: scheduled.id } })).status === 'CANCELLED');
    expect(errors).toEqual([]);
  } finally {
    if (browser) await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    web.kill();
  }
});

otherFeatureTest('batched comment events persist under the correct tenant and comment replies stay isolated (Meta mocked)', async () => {
  const payload = { object: 'page', entry: accounts.map((account, index) => ({
    id: account.externalAccountId, time: Math.floor(Date.now() / 1000),
    changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: `${run}-comment-${index}`, from: { id: `${run}-commenter-${index}` }, message: 'Test comment' } }],
  })) };
  const raw = JSON.stringify(payload);
  const signature = 'sha256=' + createHmac('sha256', process.env.FACEBOOK_CLIENT_SECRET!).update(raw).digest('hex');
  expect((await request(app).post('/api/v1/social/webhooks/facebook').set('Content-Type', 'application/json').set('x-hub-signature-256', signature).send(raw)).status).toBe(200);
  const own = await api('get', '/social/comments');
  const other = await api('get', '/social/comments', 1);
  expect(own.body.result).toHaveLength(1); expect(other.body.result).toHaveLength(1);
  expect(own.body.result[0].workspaceId).toBe(workspaces[0].id);
  expect(other.body.result[0].workspaceId).toBe(workspaces[1].id);
  const commentId = own.body.result[0].id;
  expect((await api('post', `/social/comments/${commentId}/reply`, 1).send({ text: 'Wrong tenant', requestId: randomUUID() })).status).toBe(409);
  (metaRequest as jest.Mock).mockClear().mockResolvedValue({ id: 'fixture-comment-reply' });
  expect((await api('post', `/social/comments/${commentId}/reply`).send({ text: 'Test reply', requestId: randomUUID() })).status).toBe(200);
  expect(metaRequest).toHaveBeenCalledWith(expect.anything(), `${run}-comment-0/comments`, { message: 'Test reply' });
});


(featureFlags.aiAutomation && process.env.SCHEDULER_ONLY !== '1' ? test : test.skip)('AI reads saved business facts and persists its response; unknown answers persist human takeover (providers mocked)', async () => {
  const conversation = await reader.conversation.findUniqueOrThrow({ where: { accountId_senderId: { accountId: accounts[0].id, senderId: run + '-customer' } } });
  expect((await api('patch', '/workspace').send({ settings: { ai_auto_reply: true, opening_hours: '9 to 5' } })).status).toBe(200);
  expect((await api('patch', `/social/conversations/${conversation.id}/takeover`).send({ enabled: false })).status).toBe(200);
  const message = await prisma.unifiedMessage.create({ data: { workspaceId: workspaces[0].id, accountId: accounts[0].id, conversationId: conversation.id, platform: 'FACEBOOK', externalId: `${accounts[0].id}:message:${run}-ai`, senderId: conversation.senderId, text: 'Hours?', mediaUrls: [], timestamp: new Date() } });
  (ollamaProvider.generateResponse as jest.Mock).mockResolvedValue('{"factIndex":0}');
  (metaRequest as jest.Mock).mockClear().mockResolvedValue({ message_id: 'fixture-ai-reply' });
  await aiAgentService.processMessage(message.id, workspaces[0].id);
  const saved = await reader.unifiedMessage.findUniqueOrThrow({ where: { id: message.id } });
  expect(saved.aiProcessed).toBe(true); expect(saved.aiSuggestion).toBe('9 to 5');
  expect(await reader.unifiedMessage.count({ where: { workspaceId: workspaces[0].id, direction: 'ai', status: 'sent', text: '9 to 5' } })).toBe(1);
  const unknown = await prisma.unifiedMessage.create({ data: { workspaceId: workspaces[0].id, accountId: accounts[0].id, conversationId: conversation.id, platform: 'FACEBOOK', externalId: `${accounts[0].id}:message:${run}-unknown`, senderId: conversation.senderId, text: 'Where is my order?', mediaUrls: [], timestamp: new Date() } });
  (ollamaProvider.generateResponse as jest.Mock).mockResolvedValue('{"factIndex":-1}');
  await aiAgentService.processMessage(unknown.id, workspaces[0].id);
  expect((await reader.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).humanTakeover).toBe(true);
  expect(metaRequest).toHaveBeenCalledTimes(1);
});
