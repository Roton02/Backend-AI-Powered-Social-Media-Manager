// Read-only impact review. Reports counts/index keys only, never documents or credentials.
require('dotenv').config();
const {MongoClient}=require('mongodb');
const {Prisma}=require('@prisma/client');
const fs=require('node:fs');
(async()=>{
 const client=new MongoClient(process.env.DATABASE_URL,{serverSelectionTimeoutMS:5000});
 try{
 await client.connect();const db=client.db();let conflicts=0;
 const schema=fs.readFileSync('prisma/schema.prisma','utf8');
 for(const model of Prisma.dmmf.datamodel.models){
 const name=model.dbName||model.name;const col=db.collection(name);const count=await col.countDocuments();
 const indexes=await col.listIndexes().toArray().catch(e=>{if(e.code===26)return [];throw e;});
 const block=schema.match(new RegExp('model '+model.name+' \\{([\\s\\S]*?)\\n\\}'))?.[1]||'';
 const unique=[...model.fields.filter(f=>f.isUnique).map(f=>[f.dbName||f.name]),...[...block.matchAll(/@@unique\(\[([^\]]+)\]/g)].map(m=>m[1].split(',').map(v=>v.trim()))];
 for(const fields of unique){const id=Object.fromEntries(fields.map(f=>[f,{$ifNull:['$'+f,null]}]));const dup=await col.aggregate([{$group:{_id:id,n:{$sum:1}}},{$match:{n:{$gt:1}}},{$count:'groups'}]).toArray();if(dup.length){conflicts+=dup[0].groups;console.log('CONFLICT',name,fields.join(','),'groups='+dup[0].groups);}}
 console.log(JSON.stringify({collection:name,documents:count,indexes:indexes.map(i=>({key:i.key,unique:!!i.unique}))}));
 }
 console.log('Unique-conflict groups:',conflicts);if(conflicts)process.exitCode=1;
 }finally{await client.close();}
})().catch(()=>{console.error('Database impact review failed; details suppressed.');process.exitCode=1;});
