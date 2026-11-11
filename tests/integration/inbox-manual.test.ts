// Manual inbox (Messenger + Instagram DMs). Meta is mocked: PASS_MOCKED, no real messages are read or sent.
import prisma from '../../src/shared/prisma';
import { metaRequest, connectedAccount } from '../../src/app/modules/social/services/meta.service';
import { syncAccountInbox, syncInboxes, canSyncInbox } from '../../src/app/modules/social/services/inbox-sync.service';
import { inboxService } from '../../src/app/modules/social/services/inbox.service';

jest.mock('../../src/shared/prisma', () => ({ __esModule: true, default: {
  socialAccount: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  conversation: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  workspace: { findUnique: jest.fn() },
  unifiedMessage: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
} }));
jest.mock('../../src/shared/queue.service', () => ({ queueService: { addJob: jest.fn() }, redisConnection: { set: jest.fn().mockResolvedValue('OK'), del: jest.fn(), eval: jest.fn() } }));
jest.mock('../../src/shared/socket.service', () => ({ socketService: { emitToWorkspace: jest.fn() } }));
jest.mock('../../src/app/modules/social/services/meta.service', () => ({ metaRequest: jest.fn(), connectedAccount: jest.fn(), decryptToken: jest.fn(() => 'page-token') }));

const db = prisma as any;
let messages: any[] = [], conversations: any[] = [];
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const fb = { id: 'acc-fb', workspaceId: 'w1', platform: 'FACEBOOK', externalAccountId: 'page1', accessToken: 'enc', connectionStatus: 'CONNECTED', settings: { capabilities: { messaging: true }, pageId: 'page1', inboxSyncedAt: now - 60000 } };
const ig = { ...fb, id: 'acc-ig', platform: 'INSTAGRAM', externalAccountId: 'ig1', settings: { capabilities: { messaging: true }, pageId: 'page1' } };

beforeEach(() => {
  jest.clearAllMocks(); messages = []; conversations = [];
  db.unifiedMessage.findUnique.mockImplementation(({ where }: any) => Promise.resolve(messages.find(m => m.externalId === where.externalId) || null));
  db.unifiedMessage.findFirst.mockImplementation(({ where }: any) => Promise.resolve(messages.find(m => (where.platformMessageId ? m.platformMessageId === where.platformMessageId : m.id === where.id)) || null));
  db.unifiedMessage.create.mockImplementation(({ data }: any) => { const row = { id: `m${messages.length}`, ...data }; messages.push(row); return Promise.resolve(row); });
  db.unifiedMessage.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'out', ...data }));
  db.conversation.findUnique.mockImplementation(({ where }: any) => Promise.resolve(conversations.find(c => c.accountId === where.accountId_senderId.accountId && c.senderId === where.accountId_senderId.senderId) || null));
  db.conversation.create.mockImplementation(({ data }: any) => { const row = { id: `c${conversations.length}`, ...data }; conversations.push(row); return Promise.resolve(row); });
  db.conversation.update.mockImplementation(({ where, data }: any) => { const row = conversations.find(c => c.id === where.id); Object.assign(row, data); return Promise.resolve(row); });
  db.conversation.updateMany.mockResolvedValue({ count: 1 });
  db.socialAccount.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'acc-ig' ? ig : fb));
});

const thread = (msgs: any[], updatedAgo = 1000) => ({ data: [{ updated_time: iso(updatedAgo), participants: { data: [{ id: 'page1', name: 'My Shop' }, { id: 'cust1', name: 'Rita Customer' }] }, messages: { data: msgs } }] });

test('sync imports customer DMs and replies sent from other Meta apps into one conversation', async () => {
  (metaRequest as jest.Mock).mockResolvedValue(thread([
    { id: 'mid2', created_time: iso(2000), from: { id: 'page1' }, message: 'We have it in blue' },
    { id: 'mid1', created_time: iso(5000), from: { id: 'cust1' }, message: 'Is this in stock?' },
  ]));
  expect(await syncAccountInbox(fb)).toBe(2);
  expect((metaRequest as jest.Mock).mock.calls[0][1]).toMatch(/^page1\/conversations\?platform=messenger/);
  expect(conversations).toHaveLength(1);
  expect(conversations[0]).toMatchObject({ workspaceId: 'w1', senderId: 'cust1', customerName: 'Rita Customer', aiEnabled: false });
  expect(messages.map(m => [m.text, m.direction, m.status])).toEqual([['Is this in stock?', 'incoming', 'unread'], ['We have it in blue', 'outgoing', 'sent']]);
  expect(conversations[0].lastIncomingAt.getTime()).toBe(new Date(iso(5000)).getTime());
  expect(db.socialAccount.update).toHaveBeenCalledWith({ where: { id: 'acc-fb' }, data: { settings: expect.objectContaining({ inboxError: null, inboxSyncedAt: expect.any(Number) }) } });
});

test('sync is idempotent and never re-imports a reply the app already sent', async () => {
  messages.push({ id: 'sent', accountId: 'acc-fb', externalId: 'out:acc-fb:req', platformMessageId: 'mid2', direction: 'outgoing' });
  const response = thread([{ id: 'mid2', created_time: iso(2000), from: { id: 'page1' }, message: 'Hi' }, { id: 'mid1', created_time: iso(5000), from: { id: 'cust1' }, message: 'Hello' }]);
  (metaRequest as jest.Mock).mockResolvedValue(response);
  expect(await syncAccountInbox(fb)).toBe(1);
  expect(await syncAccountInbox(fb)).toBe(0);
  expect(messages).toHaveLength(2);
});

test('Instagram DMs are read through the linked Page; first sync imports history as read', async () => {
  (metaRequest as jest.Mock).mockResolvedValue({ data: [{ updated_time: iso(1000), participants: { data: [{ id: 'ig1', username: 'myshop' }, { id: 'igcust', username: 'rita' }] }, messages: { data: [{ id: 'igmid', created_time: iso(3000), from: { id: 'igcust' }, message: 'Price?' }] } }] });
  await syncAccountInbox(ig);
  expect((metaRequest as jest.Mock).mock.calls[0][1]).toMatch(/^page1\/conversations\?platform=instagram/);
  expect(conversations[0]).toMatchObject({ senderId: 'igcust', customerName: 'rita', platform: 'INSTAGRAM' });
  expect(messages[0].status).toBe('read');
});

test('a Meta failure is recorded on the account without tokens and nothing is saved', async () => {
  (metaRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { metaError: { status: 403, code: 10, message: 'Permission denied' } }));
  await expect(syncAccountInbox(fb)).rejects.toBeTruthy();
  const saved = db.socialAccount.update.mock.calls[0][0].data.settings;
  expect(saved.inboxError).toBe('Meta: Permission denied (code 10)');
  expect(JSON.stringify(saved)).not.toContain('page-token');
  expect(messages).toHaveLength(0);
});

test('workspace sync only touches that workspace and skips accounts without DM permission', async () => {
  db.socialAccount.findMany.mockResolvedValue([fb, { ...fb, id: 'nomsg', settings: { capabilities: { messaging: false } } }]);
  (metaRequest as jest.Mock).mockResolvedValue({ data: [] });
  await syncInboxes('w1');
  expect(db.socialAccount.findMany).toHaveBeenCalledWith({ where: expect.objectContaining({ workspaceId: 'w1' }) });
  expect(metaRequest).toHaveBeenCalledTimes(1);
  expect(canSyncInbox({ ...fb, connectionStatus: 'EXPIRED' })).toBe(false);
});

describe('manual replies', () => {
  const incoming = { id: 'in', workspaceId: 'w1', accountId: 'acc-fb', conversationId: 'c0', senderId: 'cust1', externalId: 'acc-fb:message:mid1', kind: 'message', direction: 'incoming', platform: 'FACEBOOK', timestamp: new Date(now - 60000) };
  beforeEach(() => {
    db.unifiedMessage.findFirst.mockImplementation(({ where }: any) => Promise.resolve(where.workspaceId === 'w1' ? incoming : null));
    db.conversation.findFirst.mockResolvedValue({ id: 'c0' });
    db.workspace.findUnique.mockResolvedValue({ settings: {} });
    (connectedAccount as jest.Mock).mockResolvedValue({ id: 'acc-fb', externalAccountId: 'page1', settings: { pageId: 'page1' }, token: 't' });
  });

  test('sends to the customer and stores the platform message ID', async () => {
    (metaRequest as jest.Mock).mockResolvedValue({ message_id: 'mid-out' });
    await inboxService.sendReply('w1', 'in', 'Yes, in stock', 'req1');
    expect(metaRequest).toHaveBeenCalledWith(expect.anything(), 'page1/messages', { recipient: { id: 'cust1' }, message: { text: 'Yes, in stock' }, messaging_type: 'RESPONSE' });
    expect(db.unifiedMessage.update).toHaveBeenCalledWith({ where: { id: expect.any(String) }, data: { status: 'sent', platformMessageId: 'mid-out' } });
  });

  test('Instagram replies go through the linked Page', async () => {
    db.unifiedMessage.findFirst.mockResolvedValue({ ...incoming, platform: 'INSTAGRAM', accountId: 'acc-ig' });
    (connectedAccount as jest.Mock).mockResolvedValue({ id: 'acc-ig', externalAccountId: 'ig1', settings: { pageId: 'page1' }, token: 't' });
    (metaRequest as jest.Mock).mockResolvedValue({ message_id: 'x' });
    await inboxService.sendReply('w1', 'in', 'Hi', 'req2');
    expect(metaRequest).toHaveBeenCalledWith(expect.anything(), 'page1/messages', { recipient: { id: 'cust1' }, message: { text: 'Hi' } });
  });

  test('outside the 24-hour window nothing is sent', async () => {
    db.unifiedMessage.findFirst.mockResolvedValue({ ...incoming, timestamp: new Date(now - 25 * 3600 * 1000) });
    await expect(inboxService.sendReply('w1', 'in', 'Hi', 'req3')).rejects.toThrow('24 hours');
    expect(metaRequest).not.toHaveBeenCalled();
    expect(db.unifiedMessage.create).not.toHaveBeenCalled();
  });

  test('a Meta rejection is final (failed); a network error stays uncertain', async () => {
    (metaRequest as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { metaError: { status: 400, code: 10, subcode: 2018278 } }));
    await expect(inboxService.sendReply('w1', 'in', 'Hi', 'req4')).rejects.toThrow('24-hour');
    expect(db.unifiedMessage.update).toHaveBeenLastCalledWith({ where: { id: expect.any(String) }, data: { status: 'failed' } });
    (metaRequest as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    await expect(inboxService.sendReply('w1', 'in', 'Hi', 'req5')).rejects.toThrow('Could not confirm');
    expect(db.unifiedMessage.update).toHaveBeenLastCalledWith({ where: { id: expect.any(String) }, data: { status: 'uncertain' } });
  });

  test('another workspace cannot reply to this conversation', async () => {
    await expect(inboxService.sendReply('w2', 'in', 'Hi', 'req6')).rejects.toThrow('connected account');
    expect(metaRequest).not.toHaveBeenCalled();
  });

  test('Instagram replies over 1000 characters are refused before sending', async () => {
    db.unifiedMessage.findFirst.mockResolvedValue({ ...incoming, platform: 'INSTAGRAM' });
    await expect(inboxService.sendReply('w1', 'in', 'a'.repeat(1001), 'req7')).rejects.toThrow('1000');
    expect(metaRequest).not.toHaveBeenCalled();
  });
});
