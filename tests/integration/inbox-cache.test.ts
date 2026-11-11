// Inbox cache, attachments and emojis. Redis, MongoDB and Meta are mocked: PASS_MOCKED.
import prisma from '../../src/shared/prisma';
import { redisConnection as redis } from '../../src/shared/queue.service';
import { socketService } from '../../src/shared/socket.service';
import { metaRequest, connectedAccount } from '../../src/app/modules/social/services/meta.service';
import { conversationMessages, conversationList, conversationChanged, previewText, PAGE_SIZE } from '../../src/app/modules/social/services/inbox-cache.service';
import { attachmentsOf } from '../../src/app/modules/social/services/inbox-sync.service';
import { inboxService, recordDirectMessage } from '../../src/app/modules/social/services/inbox.service';

const store = new Map<string, string>();
jest.mock('../../src/shared/prisma', () => ({ __esModule: true, default: {
  conversation: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  socialAccount: { findMany: jest.fn() },
  workspace: { findUnique: jest.fn() },
  unifiedMessage: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
} }));
jest.mock('../../src/shared/queue.service', () => ({ queueService: { addJob: jest.fn() }, redisConnection: {
  get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
  set: jest.fn((k: string, v: string) => { if (!k.includes('lock')) store.set(k, v); return Promise.resolve('OK'); }),
  del: jest.fn((...keys: string[]) => { keys.forEach(k => store.delete(k)); return Promise.resolve(keys.length); }),
  eval: jest.fn(),
} }));
jest.mock('../../src/shared/socket.service', () => ({ socketService: { emitToWorkspace: jest.fn() } }));
jest.mock('../../src/app/modules/social/services/meta.service', () => ({ metaRequest: jest.fn(), connectedAccount: jest.fn(), decryptToken: jest.fn() }));

const db = prisma as any;
const now = Date.now();
const msg = (i: number) => ({ id: `m${i}`, conversationId: 'c1', text: `message ${i}`, direction: 'incoming', status: 'read', timestamp: new Date(now - i * 1000), mediaUrls: [] });

beforeEach(() => {
  jest.clearAllMocks(); store.clear();
  db.conversation.findFirst.mockResolvedValue({ id: 'c1' });
});

describe('recent messages cache', () => {
  test('first read loads 30 from the database, the next read comes from Redis only', async () => {
    db.unifiedMessage.findMany.mockResolvedValue(Array.from({ length: PAGE_SIZE + 1 }, (_, i) => msg(i)));
    const first = await conversationMessages('w1', 'c1');
    expect(first.messages).toHaveLength(30);
    expect(first.hasMore).toBe(true);
    expect(first.messages[29].text).toBe('message 0'); // oldest first, newest last
    jest.clearAllMocks();
    const second = await conversationMessages('w1', 'c1');
    expect(second).toEqual(JSON.parse(JSON.stringify(first)));
    expect(db.unifiedMessage.findMany).not.toHaveBeenCalled();
    expect(db.conversation.findFirst).not.toHaveBeenCalled();
  });

  test('another workspace never reads a cached conversation', async () => {
    db.unifiedMessage.findMany.mockResolvedValue([msg(1)]);
    await conversationMessages('w1', 'c1');
    db.conversation.findFirst.mockResolvedValue(null);
    await expect(conversationMessages('w2', 'c1')).rejects.toThrow('Conversation not found');
  });

  test('scrolling up reads the 30 messages before the oldest shown, scoped to the workspace', async () => {
    db.unifiedMessage.findMany.mockResolvedValue([msg(40), msg(41)]);
    const before = new Date(now - 39000).toISOString();
    const page = await conversationMessages('w1', 'c1', before);
    expect(page.hasMore).toBe(false);
    expect(db.unifiedMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'w1', conversationId: 'c1', kind: 'message', timestamp: { lt: new Date(before) } }, take: PAGE_SIZE + 1 }));
    expect(store.size).toBe(0); // older pages are not cached
  });

  test('a change clears the conversation and list keys and notifies open inboxes', async () => {
    store.set('inbox:recent:c1', '{}'); store.set('inbox:list:w1', '[]');
    await conversationChanged('w1', 'c1');
    expect(store.size).toBe(0);
    expect(socketService.emitToWorkspace).toHaveBeenCalledWith('w1', 'inbox-updated', { conversationId: 'c1' });
  });

  test('the list is cached and shows previews and unread counts', async () => {
    db.conversation.findMany.mockResolvedValue([{ id: 'c1', accountId: 'a1', platform: 'FACEBOOK', senderId: 's', customerName: 'Rita', lastMessageAt: new Date(), lastMessageText: '😀👍', lastMessageDirection: 'incoming' }]);
    db.socialAccount.findMany.mockResolvedValue([{ id: 'a1', accountName: 'My Shop' }]);
    db.unifiedMessage.groupBy.mockResolvedValue([{ conversationId: 'c1', _count: { _all: 2 } }]);
    const [row] = await conversationList('w1');
    expect(row).toMatchObject({ customerName: 'Rita', accountName: 'My Shop', lastMessageText: '😀👍', unread: 2 });
    jest.clearAllMocks();
    await conversationList('w1');
    expect(db.conversation.findMany).not.toHaveBeenCalled();
  });
});

describe('emojis and attachments', () => {
  test('stickers (thumbs-up) and files are typed; emoji text stays text', () => {
    expect(attachmentsOf({ message: '😍🔥', sticker: 'https://scontent.xx/sticker.png' })).toEqual([{ type: 'sticker', url: 'https://scontent.xx/sticker.png' }]);
    expect(attachmentsOf({ attachments: { data: [
      { mime_type: 'image/jpeg', image_data: { url: 'https://cdn/a.jpg' } },
      { mime_type: 'image/gif', image_data: { url: 'https://cdn/a.png', animated_gif_url: 'https://cdn/a.gif' } },
      { mime_type: 'video/mp4', video_data: { url: 'https://cdn/v.mp4' } },
      { mime_type: 'audio/mpeg', file_url: 'https://cdn/voice.mp3' },
      { mime_type: 'application/pdf', file_url: 'https://cdn/menu.pdf', name: 'menu.pdf' },
      { mime_type: 'image/png', file_url: 'http://insecure/x.png' },
    ] } })).toEqual([
      { type: 'image', url: 'https://cdn/a.jpg' }, { type: 'image', url: 'https://cdn/a.gif' }, { type: 'video', url: 'https://cdn/v.mp4' },
      { type: 'audio', url: 'https://cdn/voice.mp3' }, { type: 'file', url: 'https://cdn/menu.pdf', name: 'menu.pdf' },
    ]);
    expect(previewText('', [{ type: 'sticker', url: 'x' }])).toBe('Sticker');
    expect(previewText('Hi 👋', [])).toBe('Hi 👋');
  });

  test('an incoming emoji message is saved as text, updates the preview and clears the cache', async () => {
    store.set('inbox:recent:c1', '{}');
    db.unifiedMessage.findUnique.mockResolvedValue(null);
    db.conversation.findUnique.mockResolvedValue({ id: 'c1' });
    db.unifiedMessage.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data }));
    await recordDirectMessage({ id: 'a1', workspaceId: 'w1', platform: 'FACEBOOK' }, { mid: 'mid', customerId: 's', text: '😀', attachments: [], timestamp: new Date(), fromBusiness: false });
    expect(db.unifiedMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ text: '😀', attachments: [], mediaUrls: [] }) });
    expect(db.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: expect.objectContaining({ lastMessageText: '😀', lastMessageDirection: 'incoming' }) });
    expect(store.has('inbox:recent:c1')).toBe(false);
  });

  describe('sending', () => {
    const incoming = { id: 'in', workspaceId: 'w1', accountId: 'a1', conversationId: 'c1', senderId: 'cust', externalId: 'a1:message:mid', kind: 'message', direction: 'incoming', platform: 'FACEBOOK', timestamp: new Date(now - 60000) };
    beforeEach(() => {
      db.unifiedMessage.findFirst.mockResolvedValue(incoming);
      db.unifiedMessage.findUnique.mockResolvedValue(null);
      db.unifiedMessage.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'out', ...data }));
      db.unifiedMessage.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'out', ...data }));
      db.conversation.findFirst.mockResolvedValue({ id: 'c1' });
      db.workspace.findUnique.mockResolvedValue({ settings: {} });
      (connectedAccount as jest.Mock).mockResolvedValue({ id: 'a1', externalAccountId: 'page1', settings: { pageId: 'page1' } });
      (metaRequest as jest.Mock).mockResolvedValue({ message_id: 'm-out' });
    });

    test('a photo is sent as a Messenger attachment and stored for display', async () => {
      const photo = { type: 'image' as const, url: 'https://res.cloudinary.com/x/photo.jpg', name: 'photo.jpg' };
      await inboxService.replyInConversation('w1', 'c1', '', 'req-a', photo);
      expect(metaRequest).toHaveBeenCalledWith(expect.anything(), 'page1/messages', { recipient: { id: 'cust' }, message: { attachment: { type: 'image', payload: { url: photo.url, is_reusable: false } } }, messaging_type: 'RESPONSE' });
      expect(db.unifiedMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ attachments: [photo], mediaUrls: [photo.url], status: 'sending' }) });
      expect(db.conversation.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', workspaceId: 'w1' }, data: expect.objectContaining({ lastMessageText: 'Photo', lastMessageDirection: 'outgoing' }) });
    });

    test('emoji-only text is sent as text', async () => {
      await inboxService.replyInConversation('w1', 'c1', '👍🙏', 'req-e');
      expect(metaRequest).toHaveBeenCalledWith(expect.anything(), 'page1/messages', expect.objectContaining({ message: { text: '👍🙏' } }));
    });

    test('Instagram refuses PDF files before anything is sent', async () => {
      db.unifiedMessage.findFirst.mockResolvedValue({ ...incoming, platform: 'INSTAGRAM' });
      await expect(inboxService.replyInConversation('w1', 'c1', '', 'req-p', { type: 'file', url: 'https://res.cloudinary.com/x/menu.pdf' })).rejects.toThrow('photos, videos and audio');
      expect(metaRequest).not.toHaveBeenCalled();
    });

    test('a reply in another workspace finds nothing to answer', async () => {
      db.unifiedMessage.findFirst.mockResolvedValue(null);
      await expect(inboxService.replyInConversation('w2', 'c1', 'Hi', 'req-x')).rejects.toThrow('Conversation not found');
      expect(metaRequest).not.toHaveBeenCalled();
    });
  });
});
