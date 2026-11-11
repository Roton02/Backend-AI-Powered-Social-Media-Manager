import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import axios from 'axios';
import prisma from '../../../../shared/prisma';
import ApiError from '../../../../errors/ApiErrors';
export const graphBase = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v25.0'}`;
function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new ApiError(503, 'Social connections are temporarily unavailable. Please contact support.');
  return Buffer.from(value, 'hex');
}
export function encryptToken(value: string) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv);
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return ['enc1',iv.toString('hex'),cipher.getAuthTag().toString('hex'),data.toString('hex')].join('.');
}
export function decryptToken(value: string) {
  const [version,iv,tag,data]=value.split('.');
  if(version!=='enc1') throw new ApiError(409,'Please reconnect this account.');
  const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'hex'));
  cipher.setAuthTag(Buffer.from(tag,'hex'));
  return Buffer.concat([cipher.update(Buffer.from(data,'hex')),cipher.final()]).toString('utf8');
}
export function publicAccount(account: any) {
  const { accessToken, refreshToken, settings, ...safe } = account;
  const expired=account.tokenExpiry && new Date(account.tokenExpiry).getTime()<=Date.now();
  const state=expired?'EXPIRED':account.connectionStatus || 'ACTION_REQUIRED';
  // Earliest date the owner must reconnect: a fixed token expiry (LinkedIn) or Meta's 90-day data-access window.
  const deadlines=[account.tokenExpiry?new Date(account.tokenExpiry).getTime():null,Number(settings?.dataAccessExpiresAt)||null].filter(Boolean) as number[];
  const reconnectBy=deadlines.length?new Date(Math.min(...deadlines)).toISOString():null;
  return {...safe, kind:settings?.kind || null, reconnectBy, connectionStatus:state, capabilities: ['CONNECTED','LIMITED_ACCESS'].includes(state) ? settings?.capabilities || {} : {publishing:false,messaging:false,comments:false}};
}
export async function connectedAccount(workspaceId:string, accountId:string, capability:string) {
  const account=await prisma.socialAccount.findFirst({where:{id:accountId,workspaceId}});
  if(!account || !account.externalAccountId || !(publicAccount(account).capabilities as any)[capability]) throw new ApiError(409,'This account needs reconnection or additional permissions.');
  return {...account,token:decryptToken(account.accessToken)};
}
export async function metaRequest(account:any,path:string,data?:any) {
  try {
    const response=await axios.request({method:data?'POST':'GET',url:`${graphBase()}/${path}`,data,headers:{Authorization:`Bearer ${account.token}`},timeout:20000});
    return response.data;
  } catch(error:any) {
    if(error.response?.data?.error?.code===190) await prisma.socialAccount.update({where:{id:account.id},data:{connectionStatus:'EXPIRED'}});
    const apiError:any=new ApiError(502,'The platform could not complete this request. Check your connection and try again.');
    // Keep Meta's own error (never the token) so callers can tell a definite rejection from an ambiguous failure.
    const meta=error.response?.data?.error;
    if(error.response) apiError.metaError={status:error.response.status,code:meta?.code,subcode:meta?.error_subcode,type:meta?.type,message:meta?.error_user_msg||meta?.message,fbtraceId:meta?.fbtrace_id};
    console.error('Meta request failed:',JSON.stringify({path:path.split('?')[0],...(apiError.metaError||{network:error.code||'no response'})}));
    throw apiError;
  }
}
