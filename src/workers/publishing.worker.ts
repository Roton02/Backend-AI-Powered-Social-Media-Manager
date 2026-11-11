import { Worker, Job } from 'bullmq';
import { redisConnection } from '../shared/queue.service';
import prisma from '../shared/prisma';
import { connectedAccount, metaRequest } from '../app/modules/social/services/meta.service';
import { publishLinkedin } from '../app/modules/social/services/linkedin.service';
import { publishYoutube } from '../app/modules/social/services/youtube.service';
import { publishX } from '../app/modules/social/services/x.service';
import { publishTiktok } from '../app/modules/social/services/tiktok.service';
import { enqueuePost } from '../app/modules/publishing/publishing.service';
import { socketService } from '../shared/socket.service';
export interface PublishPostJobData {postId:string}
export async function processPublishPost(job:Pick<Job<PublishPostJobData>,'data'>) {
 const row=await prisma.postStatus.findUnique({where:{id:job.data.postId}});
 if(!row || row.status!=='PENDING') return;
 if(row.scheduledAt.getTime()>Date.now()) return;
 const claimed=await prisma.postStatus.updateMany({where:{id:row.id,status:'PENDING'},data:{status:'PROCESSING'}});
 if(!claimed.count) return;
 try {
   if(!row.accountId) throw new Error('Reconnect and create a new post.');
   const account=await connectedAccount(row.workspaceId,row.accountId,'publishing');
   let result:any;
   if(account.platform==='FACEBOOK') {
     result=await metaRequest(account,`${account.externalAccountId}/${row.mediaUrls?.length?'photos':'feed'}`,row.mediaUrls?.length?{url:row.mediaUrls[0],caption:row.content}:{message:row.content});
   } else if(account.platform==='INSTAGRAM') {
     const container=await metaRequest(account,`${account.externalAccountId}/media`,{image_url:row.mediaUrls[0],caption:row.content});
     if(!container.id) throw new Error('Media could not be prepared.');
     result=await metaRequest(account,`${account.externalAccountId}/media_publish`,{creation_id:container.id});
   } else if(account.platform==='LINKEDIN') {
     result=await publishLinkedin(account,row.content,row.mediaUrls?.[0]);
   } else if(account.platform==='YOUTUBE') {
     result=await publishYoutube(account,row.content,row.mediaUrls[0]);
   } else if(account.platform==='X') {
     result=await publishX(account,row.content,row.mediaUrls?.[0]);
   } else if(account.platform==='TIKTOK') {
     result=await publishTiktok(account,row.content,row.mediaUrls[0]);
   } else throw new Error('Unsupported platform.');
   if(!result.id) throw new Error('Publishing result could not be confirmed.');
   await prisma.postStatus.update({where:{id:row.id},data:{status:'PUBLISHED',platformPostId:result.post_id || result.id,publishedAt:new Date(),errorLog:null}});
 } catch(error:any) {
   // No automatic retry after a platform send: a timeout may mean the post was accepted.
   // A 4xx reply from Meta is a definite rejection (nothing was posted), so report Meta's reason instead.
   const meta=error?.metaError;
   const rejected=meta && meta.status>=400 && meta.status<500;
   const errorLog=rejected
     ? `The platform rejected this post (code ${meta.code ?? '?'}${meta.subcode ? '/'+meta.subcode : ''}): ${String(meta.message || 'no reason given').replace(/\.+$/,'')}. Nothing was published.`
     : 'Could not confirm publishing. Check the platform before creating another post.';
   await prisma.postStatus.update({where:{id:row.id},data:{status:'FAILED',errorLog}});
 }
 socketService.emitToWorkspace(row.workspaceId,'post-status-update',{jobId:row.jobId});
}
export async function reconcilePublishing(workspaceId?: string) {
 const pending=await prisma.postStatus.findMany({where:{status:'PENDING',...(workspaceId ? {workspaceId} : {})},take:100,orderBy:{scheduledAt:'asc'}});
 for(const row of pending) await enqueuePost(row);
 // A crashed in-flight request is ambiguous, so never republish it automatically.
 await prisma.postStatus.updateMany({where:{...(workspaceId ? {workspaceId} : {}),status:'PROCESSING',updatedAt:{lt:new Date(Date.now()-10*60*1000)}},data:{status:'FAILED',errorLog:'Publishing was interrupted. Check the platform before creating another post.'}});
}
export function startPublishingWorker() {
 const worker=new Worker<PublishPostJobData>('publishing-queue',processPublishPost,{connection:redisConnection,concurrency:3});
 const reconcile=()=>reconcilePublishing().catch(()=>console.error('Publishing recovery unavailable; will retry.'));
 void reconcile();const timer=setInterval(reconcile,30000);timer.unref();
 worker.on('closed',()=>clearInterval(timer));worker.on('error',()=>console.error('Publishing worker unavailable.'));
 return worker;
}
