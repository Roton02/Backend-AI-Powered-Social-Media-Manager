import { featureFlags } from "../config/features";
import {Worker} from 'bullmq';
import {redisConnection,queueService} from '../shared/queue.service';
import prisma from '../shared/prisma';
import {aiAgentService} from '../app/modules/ai/services/ai.agent.service';
export function startInboxWorker(){
 if (!featureFlags.aiAutomation) return;
 const worker=new Worker('inbox-sync-queue',job=>aiAgentService.processMessage(job.data.messageId,job.data.workspaceId),{connection:redisConnection,concurrency:2});
 worker.on('failed',async(job)=>{
  if(job && job.attemptsMade>=3){
   try{await prisma.unifiedMessage.update({where:{id:job.data.messageId},data:{aiProcessed:true,aiSuggestion:'Automatic reply unavailable. Please reply manually.'}});}catch{/* next recovery pass retries */}
  }
 });
 worker.on('error',()=>console.error('Inbox worker unavailable.'));
 const recover=async()=>{try{
  const messages=await prisma.unifiedMessage.findMany({where:{aiProcessed:false,direction:'incoming',kind:'message',conversationId:{not:null}},take:100,orderBy:{createdAt:'asc'}});
  for(const m of messages)await queueService.addJob('inbox-sync-queue','process-new-message',{messageId:m.id,workspaceId:m.workspaceId},{jobId:m.id,attempts:3,backoff:{type:'exponential',delay:5000},removeOnComplete:true,removeOnFail:true});
 }catch{console.error('Inbox recovery unavailable; will retry.')}};
 void recover();const timer=setInterval(recover,30000);timer.unref();worker.on('closed',()=>clearInterval(timer));return worker;
}
