#!/usr/bin/env node
// 対戦記録のメダルセット（記録・前回の復元・履歴・編集・CSV・分析・DB列の有無）の実ブラウザ検証。
// 外部通信はすべて隔離し、Supabaseの通信境界を模擬する。実DB書き込みなし。
// 実行: NODE_PATHにPlaywrightの置き場を設定し node tests/medal-record.browser.test.js
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
function equal(a,e,l){assert.deepEqual(a,e,l);checks++;}
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
  if(path.relative(ROOT,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
const series={id:'medal-series',name:'メダル検証',archived:false,created_at:'2026-08-01T00:00:00.000Z'};
const PRESETS=[
  {name:'白6+茶6+青2',slots:['ピジョット','オニドリル','ケンタロス',null,null,null,null,null,null,null],rarities:['gold','silver','gold','gold','gold','gold','gold','gold','gold','gold']},
  {name:null,slots:['ギャラドス','ニョロボン',null,null,null,null,null,null,null,null],rarities:['gold','bronze','gold','gold','gold','gold','gold','gold','gold','gold']},
  null,null,null,null,null,null
];
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',
  email:'fixture@example.invalid',user_metadata:{player_id:'fixture',username:'検証用'},app_metadata:{provider:'email'}};
function session(){
  const now=Math.floor(Date.now()/1000);
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  return {access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',role:'authenticated',exp:now+3600,iat:now})+'.fixture',
    token_type:'bearer',expires_in:3600,expires_at:now+3600,refresh_token:'local-fixture-only',user};
}
let origin,browser;
async function setup(mode,{columnReady=true,guestLeftovers=false}={}){
  const state={series:[clone(series)],battles:[],medal_presets:[{user_id:user.id,data:clone(PRESETS)}],writes:[],reads:[],next:1};
  const context=await browser.newContext({viewport:{width:1100,height:900},colorScheme:'dark',serviceWorkers:'block',acceptDownloads:true});
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
    const cols=url.searchParams.get('select');
    if(table==='battles'&&!columnReady&&cols&&cols.split(',').includes('medal_set')){
      await json({code:'42703',message:'column battles.medal_set does not exist'},400);return;
    }
    const match=row=>[...url.searchParams].every(([k,v])=>{
      if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
      if(v.startsWith('in.('))return v.slice(4,-1).split(',').map(s=>s.replaceAll('"','')).includes(String(row[k]));
      return true;
    });
    const project=row=>(!cols||cols==='*')?clone(row):Object.fromEntries(cols.split(',').map(k=>[k,row[k]??null]));
    if(req.method()==='GET'){
      state.reads.push({table,cols});
      let data=(state[table]||[]).filter(match).map(clone);
      const orders=(url.searchParams.get('order')||'').split(',').filter(Boolean);
      data.sort((a,b)=>{for(const o of orders){const [k,dir]=o.split('.');const d=String(a[k]??'').localeCompare(String(b[k]??''));if(d)return dir==='desc'?-d:d;}return 0;});
      const from=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
      data=data.slice(from,from+limit).map(project);
      await json(req.headers().accept?.includes('vnd.pgrst.object')?(data[0]||null):data);return;
    }
    const data=req.postDataJSON();state.writes.push({table,method:req.method(),data:clone(data)});
    if(table==='battles'&&!columnReady&&data&&('medal_set' in (Array.isArray(data)?data[0]:data))){
      await json({code:'PGRST204',message:"Could not find the 'medal_set' column"},400);return;
    }
    if(req.method()==='POST'){
      const saved=(Array.isArray(data)?data:[data]).map(row=>({id:'local-'+state.next++,created_at:new Date(Date.now()+state.next*1000).toISOString(),exclude_from_avg_stats:false,...row}));
      state[table].push(...saved);
      await json(req.headers().accept?.includes('vnd.pgrst.object')?project(saved[0]):saved.map(project),201);return;
    }
    if(req.method()==='PATCH'){
      const saved=state[table].filter(match);saved.forEach(r=>Object.assign(r,data));
      await json(saved.map(project));return;
    }
    await json({message:'unexpected'},500);
  });
  await context.addInitScript(({mode,series,presets,guestLeftovers})=>{
    if(localStorage.getItem('__medalFixture'))return;localStorage.setItem('__medalFixture','1');
    localStorage.setItem('unite_medal_presets',JSON.stringify(presets));
    if(guestLeftovers){ // ログイン前にゲストで記録していたデータ（移行の対象）
      localStorage.setItem('guest_series',JSON.stringify([{id:'g-series',name:'ゲスト時代',archived:false,created_at:'2026-07-01T00:00:00.000Z'}]));
      localStorage.setItem('guest_battles_g-series',JSON.stringify([
        {id:'g1',result:'win',match_type:'solo',pokemon:'ピカチュウ',medal_set:{label:'白6+茶6+青2',slots:['ピジョット'],rarities:['gold']},created_at:'2026-07-02T00:00:00.000Z'},
        {id:'g2',result:'loss',match_type:'solo',pokemon:'ルカリオ',created_at:'2026-07-03T00:00:00.000Z'}]));
    }
    if(mode==='guest'){
      localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');
      localStorage.setItem('guest_series',JSON.stringify([series]));localStorage.setItem('guest_battles_'+series.id,'[]');
    }
  },{mode,series,presets:PRESETS,guestLeftovers});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin,{waitUntil:'load'});
  if(mode==='account'){
    await page.locator('#playerId').fill('fixture');await page.locator('#password').fill('local-test-password');
    await page.locator('#authBtn').click();
    await page.waitForFunction(()=>document.getElementById('appSection').style.display==='block');
  }
  await page.waitForFunction(id=>[...document.getElementById('seriesSelect').options].some(o=>o.value===id),series.id);
  await page.locator('#seriesSelect').selectOption(series.id);
  await page.waitForFunction(id=>currentSeriesId===id,series.id);
  return {page,context,state,errors};
}
const optionTexts=page=>page.locator('#medalSetSelect option').allTextContents();
async function recordWith(page,poke,medalIdx,result='win'){
  await page.evaluate(p=>selectPoke(p),poke);
  if(medalIdx!==undefined){
    await page.evaluate(()=>{if(!document.getElementById('detailSection').classList.contains('open'))toggleDetail();});
    await page.locator('#medalSetSelect').selectOption(String(medalIdx));
  }
  const before=await page.evaluate(()=>battles.length);
  await page.evaluate(r=>record(r),result);
  await page.waitForFunction(n=>battles.length===n+1,before);
}
(async()=>{
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
    const exe=process.env.BROWSER_EXECUTABLE;
    browser=await chromium.launch(exe?{executablePath:exe,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});

    // ── ゲスト：記録・復元・履歴・プリセット変更後も記録は不変・編集・CSV・分析 ──
    {
      const {page,context,errors}=await setup('guest');
      equal(await optionTexts(page),['— なし —','白6+茶6+青2（3枚）','パターン2（2枚）'],'guest: options are the saved presets');
      await recordWith(page,'ピカチュウ',0);
      const stored=await page.evaluate(id=>guestGetBattles(id)[0].medal_set,series.id);
      equal(stored,{label:'白6+茶6+青2',slots:PRESETS[0].slots,rarities:PRESETS[0].rarities},'guest: battle stores the preset contents');
      equal((await page.locator('#historyList .h-medal').first().innerText()).trim(),'白6+茶6+青2','guest: history shows the medal set');
      await recordWith(page,'ルカリオ',1,'loss');
      // ポケモンを切り替えて戻すと、そのポケモンで前回使ったセットが選ばれる
      await page.evaluate(()=>selectPoke('ピカチュウ'));
      equal(await page.locator('#medalSetSelect').inputValue(),'0','guest: Pikachu restores its last medal set');
      await page.evaluate(()=>selectPoke('ルカリオ'));
      equal(await page.locator('#medalSetSelect').inputValue(),'1','guest: Lucario restores its last medal set');
      await page.evaluate(()=>selectPoke('カメックス'));
      equal(await page.locator('#medalSetSelect').inputValue(),'','guest: a new Pokémon starts with none');
      // プリセットを上書きしても過去の記録は当時の中身のまま
      await page.evaluate(()=>{labMedalPresets[0]={name:'別のセット',slots:['ポッポ',null,null,null,null,null,null,null,null,null],rarities:Array(10).fill('gold')};localStorage.setItem(PRESET_KEY,JSON.stringify(labMedalPresets));refreshRecordMedalSelects();});
      equal(await page.evaluate(id=>guestGetBattles(id).find(b=>b.pokemon==='ピカチュウ').medal_set.label,series.id),'白6+茶6+青2','guest: old record keeps its contents after the preset changes');
      await page.evaluate(()=>selectPoke('ピカチュウ'));
      equal(await page.locator('#medalSetSelect').inputValue(),'','guest: changed preset is not auto-selected for an old key');
      // 編集：記録時のまま → なし
      const pikaId=await page.evaluate(id=>guestGetBattles(id).find(b=>b.pokemon==='ピカチュウ').id,series.id);
      await page.evaluate(id=>openEditModal(id),pikaId);
      equal(await page.locator('#editMedalSet').inputValue(),'__keep','guest: edit defaults to keeping the recorded set');
      equal((await page.locator('#editMedalSet option').allTextContents())[1],'記録時のまま：白6+茶6+青2','guest: edit shows the recorded set');
      await page.evaluate(()=>saveEdit());
      equal(await page.evaluate(id=>guestGetBattles(id).find(b=>b.pokemon==='ピカチュウ').medal_set?.label,series.id),'白6+茶6+青2','guest: saving with keep does not change the set');
      // CSV
      const wait=page.waitForEvent('download');
      await page.evaluate(async()=>{await openCsvModal();document.querySelectorAll('.csv-series-check').forEach(c=>c.checked=true);await exportCsv();});
      const csv=fs.readFileSync(await (await wait).path(),'utf8');
      equal(csv.includes('"メダルセット","メダル構成"'),true,'guest: CSV has medal set columns');
      equal(csv.includes('"ピジョット(金)、オニドリル(銀)、ケンタロス(金)"'),true,'guest: CSV lists the medals with rarity');
      // 分析
      await page.evaluate(()=>showPage('analysis'));
      await page.waitForFunction(()=>analysisLoaded&&!analysisNeedsRefresh);
      await page.evaluate(()=>{switchAnalysis('pokedetail');initPokeDetailSelect();const s=document.getElementById('detailPokeSelect');s.value='ピカチュウ';renderPokeDetail();});
      equal((await page.locator('#pokeDetailContent').innerText()).includes('メダルセット別'),true,'guest: Pokémon detail has a medal set section');
      equal((await page.locator('#pokeDetailContent').innerText()).includes('白6+茶6+青2'),true,'guest: Pokémon detail lists the set');
      await page.evaluate(id=>{switchAnalysis('seriesanal');const s=document.getElementById('seriesanalSelect');s.value=id;renderSeriesAnalysis();},series.id);
      await page.waitForFunction(()=>document.body.innerText.includes('メダルセット別勝率'));
      equal(await page.evaluate(()=>document.getElementById('seriesanalContent')?.innerHTML.includes('パターン2')??document.body.innerHTML.includes('パターン2')),true,'guest: series analysis lists medal sets');
      equal(errors,[],'guest: no page errors');
      await context.close();
    }
    // ── ポケモン別詳細：名前がまぎらわしい別々のセットを混ぜない ──
    {
      const {page,context,errors}=await setup('guest');
      await page.evaluate(()=>{
        labMedalPresets=[
          {name:'セット',slots:['ポッポ',null,null,null,null,null,null,null,null,null],rarities:Array(10).fill('gold')},
          {name:'セット',slots:['ピジョン',null,null,null,null,null,null,null,null,null],rarities:Array(10).fill('gold')},
          {name:'セット (2)',slots:['ピジョット',null,null,null,null,null,null,null,null,null],rarities:Array(10).fill('gold')},
          null,null,null,null,null];
        localStorage.setItem(PRESET_KEY,JSON.stringify(labMedalPresets));refreshRecordMedalSelects();
      });
      for(const i of [0,1,2]) await recordWith(page,'ピカチュウ',i);
      await page.evaluate(()=>showPage('analysis'));
      await page.waitForFunction(()=>analysisLoaded&&!analysisNeedsRefresh);
      await page.evaluate(()=>{switchAnalysis('pokedetail');initPokeDetailSelect();const s=document.getElementById('detailPokeSelect');s.value='ピカチュウ';renderPokeDetail();});
      const rows=await page.evaluate(()=>{
        const sec=[...document.querySelectorAll('#pokeDetailContent .detail-subsection')].find(d=>d.querySelector('.detail-subsection-title')?.textContent.includes('メダルセット別'));
        return [...sec.querySelectorAll('tbody tr')].map(tr=>[...tr.children].slice(0,2).map(td=>td.textContent.trim()));
      });
      equal(rows.length,3,'detail: three different sets stay three rows');
      equal(new Set(rows.map(r=>r[0])).size,3,'detail: row names are unique');
      equal(rows.every(r=>r[1]==='1'),true,'detail: each set counts only its own battle');
      equal(errors,[],'detail: no page errors');
      await context.close();
    }
    // ── ゲスト→アカウント移行：DBに列が無ければ何も書き込まずに中止し、ゲストデータを残す ──
    {
      const {page,context,state,errors}=await setup('account',{columnReady:false,guestLeftovers:true});
      await page.waitForFunction(()=>medalSetColumnReady===false);
      const r=await page.evaluate(()=>migrateGuestData());
      equal(r,{blocked:'medal_set'},'migration: blocked when medal sets cannot be stored');
      equal(state.writes.filter(w=>w.method==='POST'),[],'migration: nothing written when blocked');
      equal(await page.evaluate(()=>[guestGetSeries().length,guestGetBattles('g-series').length,guestGetBattles('g-series')[0].medal_set?.label]),[1,2,'白6+茶6+青2'],'migration: guest data kept intact');
      equal(errors,[],'migration blocked: no page errors');
      await context.close();
    }
    // ── ゲスト→アカウント移行：DBに列があればメダルセットごと移す ──
    {
      const {page,context,state,errors}=await setup('account',{columnReady:true,guestLeftovers:true});
      await page.waitForFunction(()=>medalSetColumnReady===true);
      const r=await page.evaluate(()=>migrateGuestData());
      equal([r.failed,r.battleCount],[false,2],'migration: succeeds when the column exists');
      const rows=state.writes.find(w=>w.table==='battles'&&w.method==='POST'&&Array.isArray(w.data)).data;
      equal(rows.find(x=>x.pokemon==='ピカチュウ').medal_set.label,'白6+茶6+青2','migration: medal set carried over');
      equal('medal_set' in rows.find(x=>x.pokemon==='ルカリオ'),false,'migration: battles without a set stay without');
      equal(await page.evaluate(()=>guestGetSeries().length),0,'migration: guest data cleared only after success');
      equal(errors,[],'migration ok: no page errors');
      await context.close();
    }
    // ── ログイン（DBに列あり）：保存・読込に medal_set が含まれる ──
    {
      const {page,context,state,errors}=await setup('account');
      await page.waitForFunction(()=>medalSetColumnReady===true);
      equal(await page.evaluate(()=>document.getElementById('medalSetField').style.display),'','account: medal field shown when the column exists');
      await recordWith(page,'ピカチュウ',0);
      const ins=state.writes.find(w=>w.table==='battles'&&w.method==='POST').data;
      equal(ins.medal_set.label,'白6+茶6+青2','account: insert includes the medal set');
      equal(state.reads.filter(r=>r.table==='battles'&&r.cols&&r.cols.includes('series_id')).every(r=>r.cols.split(',').includes('medal_set')),true,'account: battle reads include medal_set');
      equal((await page.locator('#historyList .h-medal').first().innerText()).trim(),'白6+茶6+青2','account: history shows the medal set');
      equal(errors,[],'account: no page errors');
      await context.close();
    }
    // ── ログイン（DBに列なし）：欄を出さず、従来どおり保存・読込できる ──
    {
      const {page,context,state,errors}=await setup('account',{columnReady:false});
      await page.waitForFunction(()=>medalSetColumnReady===false);
      equal(await page.evaluate(()=>document.getElementById('medalSetField').style.display),'none','no column: medal field hidden');
      await recordWith(page,'ピカチュウ');
      const ins=state.writes.find(w=>w.table==='battles'&&w.method==='POST').data;
      equal('medal_set' in ins,false,'no column: insert does not send medal_set');
      equal(await page.evaluate(()=>battles.length),1,'no column: battle saved and reloaded');
      equal(errors,[],'no column: no page errors');
      await context.close();
    }
    // BOT designation can be removed after recording, for guests and accounts.
    for(const mode of ['guest','account']){
      const {page,context,state,errors}=await setup(mode);
      await page.locator('#isBotCheck').check();
      await recordWith(page,'ピカチュウ',0);
      const id=await page.evaluate(()=>battles[0].id);
      equal(await page.evaluate(()=>statBattles().length),0,mode+': BOT initially excluded');
      await page.evaluate(id=>openEditModal(id),id);
      equal(await page.locator('#editIsBotCheck').isChecked(),true,mode+': editor restores BOT flag');
      await page.locator('#editIsBotCheck').uncheck();
      await page.getByRole('button',{name:'キャンセル',exact:true}).click();
      equal(await page.evaluate(()=>battles[0].is_bot),true,mode+': cancel preserves BOT');
      await page.evaluate(id=>openEditModal(id),id);
      equal(await page.locator('#editIsBotCheck').isChecked(),true,mode+': reopening resets unsaved checkbox');
      await page.locator('#editIsBotCheck').uncheck();
      await page.getByRole('button',{name:'保存する',exact:true}).click();
      await page.waitForFunction(()=>!document.getElementById('editModal').classList.contains('open')&&battles[0].is_bot===false);
      equal(await page.evaluate(()=>statBattles().length),1,mode+': unmarked battle included in stats');
      equal(await page.locator('#historyList .badge-bot').count(),0,mode+': BOT badge removed');
      equal(await page.evaluate(()=>battles[0].medal_set.label),'白6+茶6+青2',mode+': medal data preserved');
      if(mode==='account')equal(state.writes.filter(w=>w.method==='PATCH'&&w.table==='battles').at(-1).data.is_bot,false,'account: false explicitly sent to DB');
      await page.reload({waitUntil:'load'});
      await page.waitForFunction(()=>battles.length===1);
      equal(await page.evaluate(()=>battles[0].is_bot),false,mode+': removed flag survives reload');
      await page.evaluate(()=>showPage('analysis'));
      await page.waitForFunction(()=>analysisLoaded&&allSeriesData.some(s=>s.battles.length===1));
      equal(await page.evaluate(()=>allSeriesData[0].battles.length),1,mode+': analysis includes corrected battle');
      equal(errors,[],mode+': BOT edit has no browser errors');
      await context.close();
    }
    console.log(`ALL PASS — ${checks} medal/BOT record checks; real DB writes: 0`);
  }catch(e){console.error(e.stack);process.exitCode=1;}
  finally{if(browser)await browser.close();server.close();}
})();
