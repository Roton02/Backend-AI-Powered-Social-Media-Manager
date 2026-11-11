import express from 'express';
const request=require('supertest');
import prisma from '../../src/shared/prisma';
import {aiSettingsController} from '../../src/app/modules/ai-settings/controllers/ai.controller';
import GlobalErrorHandler from '../../src/app/middlewares/globalErrorHandler';
jest.mock('../../src/shared/prisma',()=>({__esModule:true,default:{aIKnowledgeBase:{create:jest.fn(),findFirst:jest.fn(),update:jest.fn(),delete:jest.fn(),findMany:jest.fn()}}}));
const app=express();app.use(express.json());app.post('/knowledge',aiSettingsController.updateKnowledgeBase);app.patch('/knowledge/:id',aiSettingsController.editKnowledgeItem);app.delete('/knowledge/:id',aiSettingsController.deleteKnowledgeItem);app.use(GlobalErrorHandler);
const db=prisma as any;
beforeEach(()=>jest.clearAllMocks());
test('knowledge entries validate content and use tenant header',async()=>{
 const invalid=await request(app).post('/knowledge').set('x-workspace-id','workspace').send({question:' ',answer:''});expect(invalid.status).toBe(400);expect(db.aIKnowledgeBase.create).not.toHaveBeenCalled();
 db.aIKnowledgeBase.create.mockResolvedValue({id:'entry',question:'Hours?',answer:'9 to 5'});
 const valid=await request(app).post('/knowledge').set('x-workspace-id','workspace').send({workspaceId:'attacker',question:'Hours?',answer:'9 to 5'});expect(valid.status).toBe(201);expect(db.aIKnowledgeBase.create).toHaveBeenCalledWith({data:{workspaceId:'workspace',question:'Hours?',answer:'9 to 5',category:'FAQ'}});
});
test('knowledge update and delete reject entries outside workspace',async()=>{
 db.aIKnowledgeBase.findFirst.mockResolvedValue(null);
 expect((await request(app).patch('/knowledge/other').set('x-workspace-id','workspace').send({question:'Hours?',answer:'9 to 5'})).status).toBe(404);
 expect((await request(app).delete('/knowledge/other').set('x-workspace-id','workspace')).status).toBe(404);expect(db.aIKnowledgeBase.update).not.toHaveBeenCalled();expect(db.aIKnowledgeBase.delete).not.toHaveBeenCalled();
});
test('knowledge edit persists verified answer',async()=>{
 db.aIKnowledgeBase.findFirst.mockResolvedValue({id:'entry'});db.aIKnowledgeBase.update.mockResolvedValue({id:'entry',answer:'10 to 6'});
 const result=await request(app).patch('/knowledge/entry').set('x-workspace-id','workspace').send({question:'Hours?',answer:'10 to 6'});expect(result.status).toBe(200);expect(result.body.result.answer).toBe('10 to 6');
});
