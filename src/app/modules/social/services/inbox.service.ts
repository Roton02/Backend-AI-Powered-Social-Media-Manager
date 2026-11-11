import { featureFlags } from "../../../../config/features";
import { randomUUID } from 'crypto';
import { SocialPlatform } from '@prisma/client';
import prisma from '../../../../shared/prisma';
import ApiError from '../../../../errors/ApiErrors';
import {queueService,redisConnection} from '../../../../shared/queue.service';
import {socketService} from '../../../../shared/socket.service';
import {connectedAccount,metaRequest} from './meta.service';
export async function conversationLock<T>(id:string,fn:()=>Promise<T>):Promise<T> {
 const value=randomUUID(),key=`conversation-lock:${id}`;
 if(!await redisConnection.set(key,value,'PX',60000,'NX')) throw new ApiError(409,'A reply is in progress. Please try again in a moment.');
 try{return await fn();}finally{await redisConnection.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,key,value);}
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
  return prisma.unifiedMessage.updateMany({where:{workspaceId,direction:'incoming',status:'unread',...(message.conversationId?{conversationId:message.conversationId}:{id})},data:{status:'read'}});
 }
 async sendReply(workspaceId:string,messageId:string,text:string,requestId:string,automatic=false) {
  if (automatic && !featureFlags.aiAutomation) return { suppressed: true };
  const message=await prisma.unifiedMessage.findFirst({where:{id:messageId,workspaceId,direction:'incoming'}});
  if(!message?.accountId || !message.conversationId) throw new ApiError(409,'This message needs a connected account.');
  return conversationLock(message.conversationId,async()=>{
   const conversation=await prisma.conversation.findFirst({where:{id:message.conversationId!,workspaceId}});
   const workspace=await prisma.workspace.findUnique({where:{id:workspaceId}});
   if(automatic && (!conversation?.aiEnabled || conversation.humanTakeover || (workspace?.settings as any)?.ai_auto_reply!==true)) return {suppressed:true};
   const externalId=`out:${message.accountId}:${requestId}`;
   const previous=await prisma.unifiedMessage.findUnique({where:{externalId}});
   if(previous) {if(previous.status!=='sent')throw new ApiError(409,'The previous reply result is uncertain. Check the platform before sending again.');return previous;}
   const account=await connectedAccount(workspaceId,message.accountId!,message.kind==='comment'?'comments':'messaging');
   const outgoing=await prisma.unifiedMessage.create({data:{workspaceId,accountId:account.id,conversationId:message.conversationId,platform:message.platform,externalId,senderId:message.senderId,text,kind:message.kind,mediaUrls:[],timestamp:new Date(),direction:automatic?'ai':'outgoing',status:'sending',aiProcessed:true}});
   // Reserving before the API request prevents duplicate sends after a timeout/crash.
   try {
    const sourceId=message.externalId.split(':').slice(2).join(':');
    const path=message.kind==='comment'?`${sourceId}/${message.platform==='INSTAGRAM'?'replies':'comments'}`:`${account.externalAccountId}/messages`;
    const payload=message.kind==='comment'?{message:text}:{recipient:{id:message.senderId},message:{text},...(message.platform==='FACEBOOK'?{messaging_type:'RESPONSE'}:{})};
    const response=await metaRequest(account,path,payload);
    if(!response.id && !response.message_id) throw new Error('No message ID');
    const result=await prisma.unifiedMessage.update({where:{id:outgoing.id},data:{status:'sent'}});
    socketService.emitToWorkspace(workspaceId,'new-message',{message:result});return result;
   } catch {await prisma.unifiedMessage.update({where:{id:outgoing.id},data:{status:'uncertain'}});throw new ApiError(502,'Could not confirm delivery. Check the platform before sending again.');}
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
