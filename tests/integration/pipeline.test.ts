// Isolated regression tests: Prisma, queue and Meta calls are mocked. No external sends.
import prisma from '../../src/shared/prisma';
import {publishingService} from '../../src/app/modules/publishing/publishing.service';
import {processPublishPost} from '../../src/workers/publishing.worker';
import {connectedAccount,metaRequest} from '../../src/app/modules/social/services/meta.service';
import {queueService} from '../../src/shared/queue.service';
import {publishLinkedin} from '../../src/app/modules/social/services/linkedin.service';
import {publishYoutube} from '../../src/app/modules/social/services/youtube.service';
import {publishX} from '../../src/app/modules/social/services/x.service';
import {publishTiktok} from '../../src/app/modules/social/services/tiktok.service';
jest.mock('../../src/shared/prisma',()=>({__esModule:true,default:{postStatus:{create:jest.fn(),findUnique:jest.fn(),findMany:jest.fn(),updateMany:jest.fn(),update:jest.fn()},socialAccount:{findFirst:jest.fn(),findMany:jest.fn()}}}));
jest.mock('../../src/shared/queue.service',()=>({queueService:{addJob:jest.fn()},redisConnection:{}}));
jest.mock('../../src/app/modules/social/services/meta.service',()=>({connectedAccount:jest.fn(),metaRequest:jest.fn()}));
jest.mock('../../src/app/modules/social/services/linkedin.service',()=>({publishLinkedin:jest.fn()}));
jest.mock('../../src/app/modules/social/services/youtube.service',()=>({publishYoutube:jest.fn(),isVideoUrl:(u:string)=>u.includes('/video/upload/')}));
jest.mock('../../src/app/modules/social/services/x.service',()=>({publishX:jest.fn(),X_TEXT_LIMIT:280}));
jest.mock('../../src/app/modules/social/services/tiktok.service',()=>({publishTiktok:jest.fn(),TIKTOK_TEXT_LIMIT:2200}));
jest.mock('../../src/shared/socket.service',()=>({socketService:{emitToWorkspace:jest.fn()}}));
const db=prisma as any;
const row={id:'012345678901234567890123',workspaceId:'012345678901234567890124',jobId:'unique-job',accountId:'012345678901234567890125',platform:'FACEBOOK',content:'Hello',mediaUrls:[],status:'PENDING',scheduledAt:new Date(0)};
beforeEach(()=>{jest.clearAllMocks();db.postStatus.create.mockResolvedValue(row);db.postStatus.findUnique.mockResolvedValue(row);db.postStatus.updateMany.mockResolvedValue({count:1});(connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'FACEBOOK',externalAccountId:'page-1'});(metaRequest as jest.Mock).mockResolvedValue({id:'platform-post'});});
test('create uses generated ObjectId and unique per-account job, preserves media',async()=>{
 await publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hello',mediaUrls:['https://example.com/photo.jpg']});
 const data=db.postStatus.create.mock.calls[0][0].data;expect(data).not.toHaveProperty('id');expect(data.mediaUrls).toEqual(['https://example.com/photo.jpg']);expect(queueService.addJob).toHaveBeenCalled();
});
test('draft never enqueues and invalid schedule is rejected',async()=>{
 await publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hello',draft:true});expect(queueService.addJob).not.toHaveBeenCalled();
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hello',scheduledAt:new Date(0).toISOString()})).rejects.toThrow('future');
});
test('duplicate or cancelled work never sends',async()=>{
 db.postStatus.findUnique.mockResolvedValue({...row,status:'PUBLISHED'});await processPublishPost({data:{postId:row.id}});expect(metaRequest).not.toHaveBeenCalled();
 db.postStatus.findUnique.mockResolvedValue(row);db.postStatus.updateMany.mockResolvedValue({count:0});await processPublishPost({data:{postId:row.id}});expect(metaRequest).not.toHaveBeenCalled();
});
test('publisher addresses selected page and stores platform ID',async()=>{
 await processPublishPost({data:{postId:row.id}});expect(metaRequest).toHaveBeenCalledWith(expect.anything(),'page-1/feed',{message:'Hello'});expect(db.postStatus.update).toHaveBeenCalledWith({where:{id:row.id},data:expect.objectContaining({status:'PUBLISHED',platformPostId:'platform-post'})});
});
test('ambiguous platform failure is retained without automatic resend',async()=>{
 (metaRequest as jest.Mock).mockRejectedValue(new Error('timeout'));await processPublishPost({data:{postId:row.id}});expect(db.postStatus.update).toHaveBeenCalledWith({where:{id:row.id},data:expect.objectContaining({status:'FAILED'})});expect(queueService.addJob).not.toHaveBeenCalled();
});
test('cancel scopes conditional update to workspace and pending/draft states',async()=>{
 await publishingService.cancelPost(row.workspaceId,row.jobId);expect(db.postStatus.updateMany).toHaveBeenCalledWith({where:{workspaceId:row.workspaceId,jobId:row.jobId,status:{in:['PENDING','DRAFT']}},data:{status:'CANCELLED'}});
});
test('definite platform rejection records the platform reason without automatic resend',async()=>{
 (metaRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('rejected'),{metaError:{status:400,code:100,subcode:33,message:'Missing permission'}}));
 await processPublishPost({data:{postId:row.id}});
 expect(db.postStatus.update).toHaveBeenCalledWith({where:{id:row.id},data:{status:'FAILED',errorLog:expect.stringContaining('code 100/33): Missing permission. Nothing was published.')}});
 expect(queueService.addJob).not.toHaveBeenCalled();
});

test('post list names each account and only looks up accounts in the same workspace',async()=>{
 db.postStatus.findMany.mockResolvedValue([row,{...row,id:'x',accountId:'gone'}]);db.socialAccount.findMany.mockResolvedValue([{id:row.accountId,accountName:'Aljamin'}]);
 const list=await publishingService.listPosts(row.workspaceId);
 expect(db.socialAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{workspaceId:row.workspaceId}}));
 expect(list.map((p:any)=>p.accountName)).toEqual(['Aljamin',null]);
});

test('LinkedIn posts go through the LinkedIn publisher and store the post URN',async()=>{
 db.postStatus.findUnique.mockResolvedValue({...row,platform:'LINKEDIN',mediaUrls:['https://res.cloudinary.com/x.jpg']});
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'LINKEDIN',externalAccountId:'abc'});(publishLinkedin as jest.Mock).mockResolvedValue({id:'urn:li:share:9'});
 await processPublishPost({data:{postId:row.id}});
 expect(publishLinkedin).toHaveBeenCalledWith(expect.objectContaining({platform:'LINKEDIN'}),'Hello','https://res.cloudinary.com/x.jpg');expect(metaRequest).not.toHaveBeenCalled();
 expect(db.postStatus.update).toHaveBeenCalledWith({where:{id:row.id},data:expect.objectContaining({status:'PUBLISHED',platformPostId:'urn:li:share:9'})});
});
test('LinkedIn text over 3,000 characters is rejected before saving',async()=>{
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'LINKEDIN'});
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'x'.repeat(3001)})).rejects.toThrow('3,000');expect(db.postStatus.create).not.toHaveBeenCalled();
});

const videoUrl='https://res.cloudinary.com/d/video/upload/a.mp4';
test('YouTube posts upload through the YouTube publisher and store the video ID',async()=>{
 db.postStatus.findUnique.mockResolvedValue({...row,platform:'YOUTUBE',mediaUrls:[videoUrl]});
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'YOUTUBE'});(publishYoutube as jest.Mock).mockResolvedValue({id:'vid123'});
 await processPublishPost({data:{postId:row.id}});
 expect(publishYoutube).toHaveBeenCalledWith(expect.objectContaining({platform:'YOUTUBE'}),'Hello',videoUrl);
 expect(db.postStatus.update).toHaveBeenCalledWith({where:{id:row.id},data:expect.objectContaining({status:'PUBLISHED',platformPostId:'vid123'})});
});
test('YouTube requires a video, and videos are refused for other platforms',async()=>{
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'YOUTUBE'});
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hi'})).rejects.toThrow('MP4');
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hi',mediaUrls:['https://res.cloudinary.com/d/image/upload/a.jpg']})).rejects.toThrow('MP4');
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'FACEBOOK'});
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hi',mediaUrls:[videoUrl]})).rejects.toThrow('only be posted to YouTube and TikTok');
 expect(db.postStatus.create).not.toHaveBeenCalled();
});

test('X and TikTok posts go through their publishers and store the platform ID',async()=>{
 db.postStatus.findUnique.mockResolvedValue({...row,platform:'X',mediaUrls:[]});
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'X'});(publishX as jest.Mock).mockResolvedValue({id:'tweet1'});
 await processPublishPost({data:{postId:row.id}});
 expect(publishX).toHaveBeenCalledWith(expect.objectContaining({platform:'X'}),'Hello',undefined);
 expect(db.postStatus.update).toHaveBeenCalledWith({where:{id:row.id},data:expect.objectContaining({status:'PUBLISHED',platformPostId:'tweet1'})});
 db.postStatus.findUnique.mockResolvedValue({...row,platform:'TIKTOK',mediaUrls:[videoUrl]});
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'TIKTOK'});(publishTiktok as jest.Mock).mockResolvedValue({id:'pub1'});
 await processPublishPost({data:{postId:row.id}});
 expect(publishTiktok).toHaveBeenCalledWith(expect.objectContaining({platform:'TIKTOK'}),'Hello',videoUrl);
});
test('X allows 280 characters and no video; TikTok requires one video',async()=>{
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'X'});
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'x'.repeat(281)})).rejects.toThrow('280');
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hi',mediaUrls:[videoUrl]})).rejects.toThrow('YouTube and TikTok');
 (connectedAccount as jest.Mock).mockResolvedValue({id:row.accountId,platform:'TIKTOK'});
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hi'})).rejects.toThrow('TikTok requires');
 await expect(publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'x'.repeat(2201),mediaUrls:[videoUrl]})).rejects.toThrow('TikTok requires');
 expect(db.postStatus.create).not.toHaveBeenCalled();
 await publishingService.createPost(row.workspaceId,'user',{accountId:row.accountId,content:'Hi',mediaUrls:[videoUrl]});
 expect(db.postStatus.create).toHaveBeenCalled();
});
