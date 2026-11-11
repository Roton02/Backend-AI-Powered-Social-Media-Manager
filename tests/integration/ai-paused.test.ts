import { aiAgentService } from '../../src/app/modules/ai/services/ai.agent.service';
import { inboxService } from '../../src/app/modules/social/services/inbox.service';
import { startInboxWorker } from '../../src/workers/inbox.worker';
import prisma from '../../src/shared/prisma';
import { ollamaProvider } from '../../src/app/modules/ai/services/ollama.provider';
import { Worker } from 'bullmq';
jest.mock('../../src/shared/prisma', () => ({ __esModule: true, default: { unifiedMessage: { findFirst: jest.fn() } } }));
jest.mock('../../src/shared/queue.service', () => ({ redisConnection: {}, queueService: { addJob: jest.fn() } }));
jest.mock('../../src/app/modules/ai/services/ollama.provider', () => ({ ollamaProvider: { generateResponse: jest.fn() } }));
jest.mock('bullmq', () => ({ Worker: jest.fn() }));
test('paused AI cannot start a worker, generate or send an automatic reply', async () => {
  expect(startInboxWorker()).toBeUndefined();
  expect(Worker).not.toHaveBeenCalled();
  expect(await aiAgentService.processMessage('unused', 'unused')).toEqual({ suppressed: true });
  expect(await inboxService.sendReply('unused', 'unused', 'never send', 'unused', true)).toEqual({ suppressed: true });
  expect(prisma.unifiedMessage.findFirst).not.toHaveBeenCalled();
  expect(ollamaProvider.generateResponse).not.toHaveBeenCalled();
});
