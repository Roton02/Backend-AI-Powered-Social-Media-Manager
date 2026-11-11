import {createHmac,timingSafeEqual} from 'crypto';
import {Request,Response} from 'express';
import {inboxService} from '../services/inbox.service';
export function validMetaSignature(raw:Buffer|undefined,signature:string|undefined,secret:string|undefined) {
 if(!raw || !secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
 const expected=createHmac('sha256',secret).update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
export const socialWebhookController={
 verify(req:Request,res:Response) {
  if(process.env.META_WEBHOOK_VERIFY_TOKEN && req.query['hub.mode']==='subscribe' && req.query['hub.verify_token']===process.env.META_WEBHOOK_VERIFY_TOKEN) return res.status(200).send(req.query['hub.challenge']);
  return res.sendStatus(403);
 },
 async handleWebhook(req:Request,res:Response) {
  if(!validMetaSignature((req as any).rawBody,req.headers['x-hub-signature-256'] as string,process.env.FACEBOOK_CLIENT_SECRET)) return res.sendStatus(403);
  const platform=req.body.object==='instagram'?'INSTAGRAM':req.body.object==='page'?'FACEBOOK':null;
  if(!platform)return res.sendStatus(400);
  try {await inboxService.normalizeAndSave(platform,req.body);return res.sendStatus(200);}catch{return res.sendStatus(503);}
 }
};
