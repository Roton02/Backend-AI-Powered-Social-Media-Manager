import express from 'express';
import config from '../../src/config';
import axios from 'axios';
import prisma from '../../src/shared/prisma';
const request=require('supertest');
import { encryptToken,decryptToken,publicAccount } from '../../src/app/modules/social/services/meta.service';
import { oauthController } from '../../src/app/modules/social/controllers/oauth/oauth.controller';
import {redisConnection} from '../../src/shared/queue.service';
jest.mock('../../src/shared/queue.service',()=>({redisConnection:{getdel:jest.fn(),get:jest.fn(),set:jest.fn().mockResolvedValue('OK'),del:jest.fn()}}));
jest.mock('axios');
jest.mock('../../src/shared/prisma',()=>({__esModule:true,default:{socialAccount:{findFirst:jest.fn(),create:jest.fn(),update:jest.fn()}}}));
const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as any).user={id:'user'};next();});app.get('/auth/:platform',oauthController.getAuthUrl);app.get('/selection',oauthController.getSelection);app.post('/selection',oauthController.confirmSelection);app.get('/callback',oauthController.handleCallback);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.statusCode||500).json({message:e.message}));
beforeEach(()=>{process.env.TOKEN_ENCRYPTION_KEY='a'.repeat(64);jest.clearAllMocks();});
test('tokens authenticated at rest; tampering rejected',()=>{
 const encrypted=encryptToken('test-token');expect(encrypted).not.toContain('test-token');expect(decryptToken(encrypted)).toBe('test-token');
 const parts=encrypted.split('.');parts[2]='0'.repeat(32);expect(()=>decryptToken(parts.join('.'))).toThrow();expect(()=>decryptToken('legacy-plaintext')).toThrow();
});
test('account responses omit token fields and disable expired capabilities',()=>{
 const value=publicAccount({accessToken:'secret',refreshToken:'secret',settings:{capabilities:{publishing:true}},connectionStatus:'CONNECTED',tokenExpiry:new Date(0)});
 expect(value).not.toHaveProperty('accessToken');expect(value).not.toHaveProperty('refreshToken');expect(value.connectionStatus).toBe('EXPIRED');expect(value.capabilities.publishing).toBe(false);
});
test('OAuth requires matching browser state and rejects replay',async()=>{
 expect((await request(app).get('/callback?state=abc&code=test')).status).toBe(400);
 expect(redisConnection.getdel).not.toHaveBeenCalled();
 (redisConnection.getdel as jest.Mock).mockResolvedValue(null);
 expect((await request(app).get('/callback?state=abc&code=test').set('Cookie','meta_oauth=abc')).status).toBe(400);
 expect(redisConnection.getdel).toHaveBeenCalledTimes(1);
});

test('configured authorization has random state, expiry and HttpOnly browser binding',async()=>{
 config.app.backendUrl='http://localhost:5000';config.social.facebook_client_id='test-id';config.social.facebook_client_secret='test-secret';
 const response=await request(app).get('/auth/facebook').set('x-workspace-id','workspace');expect(response.status).toBe(200);
 expect(new URL(response.body.result.url).searchParams.get('scope')?.split(',')).toEqual(['pages_show_list','pages_read_engagement','pages_manage_posts','business_management']);
 const state=new URL(response.body.result.url).searchParams.get('state');expect(state).toHaveLength(64);expect(state).not.toBe('workspace');
 expect(response.headers['set-cookie'][0]).toContain('HttpOnly');expect(redisConnection.set).toHaveBeenCalledWith(expect.stringMatching(/^oauth:/),expect.any(String),'EX',600);
});
test('callback consumes state once even when consent is denied',async()=>{
 (redisConnection.getdel as jest.Mock).mockResolvedValueOnce(JSON.stringify({userId:'user',workspaceId:'workspace'})).mockResolvedValueOnce(null);
 const first=await request(app).get('/callback?state=abc&error=access_denied').set('Cookie','meta_oauth=abc');expect(first.status).toBe(302);
 const replay=await request(app).get('/callback?state=abc&error=access_denied').set('Cookie','meta_oauth=abc');expect(replay.status).toBe(400);expect(axios.get).not.toHaveBeenCalled();
});
test('page selection never returns page tokens and is tenant bound',async()=>{
 const session={userId:'user',workspaceId:'workspace',pages:[{id:'page',name:'Page',access_token:'secret-page-token'}]};
 (redisConnection.get as jest.Mock).mockResolvedValue(encryptToken(JSON.stringify(session)));
 const own=await request(app).get('/selection?selection='+'a'.repeat(64)).set('x-workspace-id','workspace');expect(own.status).toBe(200);expect(JSON.stringify(own.body)).not.toContain('secret-page-token');
 const other=await request(app).get('/selection?selection='+'a'.repeat(64)).set('x-workspace-id','other');expect(other.status).toBe(403);
});
test('confirm connects only selected eligible page with encrypted token and task capabilities',async()=>{
 const session={userId:'user',workspaceId:'workspace',pages:[{id:'page',name:'Page',access_token:'secret-page-token',tasks:['CREATE_CONTENT']}],permissions:['pages_manage_posts','pages_read_engagement'],expires:null};
 (redisConnection.get as jest.Mock).mockResolvedValue(encryptToken(JSON.stringify(session)));
 const bad=await request(app).post('/selection').set('x-workspace-id','workspace').send({selection:'a'.repeat(64),pageIds:['another-page']});expect(bad.status).toBe(400);expect(prisma.socialAccount.create).not.toHaveBeenCalled();
 const good=await request(app).post('/selection').set('x-workspace-id','workspace').send({selection:'a'.repeat(64),pageIds:['page']});expect(good.status).toBe(200);
 const data=(prisma.socialAccount.create as jest.Mock).mock.calls[0][0].data;expect(decryptToken(data.accessToken)).toBe('secret-page-token');expect(data.connectionStatus).toBe('CONNECTED');expect(data.settings.capabilities).toEqual({publishing:true,messaging:false,comments:false});
});
