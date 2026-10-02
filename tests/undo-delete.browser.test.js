#!/usr/bin/env node
// 対戦記録の削除（取り消し猶予つき）の実ブラウザ検証。外部通信はすべて隔離し、Supabaseの通信境界を模擬する。
// 実行: NODE_PATHにPlaywrightの置き場を設定し node tests/undo-delete.browser.test.js
// ブラウザ: 既定はEdge。BROWSER_EXECUTABLE（実行ファイルのパス）か BROWSER_CHANNEL で変更できる。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const appSrc=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const apiOrigin=appSrc.match(/const SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const clone=x=>JSON.parse(JSON.stringify(x));
let checks=0;
function equal(actual,expected,label){ assert.deepEqual(actual,expected,label); checks++; }

const seriesA={id:'series-a',name:'検証A',archived:false,created_at:'2026-08-02T00:00:00.000Z'};
const seriesB={id:'series-b',name:'検証B',archived:false,created_at:'2026-08-01T00:00:00.000Z'};
const mk=(sid,i,result)=>({id:`${sid}-${i}`,series_id:sid,result,match_type:'solo',pokemon:'ピカチュウ',rank:null,is_bot:false,
  kills:null,assists:null,dmg_dealt:null,dmg_taken:null,heal:null,goals:null,exclude_from_avg_stats:false,
  created_at:`2026-08-0${i}T00:00:00.000Z`});
const rowsA=[mk('series-a',1,'win'),mk('series-a',2,'loss'),mk('series-a',3,'win')];
const rowsB=[mk('series-b',1,'win'),mk('series-b',2,'win')];
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',
  email:'fixture@example.invalid',user_metadata:{player_id:'fixture',username:'検証用'},app_metadata:{provider:'email'}};
function session(){
  const now=Math.floor(Date.now()/1000);
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  return {access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',role:'authenticated',exp:now+3600,iat:now})+'.fixture',
    token_type:'bearer',expires_in:3600,expires_at:now+3600,refresh_token:'local-fixture-only',user};
}
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
  if(path.relative(ROOT,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
let origin,browser;
const results=[];

async function setup(mode){
  const state={series:[clone(seriesA),clone(seriesB)],battles:clone([...rowsA,...rowsB]),medal_presets:[],deletes:[],failDelete:false,deleteDelayMs:0};
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin){await route.continue();return;}
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','content-type':'application/json'};
    const json=(data,status=200)=>route.fulfill({status,headers,body:JSON.stringify(data)});
    if(url.origin!==apiOrigin){await route.fulfill({status:200,contentType:'application/javascript',body:''});return;}
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    if(url.pathname==='/auth/v1/token'){await json(session());return;}
    if(url.pathname==='/auth/v1/user'){await json(user);return;}
    const table=url.pathname.replace('/rest/v1/','');
    if(!['series','battles','medal_presets'].includes(table)){await json({message:'Unexpected local test endpoint'},500);return;}
    const match=row=>[...url.searchParams].every(([k,v])=>{
      if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
      if(v.startsWith('in.('))return v.slice(4,-1).split(',').map(s=>s.replaceAll('"','')).includes(String(row[k]));
      return true;
    });
    const project=row=>{
      const cols=url.searchParams.get('select');
      if(!cols||cols==='*')return clone(row);
      return Object.fromEntries(cols.split(',').map(k=>[k,row[k]??null]));
    };
    if(req.method()==='GET'){
      let data=state[table].filter(match).map(clone);
      const orders=(url.searchParams.get('order')||'').split(',').filter(Boolean);
      data.sort((a,b)=>{for(const o of orders){const [k,dir]=o.split('.');const d=String(a[k]??'').localeCompare(String(b[k]??''));if(d)return dir==='desc'?-d:d;}return 0;});
      const from=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
      data=data.slice(from,from+limit).map(project);
      await json(req.headers().accept?.includes('vnd.pgrst.object')?(data[0]||null):data);return;
    }
    if(req.method()==='DELETE'&&table==='battles'){
      const ids=state.battles.filter(match).map(b=>b.id);
      state.deletes.push(ids);
      if(state.deleteDelayMs)await new Promise(r=>setTimeout(r,state.deleteDelayMs));
      if(state.failDelete){state.failDelete=false;await json({message:'Local simulated delete failure'},400);return;}
      state.battles=state.battles.filter(b=>!ids.includes(b.id));
      await route.fulfill({status:204,headers});return;
    }
    await json({message:'Unexpected write in this test'},500);
  });
  if(mode==='guest'){
    await context.addInitScript(({a,b,ra,rb})=>{
      if(localStorage.getItem('__undoFixtureReady'))return;
      localStorage.setItem('__undoFixtureReady','1');
      localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');
      localStorage.setItem('guest_series',JSON.stringify([a,b]));
      localStorage.setItem('guest_battles_'+a.id,JSON.stringify(ra.slice().reverse()));
      localStorage.setItem('guest_battles_'+b.id,JSON.stringify(rb.slice().reverse()));
    },{a:seriesA,b:seriesB,ra:rowsA,rb:rowsB});
  }
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin,{waitUntil:'load'});
  if(mode==='account'){
    await page.locator('#playerId').fill('fixture');await page.locator('#password').fill('local-test-password');
    await page.locator('#authBtn').click();
    await page.waitForFunction(()=>document.getElementById('appSection').style.display==='block');
  }
  await chooseSeries(page,seriesA.id,rowsA.length);
  return {page,context,state,errors};
}
async function chooseSeries(page,id,count){
  await page.waitForFunction(id=>[...document.getElementById('seriesSelect').options].some(o=>o.value===id),id);
  await page.locator('#seriesSelect').selectOption(id);
  await page.waitForFunction(({id,count})=>currentSeriesId===id&&battles.length===count,{id,count});
}
const del=page=>page.locator('button[aria-label="この対戦記録を削除"]').first().click();
const guestCount=(page,id)=>page.evaluate(id=>guestGetBattles(id).length,id);
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('pendingBattleDeletes')||'[]').length);
async function setVisibility(page,v){
  await page.evaluate(v=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>v});document.dispatchEvent(new Event('visibilitychange'));},v);
}

async function guestScenarios(){
  // 1. 連続削除 → まとめて取り消し
  {
    const {page,context,errors}=await setup('guest');
    try{
      await del(page);await del(page);
      equal(await page.locator('.toast-undo:not(.closing) .toast-undo-msg').textContent(),'対戦記録を2件削除しました','consecutive deletes share one toast');
      equal(await page.evaluate(()=>[battles.length,pendingDeletes.size]),[1,2],'two records hidden and pending');
      equal(await stored(page),2,'pending deletes are saved on the device');
      await page.getByRole('button',{name:'元に戻す'}).click();
      equal(await page.evaluate(()=>[battles.length,pendingDeletes.size,battles.map(b=>b.id)]),[3,0,['series-a-3','series-a-2','series-a-1']],'undo restores both records in newest-first order');
      equal(await guestCount(page,seriesA.id),3,'guest storage untouched after undo');
      equal(await stored(page),0,'saved pending list cleared after undo');
      await page.waitForTimeout(5600);
      equal(await guestCount(page,seriesA.id),3,'nothing deleted after the window when undone');
      equal(errors,[],'no page errors (consecutive undo)');
      results.push({scenario:'guest consecutive delete + undo',status:'pass'});
    }finally{await context.close();}
  }
  // 2. 別シリーズ・分析表示中に取り消し → 分析も戻る
  {
    const {page,context,errors}=await setup('guest');
    try{
      await del(page);
      await chooseSeries(page,seriesB.id,rowsB.length);
      await page.evaluate(()=>showPage('analysis'));
      await page.waitForFunction(()=>analysisLoaded&&!analysisNeedsRefresh);
      equal(await page.evaluate(()=>allSeriesData.reduce((n,s)=>n+s.battles.length,0)),4,'analysis excludes the pending delete');
      await page.getByRole('button',{name:'元に戻す'}).click();
      await page.waitForFunction(()=>!analysisNeedsRefresh&&allSeriesData.reduce((n,s)=>n+s.battles.length,0)===5);
      equal(await page.evaluate(()=>[allSeriesData.reduce((n,s)=>n+s.battles.length,0),battles.length,currentSeriesId]),[5,2,'series-b'],'undo from another series refreshes analysis and keeps current series');
      equal(await guestCount(page,seriesA.id),3,'original series storage intact');
      await page.evaluate(()=>showPage('tracker'));
      await chooseSeries(page,seriesA.id,3);
      equal(errors,[],'no page errors (cross-series undo)');
      results.push({scenario:'guest undo from another series refreshes analysis',status:'pass'});
    }finally{await context.close();}
  }
  // 3. 別アプリにいる間は時間を数えない
  {
    const {page,context,errors}=await setup('guest');
    try{
      await del(page);
      await setVisibility(page,'hidden');
      await page.waitForTimeout(6500);
      equal([await page.evaluate(()=>pendingDeletes.size),await guestCount(page,seriesA.id)],[1,3],'countdown paused while hidden');
      equal(await page.locator('.toast-undo').evaluate(el=>el.classList.contains('paused')),true,'progress bar paused while hidden');
      await setVisibility(page,'visible');
      await page.waitForTimeout(2000);
      equal([await page.evaluate(()=>pendingDeletes.size),await guestCount(page,seriesA.id)],[1,3],'still undoable shortly after returning');
      await page.waitForTimeout(3800);
      equal([await page.evaluate(()=>pendingDeletes.size),await guestCount(page,seriesA.id),await stored(page)],[0,2,0],'deleted after the visible window ends');
      equal(errors,[],'no page errors (hidden pause)');
      results.push({scenario:'guest countdown pauses while hidden',status:'pass'});
    }finally{await context.close();}
  }
  // 4. 猶予中に閉じた（再読み込み）→ 次回起動時に確定
  {
    const {page,context,errors}=await setup('guest');
    try{
      await del(page);
      await page.reload({waitUntil:'load'});
      await page.waitForFunction(()=>currentSeriesId==='series-a'&&battles.length===2);
      equal([await guestCount(page,seriesA.id),await stored(page)],[2,0],'pending delete finalized on next launch');
      equal(errors,[],'no page errors (reload)');
      results.push({scenario:'guest pending delete finalized after reload',status:'pass'});
    }finally{await context.close();}
  }
}

async function accountScenarios(){
  // 5. ログイン時：連続削除は1回のDELETEにまとめる／取り消し時はDBへ送らない
  {
    const {page,context,state,errors}=await setup('account');
    try{
      await del(page);await del(page);
      await page.getByRole('button',{name:'元に戻す'}).click();
      await page.waitForTimeout(5600);
      equal([state.deletes.length,state.battles.length],[0,5],'undo sends no DELETE');
      await del(page);await del(page);
      await page.waitForTimeout(5600);
      equal(state.deletes,[['series-a-2','series-a-3']].map(x=>x.sort()).map(x=>x),'one DELETE with both ids after the window');
      equal(await page.evaluate(()=>[battles.length,pendingDeletes.size]),[1,0],'screen matches DB after commit');
      equal(errors,[],'no page errors (account commit)');
      results.push({scenario:'account batched delete + undo',status:'pass'});
    }finally{await context.close();}
  }
  // 6. ログイン時：削除失敗 → 記録が戻り、エラー表示
  {
    const {page,context,state,errors}=await setup('account');
    try{
      state.failDelete=true;
      await del(page);
      await page.waitForTimeout(5600);
      await page.waitForFunction(()=>battles.length===3);
      equal([state.battles.length,await page.locator('.toast-error').count()>0],[5,true],'failed delete restores the record and shows an error');
      equal(errors,[],'no page errors (account failure)');
      results.push({scenario:'account delete failure restores record',status:'pass'});
    }finally{await context.close();}
  }
  // 7. ログイン時：Aの削除が通信中に、Bを削除して取り消す → Aは削除・Bは残る（表示と保存内容が一致）
  {
    const {page,context,state,errors}=await setup('account');
    try{
      state.deleteDelayMs=3000;
      await del(page); // A = series-a-3
      await page.waitForFunction(()=>committingDeletes.size===1,null,{timeout:8000});
      equal(await page.evaluate(()=>[pendingDeletes.size,[...committingDeletes.keys()]]),[0,['series-a-3']],'committed delete moves out of the undoable set');
      await del(page); // B = series-a-2
      equal(await page.locator('.toast-undo:not(.closing) .toast-undo-msg').textContent(),'対戦記録を削除しました','toast counts only the undoable delete');
      await page.getByRole('button',{name:'元に戻す'}).click();
      equal(await page.evaluate(()=>battles.map(b=>b.id)),['series-a-2','series-a-1'],'undo restores only B while A is in flight');
      await page.waitForFunction(()=>committingDeletes.size===0,null,{timeout:8000});
      await page.waitForTimeout(5600);
      equal(state.deletes,[['series-a-3']],'only A is sent to the DB');
      equal(state.battles.filter(b=>b.series_id==='series-a').map(b=>b.id).sort(),['series-a-1','series-a-2'],'DB keeps B and drops A');
      equal(await page.evaluate(()=>battles.map(b=>b.id)),['series-a-2','series-a-1'],'screen matches DB');
      equal(await stored(page),0,'saved pending list cleared');
      equal(errors,[],'no page errors (in-flight undo)');
      results.push({scenario:'account undo during in-flight delete keeps screen and DB consistent',status:'pass'});
    }finally{await context.close();}
  }
}

(async()=>{
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
    const exe=process.env.BROWSER_EXECUTABLE;
    browser=await chromium.launch(exe?{executablePath:exe,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    await guestScenarios();await accountScenarios();
    console.log(`ALL PASS — ${checks} undo-delete browser checks, ${results.length} scenarios; real DB writes: 0`);
  }catch(error){
    console.error(error.stack);process.exitCode=1;
  }finally{
    if(browser)await browser.close();await new Promise(r=>server.close(r));
  }
})();
