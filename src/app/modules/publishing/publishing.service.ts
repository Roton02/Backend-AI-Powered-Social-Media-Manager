import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../../../shared/prisma';
import ApiError from '../../../errors/ApiErrors';
import { queueService } from '../../../shared/queue.service';
import { connectedAccount } from '../social/services/meta.service';
import { isVideoUrl } from '../social/services/youtube.service';
import { X_TEXT_LIMIT } from '../social/services/x.service';
import { TIKTOK_TEXT_LIMIT } from '../social/services/tiktok.service';
import { SocialPlatform } from '@prisma/client';
export const postInput=z.object({
 content:z.string().trim().max(63206), accountId:z.string().regex(/^[a-f0-9]{24}$/i),
 mediaUrls:z.array(z.string().url().refine(v=>v.startsWith('https://'),'Use a public HTTPS image URL.')).max(1).default([]),
 scheduledAt:z.string().datetime({offset:true}).optional(), draft:z.boolean().default(false),
});
export async function enqueuePost(row:any) {
 await queueService.addJob('publishing-queue','publish-post',{postId:row.id},{jobId:row.jobId,delay:Math.max(0,new Date(row.scheduledAt).getTime()-Date.now()),attempts:1,removeOnComplete:true,removeOnFail:true});
}
export const createPost=async(workspaceId:string,_userId:string,payload:unknown)=>{
 const data=postInput.parse(payload);
 if(!data.content && !data.mediaUrls.length) throw new ApiError(400,'Add text or an image.');
 if(data.scheduledAt && new Date(data.scheduledAt).getTime()<=Date.now()) throw new ApiError(400,'Choose a future date and time.');
 const account=await connectedAccount(workspaceId,data.accountId,'publishing');
 if(!['FACEBOOK','INSTAGRAM','LINKEDIN','YOUTUBE','TIKTOK','X'].includes(account.platform)) throw new ApiError(400,'This platform is not supported yet.');
 const hasVideo=data.mediaUrls.some(isVideoUrl);
 if(account.platform==='YOUTUBE' && (data.mediaUrls.length!==1 || !hasVideo || data.content.length>5000)) throw new ApiError(400,'YouTube requires one MP4 video and text of at most 5,000 characters.');
 if(account.platform==='TIKTOK' && (data.mediaUrls.length!==1 || !hasVideo || data.content.length>TIKTOK_TEXT_LIMIT)) throw new ApiError(400,'TikTok requires one MP4 video and a caption of at most 2,200 characters.');
 if(!['YOUTUBE','TIKTOK'].includes(account.platform) && hasVideo) throw new ApiError(400,'Videos can only be posted to YouTube and TikTok for now.');
 if(account.platform==='X' && data.content.length>X_TEXT_LIMIT) throw new ApiError(400,'X posts can be at most 280 characters.');
 if(account.platform==='LINKEDIN' && data.content.length>3000) throw new ApiError(400,'LinkedIn posts can be at most 3,000 characters.');
 if(account.platform==='INSTAGRAM' && (data.mediaUrls.length!==1 || data.content.length>2200)) throw new ApiError(400,'Instagram requires one image and a caption of at most 2,200 characters.');
 const row=await prisma.postStatus.create({data:{workspaceId,jobId:randomUUID(),accountId:account.id,platform:account.platform,content:data.content,mediaUrls:data.mediaUrls,scheduledAt:data.scheduledAt?new Date(data.scheduledAt):new Date(),status:data.draft?'DRAFT':'PENDING'}});
 // MongoDB is the durable source. Reconciler recovers an enqueue failure.
 if(!data.draft) {try{await enqueuePost(row);}catch{/* pending row will be recovered */}}
 return {jobId:row.jobId,platforms:[row.platform],status:row.status,message:data.draft?'Draft saved':'Post queued'};
};
const group=(rows:any[])=>rows.map(row=>({...row,platforms:[{platform:row.platform,status:row.status,publishedAt:row.publishedAt,errorLog:row.errorLog}]}));
export const listPosts=async(workspaceId:string)=>{
 const [rows,accounts]=await Promise.all([prisma.postStatus.findMany({where:{workspaceId},orderBy:{createdAt:'desc'}}),prisma.socialAccount.findMany({where:{workspaceId},select:{id:true,accountName:true}})]);
 // Name each post's account so users can tell which Page/profile succeeded or failed.
 const names=new Map(accounts.map(a=>[a.id,a.accountName]));
 return group(rows.map(row=>({...row,accountName:(row.accountId&&names.get(row.accountId))||null})));
};
export const adminListPosts=async()=>group(await prisma.postStatus.findMany({orderBy:{createdAt:'desc'}}));
export const getPostStatus=(workspaceId:string,jobId:string)=>prisma.postStatus.findMany({where:{workspaceId,jobId}});
export const getPostByPlatform=(workspaceId:string,jobId:string,platform:SocialPlatform)=>prisma.postStatus.findFirst({where:{workspaceId,jobId,platform}});
export async function cancelPost(workspaceId:string,jobId:string) {
 const result=await prisma.postStatus.updateMany({where:{workspaceId,jobId,status:{in:['PENDING','DRAFT']}},data:{status:'CANCELLED'}});
 if(!result.count) throw new ApiError(409,'This post has already started or cannot be cancelled.');
 return {success:true};
}
export async function publishDraft(workspaceId:string,jobId:string) {
 const row=await prisma.postStatus.findFirst({where:{workspaceId,jobId,status:'DRAFT'}});
 if(!row?.accountId) throw new ApiError(404,'Draft not found.');
 await connectedAccount(workspaceId,row.accountId,'publishing');
 const updated=await prisma.postStatus.updateMany({where:{id:row.id,status:'DRAFT'},data:{status:'PENDING',scheduledAt:new Date()}});
 if(!updated.count) throw new ApiError(409,'This draft has already been queued.');
 try{await enqueuePost({...row,scheduledAt:new Date()});}catch{/* recovered by reconciler */}
 return {success:true};
}
export const retryFailedPost=async(_workspaceId:string,_jobId:string,_platform:SocialPlatform):Promise<{message:string}>=>{
 throw new ApiError(409,'Check the platform before creating another post. The previous result may be uncertain.');
};
export const publishingService={createPost,listPosts,adminListPosts,getPostStatus,getPostByPlatform,retryFailedPost,cancelPost,publishDraft};
