import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
const request = require('supertest');
import prisma from '../../src/shared/prisma';
import auth from '../../src/app/middlewares/auth';
import tenantGuard from '../../src/app/middlewares/tenantGuard';
import config from '../../src/config';
import workspaceRoutes from '../../src/app/modules/workspace/workspace.route';
import { authService } from '../../src/app/modules/auth/auth.service';
import { userValidation } from '../../src/app/modules/user/user.validation';
jest.mock('../../src/shared/prisma', () => ({ __esModule:true, default: {
 user: { findUnique:jest.fn(), findFirst:jest.fn() }, workspaceMember:{findUnique:jest.fn()},
 workspace:{findFirst:jest.fn(),create:jest.fn()}
}}));
const db = prisma as any;
const userId = '012345678901234567890123';
const workspaceId = '012345678901234567890124';
const app = express(); app.use(express.json());
app.get('/protected',auth(),tenantGuard,(_req,res)=>res.json({success:true}));
app.use('/workspace',workspaceRoutes);
app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || 500).json({message:err.message}));
const token = () => jwt.sign({id:userId,role:'Client'},config.jwt.jwt_secret!,{expiresIn:'1h'});
beforeEach(()=>{jest.clearAllMocks(); db.user.findUnique.mockResolvedValue({id:userId,role:'Client',status:'Active'});});
test('public registration rejects Admin role',()=>{
 expect(userValidation.userRegisterValidationSchema.safeParse({userName:'Test',email:'test@example.com',phone:'01234567890',password:'password123',address:'Test',role:'Admin'}).success).toBe(false);
});
test('authentication rejects absent, expired and reset tokens',async()=>{
 expect((await request(app).get('/protected')).status).toBe(401);
 const expired=jwt.sign({id:userId},config.jwt.jwt_secret!,{expiresIn:-1});
 expect((await request(app).get('/protected').set('Authorization',`Bearer ${expired}`)).status).toBe(401);
 const reset=jwt.sign({id:userId,purpose:'password-reset'},config.jwt.jwt_secret!);
 expect((await request(app).get('/protected').set('Authorization',`Bearer ${reset}`)).status).toBe(401);
});
test('workspace membership rejects another tenant and permits member',async()=>{
 db.workspaceMember.findUnique.mockResolvedValue(null);
 expect((await request(app).get('/protected').set('Authorization',`Bearer ${token()}`).set('x-workspace-id',workspaceId)).status).toBe(403);
 db.workspaceMember.findUnique.mockResolvedValue({workspace:{id:workspaceId}});
 expect((await request(app).get('/protected').set('Authorization',`Bearer ${token()}`).set('x-workspace-id',workspaceId)).status).toBe(200);
});
test('blocked user cannot use an existing session',async()=>{
 db.user.findUnique.mockResolvedValue({id:userId,role:'Client',status:'Blocked'});
 expect((await request(app).get('/protected').set('Authorization',`Bearer ${token()}`)).status).toBe(401);
});
test('workspace creation uses authenticated owner and nested membership',async()=>{
 db.workspace.findFirst.mockResolvedValue(null);db.workspace.create.mockResolvedValue({id:workspaceId,name:'Shop'});
 const r=await request(app).post('/workspace').set('Authorization',`Bearer ${token()}`).send({name:'Shop',slug:'shop',ownerId:'attacker'});
 expect(r.status).toBe(201);expect(r.body.result.name).toBe('Shop');
 expect(db.workspace.create).toHaveBeenCalledWith({data:expect.objectContaining({ownerId:userId,members:{create:{userId,role:'owner'}}})});
});
test('login verifies bcrypt and returns no password',async()=>{
 db.user.findFirst.mockResolvedValue({id:userId,role:'Client',status:'Active',password:await bcrypt.hash('password123',4)});
 await expect(authService.loginUserIntoDB({email:'a@b.com',password:'wrong'})).rejects.toThrow('Invalid credentials');
 const result=await authService.loginUserIntoDB({email:'a@b.com',password:'password123'});
 expect(result.accessToken).toBeTruthy();expect(result).not.toHaveProperty('password');
});
