// Real browser and frontend; all API responses are explicit test fixtures (PASS_MOCKED).
const puppeteer=require('puppeteer');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const frontend=path.resolve(__dirname,'../../../Frontend');
const server=spawn(process.execPath,[path.join(frontend,'node_modules/next/dist/bin/next'),'start','--port','3095'],{cwd:frontend,stdio:'ignore'});
const user={id:'012345678901234567890123',userName:'Test Owner',role:'Client',email:'test@example.com',phone:'01234567890'};
const workspace={id:'012345678901234567890124',name:'Test Shop',slug:'test-shop',ownerId:user.id,settings:{ai_auto_reply:false}};
const account={id:'012345678901234567890125',platform:'FACEBOOK',accountName:'Test Page',connectionStatus:'CONNECTED',capabilities:{publishing:true,messaging:true,comments:true}};
const conversation={id:'012345678901234567890126',senderId:'test-customer',platform:'FACEBOOK',aiEnabled:true,humanTakeover:false,messages:[{id:'012345678901234567890127',text:'When are you open?',direction:'incoming',status:'unread',timestamp:new Date().toISOString()}]};
let created=false;const calls=[];let browser;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 for(let i=0;i<50;i++){try{if((await fetch('http://localhost:3095/sign-in')).ok)break;}catch{}await pause(200);}
 browser=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 console.log('Browser launched');
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);
 page.on('request',async req=>{
  const u=new URL(req.url());if(u.pathname.startsWith('/socket.io'))return req.abort();
  if(!u.pathname.startsWith('/api/v1/'))return req.continue();
  const method=req.method(),route=u.pathname.slice(7);const body=req.postData()?JSON.parse(req.postData()):{};
  calls.push({route,method,body,headers:req.headers()});let result={},status=200;
  if(method==='OPTIONS')return req.respond({status:204,headers:{'Access-Control-Allow-Origin':'http://localhost:3095','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'authorization,content-type,x-workspace-id','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,DELETE'}});
  if(route==='/users/request')result={email:user.email};
  else if(route==='/users/create')result={...user,accessToken:'test-browser-token'};
  else if(route==='/auth/login') result={...user,accessToken:'test-browser-token'};
  else if(route==='/auth/profile')result=user;
  else if(route==='/workspace/my'){result=workspace;if(!created)status=404;}
  else if(route==='/workspace'&&method==='POST'){created=true;result=workspace;}
  else if(route==='/workspace'&&method==='PATCH'){Object.assign(workspace.settings,body.settings);result=workspace;}
  else if(route==='/workspace/stats')result={totalMessages:0,unreadMessages:0,pendingAIReplies:0,publishedPosts:0,failedPosts:0,connectedAccounts:1,recentActivity:[]};
  else if(route==='/social/accounts')result=[account];
  else if(route==='/publishing'&&method==='GET')result=[];
  else if(route==='/publishing')result={jobId:'test-job',status:body.draft?'DRAFT':'PENDING'};
  else if(route==='/social/conversations')result=[conversation];
  else if(route.endsWith('/takeover')){conversation.humanTakeover=body.enabled;conversation.aiEnabled=!body.enabled;result=conversation;}
  else if(route==='/ai/knowledge-base')result=[];
  else if(route==='/social/comments')result=[];
  else if(route.includes('notifications'))result=[];
  await req.respond({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'http://localhost:3095','Access-Control-Allow-Credentials':'true'},body:JSON.stringify({success:status===200,result,message:status===404?'No workspace found':'OK'})});
 });
 const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===t&&!b.disabled),{},text);await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t).click(),text);};
 console.log('Check signup and verification');
 await page.goto('http://localhost:3095/sign-up');
 for(const [id,value] of Object.entries({userName:'Test Owner',email:'test@example.com',phone:'01234567890',address:'Test address',password:'password123',confirmPassword:'password123'}))await page.type('#'+id,value);
 await page.click('button[type="submit"]');await page.waitForSelector('#otp');await page.type('#otp','123456');await page.click('button[type="submit"]');await page.waitForSelector('#business-name');
 assert(calls.some(c=>c.route==='/users/create'&&c.body.otp==='123456'));
 await page.evaluate(()=>localStorage.clear());
 console.log('Check login');
 await page.goto('http://localhost:3095/sign-in');await page.type('#email','test@example.com');await page.type('#password','password123');await click('Sign In');
 console.log('Check workspace onboarding');
 await page.waitForSelector('#business-name');await page.type('#business-name','Test Shop');await click('Create workspace');await page.waitForFunction(()=>!document.querySelector('#business-name'));
 assert(calls.some(c=>c.route==='/workspace'&&c.method==='POST'&&c.body.name==='Test Shop'));
 console.log('Check draft');
 await page.goto('http://localhost:3095/create-post');await page.waitForSelector('input[type=checkbox][value="'+account.id+'"]');await page.click('input[type=checkbox][value="'+account.id+'"]');await page.type('textarea','Browser test draft');await click('Save draft');await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');
 const draft=calls.find(c=>c.route==='/publishing'&&c.method==='POST');assert.equal(draft.body.draft,true);assert.equal(draft.body.accountId,account.id);assert.equal(draft.headers['x-workspace-id'],workspace.id);
 console.log('Check inbox');
 await page.goto('http://localhost:3095/inbox');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('test-customer')));await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('test-customer')).click());await click('Take over');await page.waitForFunction(()=>document.body.textContent.includes('Human takeover'));
 await page.type('textarea','A person is helping you.');await click('Send reply');await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');assert(calls.some(c=>c.route.endsWith('/reply')&&c.body.requestId&&c.body.text==='A person is helping you.'));
 await page.setViewport({width:390,height:844});await page.goto('http://localhost:3095/accounts');await page.waitForFunction(()=>document.body.textContent.includes('Test Page'));const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false);
 assert.deepEqual(errors,[]);console.log('PASS_MOCKED: browser signup/verification, login, workspace onboarding, draft/account headers, takeover, manual reply, mobile accounts; no browser exceptions.');
})().catch(async e=>{console.error(e.stack);console.error('API routes:',calls.map(c=>c.route+' '+c.method));if(browser){const pages=await browser.pages();console.error(await pages.at(-1).evaluate(()=>document.body.innerText));}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();setTimeout(()=>process.exit(process.exitCode||0),1000).unref();});
