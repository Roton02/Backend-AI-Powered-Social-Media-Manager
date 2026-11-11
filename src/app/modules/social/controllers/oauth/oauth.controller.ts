import { randomBytes, createHash } from 'crypto';
import axios from 'axios';
import catchAsync from '../../../../../shared/catchAsync';
import sendResponse from '../../../../../shared/sendResponse';
import prisma from '../../../../../shared/prisma';
import { redisConnection as redis } from '../../../../../shared/queue.service';
import config from '../../../../../config';
import ApiError from '../../../../../errors/ApiErrors';
import { encryptToken, decryptToken, graphBase } from '../../services/meta.service';
import { connectLinkedin, linkedinAuthUrl, linkedinPagesAuthUrl, discoverLinkedinPages, saveLinkedinPages } from '../../services/linkedin.service';
import { connectYoutube, youtubeAuthUrl } from '../../services/youtube.service';
import { connectX, pkcePair, xAuthUrl } from '../../services/x.service';
import { connectTiktok, tiktokAuthUrl, tiktokPkce } from '../../services/tiktok.service';
// business_management lets /me/accounts include Pages owned by a Meta Business portfolio.
const publishingScopes=['pages_show_list','pages_read_engagement','pages_manage_posts','business_management'];
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const callback=()=>`${config.app.backendUrl}/api/v1/social/callback/facebook`;
const send=(res:any,data:any)=>sendResponse(res,{statusCode:200,success:true,message:'Connection updated',data});
async function startState(req:any,res:any,provider:string,extra:Record<string,string>={}) {
  const state=randomBytes(32).toString('hex');
  await redis.set(`oauth:${hash(state)}`,JSON.stringify({workspaceId:req.headers['x-workspace-id'],userId:req.user.id,provider,...extra}), 'EX',600);
  // Browser binding prevents a callback URL copied from another browser being used to link an account.
  res.cookie('meta_oauth',state,{httpOnly:true,sameSite:'lax',secure:callback().startsWith('https:'),maxAge:600000,path:'/api/v1/social/callback'});
  return state;
}
const getAuthUrl=catchAsync(async(req,res)=>{
  if(!['facebook','instagram','linkedin','linkedin-pages','youtube','tiktok','x'].includes(req.params.platform)) throw new ApiError(400,'This platform is coming soon.');
  if(req.params.platform==='x' || req.params.platform==='tiktok') {
    const x=req.params.platform==='x';
    if(!(x?config.social.x_client_id:config.social.tiktok_client_id) || !(x?config.social.x_client_secret:config.social.tiktok_client_secret) || !config.app.backendUrl) throw new ApiError(503,`${x?'X':'TikTok'} connections are not set up yet. Please contact support.`);
    encryptToken('configuration-check');
    // The PKCE verifier stays server-side with the single-use state.
    const {verifier,challenge}=x?pkcePair():tiktokPkce();
    const state=await startState(req,res,req.params.platform,{codeVerifier:verifier});
    return send(res,{url:x?xAuthUrl(state,challenge):tiktokAuthUrl(state,challenge)});
  }
  if(req.params.platform==='youtube') {
    if(!config.social.youtube_client_id || !config.social.youtube_client_secret || !config.app.backendUrl) throw new ApiError(503,'YouTube connections are not set up yet. Please contact support.');
    encryptToken('configuration-check');
    const state=await startState(req,res,'youtube');
    return send(res,{url:youtubeAuthUrl(state)});
  }
  if(req.params.platform==='linkedin-pages') {
    if(!config.social.linkedin_pages_client_id || !config.social.linkedin_pages_client_secret || !config.app.backendUrl) throw new ApiError(503,'LinkedIn Page connections are not set up yet. Please contact support.');
    encryptToken('configuration-check');
    const state=await startState(req,res,'linkedin-pages');
    return send(res,{url:linkedinPagesAuthUrl(state)});
  }
  if(req.params.platform==='linkedin') {
    if(!config.social.linkedin_client_id || !config.social.linkedin_client_secret || !config.app.backendUrl) throw new ApiError(503,'LinkedIn connections are not available yet. Please contact support.');
    encryptToken('configuration-check');
    const state=await startState(req,res,'linkedin');
    return send(res,{url:linkedinAuthUrl(state)});
  }
  if(!config.social.facebook_client_id || !config.social.facebook_client_secret || !config.app.backendUrl) throw new ApiError(503,'Social connections are not available yet. Please contact support.');
  encryptToken('configuration-check');
  const scopes=req.params.platform==='instagram' ? [...publishingScopes,'instagram_basic','instagram_content_publish'] : publishingScopes;
  const state=await startState(req,res,'facebook');
  send(res,{url:`https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v25.0'}/dialog/oauth?${new URLSearchParams({client_id:config.social.facebook_client_id,redirect_uri:callback(),state,scope:scopes.join(','),response_type:'code'})}`});
});
const handleCallback=catchAsync(async(req,res)=>{
  const state=typeof req.query.state==='string'?req.query.state:'';
  const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('meta_oauth='))?.slice(11);
  if(!state || cookie!==state) throw new ApiError(400,'Connection expired. Please reconnect.');
  const saved=await redis.getdel(`oauth:${hash(state)}`);
  res.clearCookie('meta_oauth',{path:'/api/v1/social/callback'});
  if(!saved) throw new ApiError(400,'Connection expired. Please reconnect.');
  const session=JSON.parse(saved);
  const redirect=(error:string)=>res.redirect(`${config.app.frontendUrl}/accounts?error=${error}`);
  if(req.query.error || typeof req.query.code!=='string') return redirect('cancelled');
  const provider=['linkedin','linkedin-pages','youtube','tiktok','x'].includes(req.params.platform)?req.params.platform:'facebook';
  // A state issued for one provider is never accepted on another provider's callback.
  if((session.provider||'facebook')!==provider) return redirect('connection_failed');
  if(provider==='linkedin') {
    try { await connectLinkedin(req.query.code,session.workspaceId); return res.redirect(`${config.app.frontendUrl}/accounts?connected=linkedin`); }
    catch { return redirect('connection_failed'); }
  }
  if(provider==='x' || provider==='tiktok') {
    try { await (provider==='x'?connectX:connectTiktok)(req.query.code,session.codeVerifier,session.workspaceId); return res.redirect(`${config.app.frontendUrl}/accounts?connected=${provider}`); }
    catch { return redirect('connection_failed'); }
  }
  if(provider==='youtube') {
    try { await connectYoutube(req.query.code,session.workspaceId); return res.redirect(`${config.app.frontendUrl}/accounts?connected=youtube`); }
    catch(e:any) { return redirect(e?.message==='NO_CHANNEL'?'youtube_no_channel':'connection_failed'); }
  }
  if(provider==='linkedin-pages') {
    try {
      const found=await discoverLinkedinPages(req.query.code);
      const selection=randomBytes(32).toString('hex');
      // Same encrypted, expiring, user/workspace-bound selection as Facebook Pages.
      await redis.set(`selection:${hash(selection)}`,encryptToken(JSON.stringify({...session,...found})),'EX',600);
      return res.redirect(`${config.app.frontendUrl}/accounts?selection=${selection}`);
    } catch { return redirect('connection_failed'); }
  }
  try {
    const token=(await axios.get(`${graphBase()}/oauth/access_token`,{params:{client_id:config.social.facebook_client_id,client_secret:config.social.facebook_client_secret,redirect_uri:callback(),code:req.query.code},timeout:15000})).data;
    const headers={Authorization:`Bearer ${token.access_token}`};
    const permissions=(await axios.get(`${graphBase()}/me/permissions`,{headers,timeout:15000})).data.data.filter((p:any)=>p.status==='granted').map((p:any)=>p.permission);
    const pages:any[]=[]; let after:string|undefined;
    do {
      const response=(await axios.get(`${graphBase()}/me/accounts`,{headers,params:{fields:permissions.includes('instagram_basic') ? 'id,name,access_token,tasks,instagram_business_account{id,username}' : 'id,name,access_token,tasks',limit:100,after},timeout:15000})).data;
      pages.push(...response.data); after=response.paging?.next?response.paging.cursors?.after:undefined;
    } while(after && pages.length<500);
    const selection=randomBytes(32).toString('hex');
    await redis.set(`selection:${hash(selection)}`,encryptToken(JSON.stringify({...session,pages,permissions,expires:token.expires_in?Date.now()+token.expires_in*1000:null})), 'EX',600);
    return res.redirect(`${config.app.frontendUrl}/accounts?selection=${selection}`);
  } catch { return redirect('connection_failed'); }
});
async function selectionFor(req:any) {
  const id=typeof req.query.selection==='string'?req.query.selection:req.body.selection;
  if(typeof id!=='string' || !/^[a-f0-9]{64}$/.test(id)) throw new ApiError(400,'Please reconnect to select your pages.');
  const value=await redis.get(`selection:${hash(id)}`);
  if(!value) throw new ApiError(410,'Page selection expired. Please reconnect.');
  const session=JSON.parse(decryptToken(value));
  if(session.workspaceId!==req.headers['x-workspace-id'] || session.userId!==req.user.id) throw new ApiError(403,'This connection belongs to another workspace.');
  return {id,session};
}
const getSelection=catchAsync(async(req,res)=>{
  const {session}=await selectionFor(req);
  send(res,session.pages.map((p:any)=>({id:p.id,name:p.name,instagram:p.instagram_business_account?{id:p.instagram_business_account.id,name:p.instagram_business_account.username}:null})));
});
const confirmSelection=catchAsync(async(req,res)=>{
  const {id,session}=await selectionFor(req);
  if(!Array.isArray(req.body.pageIds) || !req.body.pageIds.length || req.body.pageIds.some((id:any)=>!session.pages.some((p:any)=>p.id===id))) throw new ApiError(400,'Choose an eligible page.');
  const lock=await redis.set(`selection-lock:${hash(id)}`,'1','EX',60,'NX');
  if(!lock) throw new ApiError(409,'Connection is already being saved.');
  try {
    if(session.provider==='linkedin-pages') { await saveLinkedinPages(session,req.body.pageIds); await redis.del(`selection:${hash(id)}`); return send(res,{connected:true}); }
    for(const page of session.pages.filter((p:any)=>req.body.pageIds.includes(p.id))) {
      const has=(scope:string)=>session.permissions.includes(scope);
      // Scheduler connections do not subscribe to messaging/comment webhooks.
      for(const platform of ['FACEBOOK','INSTAGRAM'] as const) {
        if(platform==='INSTAGRAM' && !page.instagram_business_account) continue;
        const externalAccountId=platform==='FACEBOOK'?page.id:page.instagram_business_account.id;
        const tasks=page.tasks || [];
        const can=(task:string)=>tasks.includes('MANAGE') || tasks.includes(task);
        const capabilities={
          publishing: platform==='FACEBOOK' ? has('pages_manage_posts')&&has('pages_read_engagement')&&can('CREATE_CONTENT') : has('instagram_basic')&&has('pages_read_engagement')&&has('instagram_content_publish'),
          messaging:false, comments:false,
        };
        const data={workspaceId:session.workspaceId,platform,externalAccountId,accountName:platform==='FACEBOOK'?page.name:page.instagram_business_account.username || page.name,accessToken:encryptToken(page.access_token),tokenExpiry:session.expires?new Date(session.expires):null,settings:{capabilities,pageId:page.id},connectionStatus:capabilities.publishing?'CONNECTED':'LIMITED_ACCESS'};
        const existing=await prisma.socialAccount.findFirst({where:{workspaceId:session.workspaceId,platform,externalAccountId}});
        if(existing) await prisma.socialAccount.update({where:{id:existing.id},data}); else await prisma.socialAccount.create({data});
      }
    }
    await redis.del(`selection:${hash(id)}`); send(res,{connected:true});
  } finally { await redis.del(`selection-lock:${hash(id)}`); }
});
export const oauthController={getAuthUrl,handleCallback,getSelection,confirmSelection};
