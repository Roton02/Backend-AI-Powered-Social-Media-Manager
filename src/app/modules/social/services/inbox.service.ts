import { featureFlags } from "../../../../config/features";
import { randomUUID } from 'crypto';
import { SocialPlatform } from '@prisma/client';
import prisma from '../../../../shared/prisma';
import ApiError from '../../../../errors/ApiErrors';
import {queueService,redisConnection} from '../../../../shared/queue.service';
import {socketService} from '../../../../shared/socket.service';
import {connectedAccount,metaRequest} from './meta.service';
import {Attachment,conversationChanged,previewText} from './inbox-cache.service';
export async function conversationLock<T>(id:string,fn:()=>Promise<T>):Promise<T> {
 const value=randomUUID(),key=`conversation-lock:${id}`;
 if(!await redisConnection.set(key,value,'PX',60000,'NX')) throw new ApiError(409,'A reply is in progress. Please try again in a moment.');
 try{return await fn();}finally{await redisConnection.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,key,value);}
}
export type DirectMessage = { mid: string; customerId: string; customerName?: string; text: string; attachments: Attachment[]; timestamp: Date; fromBusiness: boolean };
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Saves one DM (incoming, or sent by the business from another app) into the right conversation.
 * Idempotent: a message already stored, or a reply we sent ourselves, is skipped. Returns the new row or null.
 */
export async function recordDirectMessage(account: any, dm: DirectMessage, markRead = false) {
  const externalId = `${account.id}:message:${dm.mid}`;
  if (await prisma.unifiedMessage.findUnique({ where: { externalId } })) return null;
  if (dm.fromBusiness && await prisma.unifiedMessage.findFirst({ where: { accountId: account.id, platformMessageId: dm.mid } })) return null;
  const key = { accountId_senderId: { accountId: account.id, senderId: dm.customerId } };
  let conversation = await prisma.conversation.findUnique({ where: key });
  if (!conversation) {
    try { conversation = await prisma.conversation.create({ data: { workspaceId: account.workspaceId, accountId: account.id, senderId: dm.customerId, platform: account.platform, aiEnabled: false } }); }
    catch (e: any) { if (e.code !== 'P2002') throw e; conversation = await prisma.conversation.findUniqueOrThrow({ where: key }); }
  }
  let message;
  try {
    message = await prisma.unifiedMessage.create({ data: {
      workspaceId: account.workspaceId, accountId: account.id, conversationId: conversation.id, platform: account.platform, externalId,
      senderId: dm.customerId, text: dm.text, mediaUrls: dm.attachments.map(a => a.url), attachments: dm.attachments, kind: 'message', timestamp: dm.timestamp,
      direction: dm.fromBusiness ? 'outgoing' : 'incoming', status: dm.fromBusiness ? 'sent' : markRead ? 'read' : 'unread', aiProcessed: true,
    } });
  } catch (e: any) { if (e.code === 'P2002') return null; throw e; }
  const later = (a?: Date | null) => !a || a < dm.timestamp;
  await prisma.conversation.update({ where: { id: conversation.id }, data: {
    ...(dm.customerName ? { customerName: dm.customerName } : {}),
    ...(later(conversation.lastMessageAt) ? { lastMessageAt: dm.timestamp, lastMessageText: previewText(dm.text, dm.attachments), lastMessageDirection: dm.fromBusiness ? 'outgoing' : 'incoming' } : {}),
    ...(!dm.fromBusiness && later(conversation.lastIncomingAt) ? { lastIncomingAt: dm.timestamp } : {}),
  } });
  await conversationChanged(account.workspaceId, conversation.id);
  return message;
}

export class InboxService {
 async normalizeAndSave(platform:SocialPlatform,payload:any) {
  const saved=[];
  for(const entry of payload.entry || []) {
   const accounts=await prisma.socialAccount.findMany({where:{platform,externalAccountId:String(entry.id),connectionStatus:{in:['CONNECTED','LIMITED_ACCESS']}}});
   for(const account of accounts) {
    const events:any[]=[];
    for(const event of entry.messaging || []) {
     if(!event.message?.mid || event.message.is_echo || event.sender?.id===entry.id || event.recipient?.id!==entry.id) continue;
     events.push({id:event.message.mid,sender:event.sender?.id,text:event.message.text || '',mediaUrls:(event.message.attachments || []).map((a:any)=>a.payload?.url).filter((u:any)=>typeof u==='string'),kind:'message',timestamp:new Date(event.timestamp || Date.now())});
    }
    for(const change of entry.changes || []) {
     const v=change.value;
     if(change.field==='feed' && v?.item==='comment' && v.verb==='add') events.push({id:v.comment_id,sender:v.from?.id,text:v.message || '',kind:'comment',timestamp:new Date((v.created_time || entry.time)*1000)});
     if(change.field==='comments' && v?.id) events.push({id:v.id,sender:v.from?.id,text:v.text || '',kind:'comment',timestamp:new Date(entry.time*1000)});
    }
    for(const event of events) {
     if(!event.id || !event.sender || event.sender===account.externalAccountId) continue;
     const externalId=`${account.id}:${event.kind}:${event.id}`;
     let message=await prisma.unifiedMessage.findUnique({where:{externalId}});
     if(!message) {
      let conversation=await prisma.conversation.findUnique({where:{accountId_senderId:{accountId:account.id,senderId:event.sender}}});
      if(!conversation) {try{conversation=await prisma.conversation.create({data:{workspaceId:account.workspaceId,accountId:account.id,senderId:event.sender,platform}});}catch(e:any){if(e.code!=='P2002')throw e;conversation=await prisma.conversation.findUniqueOrThrow({where:{accountId_senderId:{accountId:account.id,senderId:event.sender}}});}}
      try {message=await prisma.unifiedMessage.create({data:{workspaceId:account.workspaceId,accountId:account.id,conversationId:conversation.id,platform,externalId,senderId:event.sender,text:event.text,mediaUrls:event.mediaUrls || [],kind:event.kind,timestamp:Number.isNaN(event.timestamp.getTime())?new Date():event.timestamp,direction:'incoming'}});}catch(e:any){if(e.code!=='P2002')throw e;message=await prisma.unifiedMessage.findUniqueOrThrow({where:{externalId}});}
     }
     if(event.kind==='message' && message.conversationId) {
      await prisma.conversation.updateMany({where:{id:message.conversationId,workspaceId:account.workspaceId},data:{lastMessageAt:message.timestamp,lastIncomingAt:message.timestamp,lastMessageText:previewText(message.text||'',(message.mediaUrls||[]).map((url:string)=>({type:'file' as const,url})))}});
      await conversationChanged(account.workspaceId,message.conversationId);
     }
     if(featureFlags.aiAutomation && event.kind==='message' && !message.aiProcessed) await queueService.addJob('inbox-sync-queue','process-new-message',{messageId:message.id,workspaceId:account.workspaceId},{jobId:message.id,attempts:3,backoff:{type:'exponential',delay:5000},removeOnComplete:true,removeOnFail:true});
     socketService.emitToWorkspace(account.workspaceId,'new-message',{message});saved.push(message);
    }
   }
  }
  return saved;
 }
 async getMessages(workspaceId:string,filters:any) {
  return prisma.unifiedMessage.findMany({where:{workspaceId,kind:'message'},orderBy:{timestamp:'desc'},take:Math.min(500,Math.max(1,Number(filters.limit)||200)),skip:Math.max(0,Number(filters.offset)||0)});
 }
 async getComments(workspaceId:string,filters:any) {
  return prisma.unifiedMessage.findMany({where:{workspaceId,kind:'comment',direction:'incoming'},orderBy:{timestamp:'desc'},take:Math.min(200,Math.max(1,Number(filters.limit)||50)),skip:Math.max(0,Number(filters.offset)||0)});
 }
 async markAsRead(id:string,workspaceId:string) {
  const message=await prisma.unifiedMessage.findFirst({where:{id,workspaceId}});
  if(!message) throw new ApiError(404,'Message not found.');
  const result=await prisma.unifiedMessage.updateMany({where:{workspaceId,direction:'incoming',status:'unread',...(message.conversationId?{conversationId:message.conversationId}:{id})},data:{status:'read'}});
  if(message.conversationId && result.count) await conversationChanged(workspaceId,message.conversationId);
  return result;
 }
 /** Marks every unread customer message in a conversation as read. */
 async markConversationRead(workspaceId:string,conversationId:string) {
  const result=await prisma.unifiedMessage.updateMany({where:{workspaceId,conversationId,direction:'incoming',status:'unread'},data:{status:'read'}});
  if(result.count) await conversationChanged(workspaceId,conversationId);
  return {updated:result.count};
 }
 /** Replies in a conversation (answers its latest customer message). */
 async replyInConversation(workspaceId:string,conversationId:string,text:string,requestId:string,attachment?:Attachment) {
  const latest=await prisma.unifiedMessage.findFirst({where:{workspaceId,conversationId,direction:'incoming',kind:'message'},orderBy:{timestamp:'desc'}});
  if(!latest) throw new ApiError(404,'Conversation not found.');
  return this.sendReply(workspaceId,latest.id,text,requestId,false,attachment);
 }
 async sendReply(workspaceId:string,messageId:string,text:string,requestId:string,automatic=false,attachment?:Attachment) {
  if (automatic && !featureFlags.aiAutomation) return { suppressed: true };
  const message=await prisma.unifiedMessage.findFirst({where:{id:messageId,workspaceId,direction:'incoming'}});
  if(!message?.accountId || !message.conversationId) throw new ApiError(409,'This message needs a connected account.');
  if(message.platform==='INSTAGRAM' && message.kind==='message' && text.length>1000) throw new ApiError(400,'Instagram messages can be up to 1000 characters.');
  if(attachment && message.kind!=='message') throw new ApiError(400,'Attachments can only be sent in messages.');
  if(attachment && message.platform==='INSTAGRAM' && !['image','video','audio'].includes(attachment.type)) throw new ApiError(400,'Instagram messages accept photos, videos and audio only.');
  if(!text && !attachment) throw new ApiError(400,'Write a message or add an attachment.');
  return conversationLock(message.conversationId,async()=>{
   const conversation=await prisma.conversation.findFirst({where:{id:message.conversationId!,workspaceId}});
   const workspace=await prisma.workspace.findUnique({where:{id:workspaceId}});
   if(automatic && (!conversation?.aiEnabled || conversation.humanTakeover || (workspace?.settings as any)?.ai_auto_reply!==true)) return {suppressed:true};
   const externalId=`out:${message.accountId}:${requestId}`;
   const previous=await prisma.unifiedMessage.findUnique({where:{externalId}});
   if(previous) {
    if(previous.status==='failed')throw new ApiError(409,'This reply was rejected. Change the text to try again.');
    if(previous.status!=='sent')throw new ApiError(409,'The previous reply result is uncertain. Check the platform before sending again.');
    return previous;
   }
   if(message.kind==='message') {
    // Meta only accepts replies within 24 hours of the customer's last message.
    const last=await prisma.unifiedMessage.findFirst({where:{workspaceId,conversationId:message.conversationId!,direction:'incoming',kind:'message'},orderBy:{timestamp:'desc'}});
    if(last?.timestamp && Date.now()-new Date(last.timestamp).getTime()>REPLY_WINDOW_MS) throw new ApiError(409,"The customer's last message is more than 24 hours old, so Meta does not allow a reply from here. Reply in the Facebook or Instagram app instead.");
   }
   const account=await connectedAccount(workspaceId,message.accountId!,message.kind==='comment'?'comments':'messaging');
   const outgoing=await prisma.unifiedMessage.create({data:{workspaceId,accountId:account.id,conversationId:message.conversationId,platform:message.platform,externalId,senderId:message.senderId,text,kind:message.kind,mediaUrls:attachment?[attachment.url]:[],attachments:attachment?[attachment]:undefined,timestamp:new Date(),direction:automatic?'ai':'outgoing',status:'sending',aiProcessed:true}});
   const changed=()=>conversationChanged(workspaceId,message.conversationId!);
   await changed();
   // Reserving before the API request prevents duplicate sends after a timeout/crash.
   try {
    const sourceId=message.externalId.split(':').slice(2).join(':');
    // Instagram DMs connected through Facebook Login are sent from the linked Page.
    const pageId=message.platform==='INSTAGRAM'?(account.settings as any)?.pageId||account.externalAccountId:account.externalAccountId;
    const path=message.kind==='comment'?`${sourceId}/${message.platform==='INSTAGRAM'?'replies':'comments'}`:`${pageId}/messages`;
    // Meta sends text and an attachment as separate messages, so a request carries one or the other.
    const content=attachment?{attachment:{type:attachment.type,payload:{url:attachment.url,is_reusable:false}}}:{text};
    const payload=message.kind==='comment'?{message:text}:{recipient:{id:message.senderId},message:content,...(message.platform==='FACEBOOK'?{messaging_type:'RESPONSE'}:{})};
    const response=await metaRequest(account,path,payload);
    if(!response.id && !response.message_id) throw new Error('No message ID');
    const result=await prisma.unifiedMessage.update({where:{id:outgoing.id},data:{status:'sent',platformMessageId:String(response.message_id||response.id)}});
    await prisma.conversation.updateMany({where:{id:message.conversationId!,workspaceId},data:{lastMessageAt:new Date(),lastMessageText:previewText(text,attachment?[attachment]:[]),lastMessageDirection:'outgoing'}});
    await changed();
    return result;
   } catch(error:any) {
    // A 4xx from Meta is a definite rejection (nothing was delivered); anything else may have been delivered.
    const meta=error?.metaError;
    if(meta?.status>=400 && meta.status<500) {
     await prisma.unifiedMessage.update({where:{id:outgoing.id},data:{status:'failed'}});await changed();
     const window=meta.subcode===2018278||meta.subcode===2534022;
     throw new ApiError(422,window?'Meta no longer allows a reply to this customer from here (outside the 24-hour window). Reply in the Facebook or Instagram app instead.':`Meta rejected this reply${meta.message?`: ${meta.message}`:''}. Nothing was sent.`);
    }
    await prisma.unifiedMessage.update({where:{id:outgoing.id},data:{status:'uncertain'}});await changed();throw new ApiError(502,'Could not confirm delivery. Check the platform before sending again.');
   }
  });
 }
 async setTakeover(workspaceId:string,id:string,enabled:boolean) {
  return conversationLock(id,async()=>{
   const result=await prisma.conversation.updateMany({where:{id,workspaceId},data:{humanTakeover:enabled,aiEnabled:!enabled}});
   if(!result.count)throw new ApiError(404,'Conversation not found.');
   return {humanTakeover:enabled,aiEnabled:!enabled};
  });
 }
}
export const inboxService=new InboxService();
