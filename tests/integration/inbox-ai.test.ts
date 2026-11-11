// Legacy AI logic is exercised only with an explicit test-only override.
jest.mock('../../src/config/features', () => ({ featureFlags: { aiAutomation: true } }));
import {createHmac} from 'crypto';
import prisma from '../../src/shared/prisma';
import {validMetaSignature} from '../../src/app/modules/social/controllers/social.webhook.controller';
import {inboxService} from '../../src/app/modules/social/services/inbox.service';
import {aiAgentService,SAFE_FALLBACK} from '../../src/app/modules/ai/services/ai.agent.service';
import {ollamaProvider} from '../../src/app/modules/ai/services/ollama.provider';
import {metaRequest,connectedAccount} from '../../src/app/modules/social/services/meta.service';
jest.mock('../../src/shared/prisma',()=>({__esModule:true,default:{socialAccount:{findMany:jest.fn()},conversation:{findFirst:jest.fn(),findUnique:jest.fn(),create:jest.fn(),updateMany:jest.fn()},workspace:{findUnique:jest.fn()},aIKnowledgeBase:{findMany:jest.fn()},unifiedMessage:{findFirst:jest.fn(),findUnique:jest.fn(),findMany:jest.fn(),create:jest.fn(),update:jest.fn()}}}));
jest.mock('../../src/shared/queue.service',()=>({queueService:{addJob:jest.fn()},redisConnection:{set:jest.fn().mockResolvedValue('OK'),eval:jest.fn()}}));
jest.mock('../../src/shared/socket.service',()=>({socketService:{emitToWorkspace:jest.fn()}}));
jest.mock('../../src/app/modules/social/services/meta.service',()=>({metaRequest:jest.fn(),connectedAccount:jest.fn()}));
jest.mock('../../src/app/modules/ai/services/ollama.provider',()=>({ollamaProvider:{generateResponse:jest.fn()}}));
const db=prisma as any;
const message={id:'m',workspaceId:'w',accountId:'a',conversationId:'c',senderId:'customer',externalId:'a:message:mid',kind:'message',direction:'incoming',text:'Hours?',aiProcessed:false};
beforeEach(()=>{
 jest.clearAllMocks();db.unifiedMessage.findFirst.mockResolvedValue(message);db.unifiedMessage.findUnique.mockResolvedValue(null);db.unifiedMessage.findMany.mockResolvedValue([message]);db.unifiedMessage.create.mockImplementation(({data}:any)=>Promise.resolve({id:'out',...data}));db.unifiedMessage.update.mockResolvedValue({id:'out',status:'sent'});
 db.workspace.findUnique.mockResolvedValue({settings:{ai_auto_reply:true}});db.conversation.findFirst.mockResolvedValue({aiEnabled:true,humanTakeover:false});db.conversation.findUnique.mockResolvedValue({id:'c'});db.conversation.updateMany.mockResolvedValue({count:1});db.aIKnowledgeBase.findMany.mockResolvedValue([{question:'Hours?',answer:'9am to 5pm'}]);
 (connectedAccount as jest.Mock).mockResolvedValue({id:'a',externalAccountId:'page'});(metaRequest as jest.Mock).mockResolvedValue({message_id:'sent'});(ollamaProvider.generateResponse as jest.Mock).mockResolvedValue('{"factIndex":0}');
});
test('webhooks require authentic raw bytes and reject tampering',()=>{
 const raw=Buffer.from('{"entry":[]}');const signature='sha256='+createHmac('sha256','test-secret').update(raw).digest('hex');
 expect(validMetaSignature(raw,signature,'test-secret')).toBe(true);expect(validMetaSignature(Buffer.from('{}'),signature,'test-secret')).toBe(false);expect(validMetaSignature(raw,undefined,'test-secret')).toBe(false);
});
test('webhooks route by page ID, parse nested text and deduplicate',async()=>{
 db.socialAccount.findMany.mockResolvedValue([{id:'a',workspaceId:'w',externalAccountId:'page'}]);
 await inboxService.normalizeAndSave('FACEBOOK',{entry:[{id:'page',messaging:[{sender:{id:'customer'},recipient:{id:'page'},message:{mid:'mid',text:'Hello'},timestamp:1000},{message:{mid:'echo',is_echo:true}}]}]});
 expect(db.socialAccount.findMany).toHaveBeenCalledWith({where:expect.objectContaining({externalAccountId:'page'})});expect(db.unifiedMessage.create).toHaveBeenCalledWith({data:expect.objectContaining({workspaceId:'w',text:'Hello',externalId:'a:message:mid'})});
 db.unifiedMessage.findUnique.mockResolvedValue(message);db.unifiedMessage.create.mockClear();
 await inboxService.normalizeAndSave('FACEBOOK',{entry:[{id:'page',messaging:[{sender:{id:'customer'},recipient:{id:'page'},message:{mid:'mid'}}]}]});expect(db.unifiedMessage.create).not.toHaveBeenCalled();
});
test('manual reply targets sender not incoming message ID and persists result',async()=>{
 await inboxService.sendReply('w','m','Hello','request');expect(metaRequest).toHaveBeenCalledWith(expect.anything(),'page/messages',expect.objectContaining({recipient:{id:'customer'}}));expect(db.unifiedMessage.update).toHaveBeenCalledWith({where:{id:'out'},data:{status:'sent',platformMessageId:'sent'}});
});
test('uncertain previous reply cannot be sent twice',async()=>{
 db.unifiedMessage.findUnique.mockResolvedValue({status:'uncertain'});await expect(inboxService.sendReply('w','m','Hello','request')).rejects.toThrow('uncertain');expect(metaRequest).not.toHaveBeenCalled();
});
test('human takeover stops automatic send, manual send remains possible',async()=>{
 db.conversation.findFirst.mockResolvedValue({aiEnabled:false,humanTakeover:true});expect(await inboxService.sendReply('w','m','Hello','request',true)).toEqual({suppressed:true});expect(metaRequest).not.toHaveBeenCalled();await inboxService.sendReply('w','m','Hello','manual');expect(metaRequest).toHaveBeenCalledTimes(1);
});
test('AI disabled skips generation; enabled AI sends only saved facts',async()=>{
 db.workspace.findUnique.mockResolvedValueOnce({settings:{ai_auto_reply:false}});await aiAgentService.processMessage('m','w');expect(ollamaProvider.generateResponse).not.toHaveBeenCalled();
 const result=await aiAgentService.processMessage('m','w');expect(result).toEqual({response:'9am to 5pm',needsHuman:false});expect(metaRequest).toHaveBeenCalledWith(expect.anything(),'page/messages',expect.objectContaining({message:{text:'9am to 5pm'}}));
});
test('unknown or invented output falls back to human without automatic send',async()=>{
 (ollamaProvider.generateResponse as jest.Mock).mockResolvedValue('{"price":"$25","factIndex":999}');const result=await aiAgentService.processMessage('m','w');expect(result).toEqual({response:SAFE_FALLBACK,needsHuman:true});expect(metaRequest).not.toHaveBeenCalled();expect(db.conversation.updateMany).toHaveBeenCalledWith({where:{id:'c',workspaceId:'w'},data:{humanTakeover:true,aiEnabled:false}});
});
test('takeover activated during generation suppresses send',async()=>{
 (ollamaProvider.generateResponse as jest.Mock).mockImplementation(async()=>{db.conversation.findFirst.mockResolvedValue({aiEnabled:false,humanTakeover:true});return '{"factIndex":0}';});await aiAgentService.processMessage('m','w');expect(metaRequest).not.toHaveBeenCalled();
});
test('comments use comment endpoint',async()=>{
 db.unifiedMessage.findFirst.mockResolvedValue({...message,kind:'comment',externalId:'a:comment:comment123',platform:'FACEBOOK'});await inboxService.sendReply('w','m','Thanks','request');expect(metaRequest).toHaveBeenCalledWith(expect.anything(),'comment123/comments',{message:'Thanks'});
});
