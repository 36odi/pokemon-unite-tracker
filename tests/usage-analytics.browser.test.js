// All URLs (including the production-shaped origin) are intercepted locally.
// No production requests, account creation or real DB writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const origin='https://36odi.github.io',base=origin+'/pokemon-unite-tracker/';
const source=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const api=source.match(/const SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const row={id:'usage-battle',series_id:'usage-series',result:'win',pokemon:'ピカチュウ',match_type:'solo',created_at:'2026-10-01T10:00:00Z'};
const series={id:'usage-series',name:'検証用',created_at:'2026-10-01T00:00:00Z',archived:false};
const user={id:'00000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',user_metadata:{username:'検証'},app_metadata:{provider:'email'}};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const expiry=Math.floor(Date.now()/1000)+3600;
const session={access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',role:'authenticated',exp:expiry})+'.fixture',token_type:'bearer',expires_in:3600,expires_at:expiry,refresh_token:'fixture',user};
let checks=0,browser;
function equal(a,b,l){assert.deepEqual(a,b,l);checks++;}
async function setup({logged=false,excluded=false,local=false}={}){
 const context=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block',timezoneId:'America/Los_Angeles'});
 const state={sends:[],errors:[],status:201,code:null,failSave:false};
 const appBase=local?'http://localhost/pokemon-unite-tracker/':base;
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.url().startsWith(appBase)){
   const rel=decodeURIComponent(url.pathname.slice('/pokemon-unite-tracker/'.length))||'index.html';
   const file=path.resolve(ROOT,rel);
   if(!path.relative(ROOT,file).startsWith('..')&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file,contentType:mime[path.extname(file)]||'application/octet-stream'});
   return route.fulfill({status:404,body:''});
  }
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','content-type':'application/json'};
  const json=(data,status=200)=>route.fulfill({headers,status,body:JSON.stringify(data)});
  if(url.origin!==api)return route.fulfill({status:200,contentType:'application/javascript',body:''});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/rest/v1/usage_browser_days'){
   state.sends.push({body:req.postDataJSON(),headers:await req.allHeaders()});
   return json(state.code?{code:state.code}:null,state.status);
  }
  if(url.pathname==='/auth/v1/user')return json(user);
  if(url.pathname==='/auth/v1/token')return json(session);
  const table=url.pathname.replace('/rest/v1/','');
  if(table==='battles'&&req.method()==='POST'&&state.failSave)return json({code:'42501',message:'test failure'},403);
  if(req.method()==='GET'){
   const rows=table==='series'?[series]:table==='battles'?[row]:[];
   return json(req.headers().accept?.includes('vnd.pgrst.object')?(rows[0]||null):rows);
  }
  return json(null);
 });
 await context.addInitScript(({logged,excluded,series,row,api,session})=>{
  if(localStorage.getItem('usage-test-seeded'))return;
  localStorage.setItem('usage-test-seeded','1');
  localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('pwaBarHidden','1');
  localStorage.setItem('visits_disabled','1');
  if(excluded)localStorage.setItem('usage_excluded','1');
  if(logged)localStorage.setItem('sb-'+new URL(api).hostname.split('.')[0]+'-auth-token',JSON.stringify(session));
  else{
   localStorage.setItem('guestMode','1');
   localStorage.setItem('guest_series',JSON.stringify([series]));
   localStorage.setItem('guest_battles_'+series.id,JSON.stringify([row]));
  }
 },{logged,excluded,series,row,api,session});
 const page=await context.newPage();page.on('pageerror',e=>state.errors.push(e.message));
 await page.goto(appBase,{waitUntil:'load'});
 await page.waitForFunction(()=>document.getElementById('app')?.style.display!=='none'&&document.querySelector('#seriesSelect option[value="usage-series"]'));
 await page.locator('#seriesSelect').selectOption(series.id);
 await page.waitForFunction(()=>battles.length===1);
 return {context,page,state};
}
async function settled(page){await page.waitForTimeout(150);}
async function resetDay(page){await page.evaluate(()=>localStorage.removeItem('usage_sent_day'));}
(async()=>{
 try{
  browser=await chromium.launch(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const {context,page,state}=await setup();
  await settled(page);equal(state.sends.length,0,'initial view and restoring data are not usage');
  await page.evaluate(()=>openEditModal('usage-battle'));
  await page.getByRole('button',{name:'保存する',exact:true}).click();await settled(page);
  equal(state.sends.length,0,'unchanged save not counted');
  await page.locator('.page-tab').filter({hasText:'分析'}).click();
  await page.waitForFunction(()=>localStorage.getItem('usage_sent_day'));
  equal(state.sends.length,1,'explicit populated analysis counts');
  const identity=state.sends[0].body.browser_id;
  await page.locator('.page-tab').filter({hasText:'トラッカー'}).click();
  await page.locator('.btn-win').click();await settled(page);
  equal(state.sends.length,1,'save on same day deduplicated');
  await resetDay(page);
  await page.locator('.btn-loss').click();await settled(page);
  equal(state.sends.length,2,'successful guest save counts');
  await resetDay(page);
  await page.locator('.page-tab').filter({hasText:'ラボ'}).click();await page.waitForFunction(()=>labDataReady);
  await page.locator('[data-lab-tab="calc"]').click();await settled(page);
  equal(state.sends.length,2,'lab initial view not counted');
  await page.locator('#labPokeSelect').focus();await page.locator('#labPokeSelect').press('Home');await page.locator('#labPokeSelect').press('ArrowDown');await page.locator('#labPokeSelect').press('Enter');await settled(page);
  equal(state.sends.length,3,'valid stats result counts');
  await resetDay(page);
  await page.locator('#labCalcPanel').getByRole('button',{name:'計算する',exact:true}).click();await settled(page);
  equal(state.sends.length,3,'unchanged calculation does not count');
  const slider=page.locator('#labLvSlider');await slider.focus();await slider.press('ArrowRight');await settled(page);
  equal(state.sends.length,4,'committed range adjustment counts');
  await resetDay(page);
  await page.locator('[data-lab-tab="medal"]').click();await settled(page);
  equal(state.sends.length,4,'medal restoration not counted');
  await page.locator('.medal-chip').first().click();await settled(page);
  equal(state.sends.length,5,'medal edit counts even if clicked DOM was replaced');
  await resetDay(page);
  await page.locator('[data-lab-tab="dmg"]').click();
  for(const selector of ['#dcAtkPoke','#dcDefPoke']){
   await page.locator(selector).focus();await page.locator(selector).press('Home');await page.locator(selector).press('ArrowDown');await page.locator(selector).press('Enter');
  }
  await settled(page);equal(state.sends.length,5,'damage inputs alone do not count');
  await page.locator('#labDmgCalcPanel').getByRole('button',{name:'計算する',exact:true}).click();
  await settled(page);equal(state.sends.length,6,'valid damage result counts');
  await resetDay(page);await page.evaluate(()=>openUsageSettings());
  await page.locator('#usageEnabled').uncheck();await page.locator('#usageSettingsModal button').click();
  await page.locator('[data-lab-tab="medal"]').click();
  await page.locator('.medal-chip').nth(1).click();await settled(page);
  equal(state.sends.length,6,'opt out suppresses edits');
  await page.reload();await settled(page);equal(state.sends.length,6,'opt out survives reload');
  equal(await page.evaluate(()=>localStorage.getItem('usage_browser_id')),identity,'reload and opt out keep identity');
  await page.setViewportSize({width:390,height:600});await page.evaluate(()=>openUsageSettings());
  const bounds=await page.locator('.usage-settings').boundingBox();
  equal(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y>=0&&bounds.y+bounds.height<=600,true,'settings fit a small screen');
  await page.locator('#usageSettingsModal button').scrollIntoViewIfNeeded();
  await page.locator('#usageSettingsModal button').click();
  equal(await page.locator('#usageSettingsModal').isVisible(),false,'settings can be closed on small screen');
  for(const send of state.sends){
   equal(Object.keys(send.body),['browser_id'],'payload contains only browser ID');
   equal(['authorization','cookie','referer'].filter(k=>send.headers[k]),[],'no account token, cookies or referrer');
  }
  equal(state.errors,[],'guest page has no errors');await context.close();
  for(const options of [{logged:true},{excluded:true},{local:true}]){
   const f=await setup(options);await f.page.locator('.page-tab').filter({hasText:'分析'}).click();await settled(f.page);
   equal(f.state.sends.length,options.logged?1:0,JSON.stringify(options)+' counting boundary');
   if(options.logged){
    equal(await f.page.evaluate(()=>isGuest()),false,'logged-in fixture actually authenticated');
    equal(f.state.sends[0].headers.authorization,undefined,'authenticated app does not attach bearer token');
    equal(f.state.sends[0].body.browser_id===user.id,false,'random ID is not account ID');
    await resetDay(f.page);f.state.failSave=true;
    await f.page.locator('.page-tab').filter({hasText:'トラッカー'}).click();
    await f.page.locator('.btn-win').click();await settled(f.page);
    equal(f.state.sends.length,1,'failed cloud save does not count');
   }
   equal(f.state.errors,[],JSON.stringify(options)+' no page errors');await f.context.close();
  }
  console.log(`ALL PASS — ${checks} browser usage checks; external requests/real DB writes: 0`);
 }finally{await browser?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
