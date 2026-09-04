#!/usr/bin/env node
// 実ブラウザ + 実アプリ。外部通信をすべて隔離し、Supabaseの通信境界を模擬する。
// NODE_PATHにPlaywrightの置き場を設定し node tests/avg-stats.browser.test.js。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const OUT=path.resolve(process.env.AVG_STATS_ARTIFACT_DIR||path.join(ROOT,'work','avg-stats-browser'));
fs.mkdirSync(OUT,{recursive:true});
const appSrc=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const apiOrigin=appSrc.match(/const SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const clone=x=>JSON.parse(JSON.stringify(x));
let checks=0;
function equal(actual,expected,label){ assert.deepEqual(actual,expected,label); checks++; }
function truth(value,label){ assert.ok(value,label); checks++; }
const label='平均スタッツから除外する';
const help='短時間で終了した試合などに。勝率・試合数には含まれます。';
const series={id:'fixture-series',name:'平均スタッツ検証',archived:false,created_at:'2026-08-01T00:00:00.000Z'};
const statsKeys=['kills','assists','dmg_dealt','dmg_taken','heal','goals'];
const fixtures=[
  {result:'win',kills:10,dmg_dealt:1000},
  {result:'loss',kills:0},
  {result:'win',dmg_dealt:3000},
  {result:'loss',kills:20,dmg_dealt:100,exclude_from_avg_stats:true},
  {result:'win',exclude_from_avg_stats:true}
].map((b,i)=>({...Object.fromEntries(statsKeys.map(k=>[k,null])),id:'fixture-'+(i+1),series_id:series.id,
  pokemon:'ピカチュウ',match_type:'solo',rank:'レート '+[1100,1090,1110,1080,1120][i],
  created_at:`2026-08-01T00:0${i+1}:00.000Z`,is_bot:false,...b}));
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
  if(path.relative(ROOT,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404);res.end();return;
  }
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
let origin,browser;
const results=[];
const screenshots=[];
async function setup(mode,rows=fixtures,accountSeed=true){
  const state={series:accountSeed?[clone(series)]:[],battles:accountSeed?clone(rows):[],medal_presets:[],writes:[],reads:[],failNext:false,next:1};
  const context=await browser.newContext({viewport:{width:1200,height:900},colorScheme:'dark',forcedColors:'none',serviceWorkers:'block',acceptDownloads:true});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin){ await route.continue();return; }
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','content-type':'application/json'};
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
      state.reads.push({table,columns:url.searchParams.get('select')});
      let data=state[table].filter(match).map(clone);
      const orders=(url.searchParams.get('order')||'').split(',').filter(Boolean);
      data.sort((a,b)=>{
        for(const order of orders){const [k,direction]=order.split('.');const d=String(a[k]??'').localeCompare(String(b[k]??''));if(d)return direction==='desc'?-d:d;}
        return 0;
      });
      const from=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
      data=data.slice(from,from+limit).map(project);
      await json(req.headers().accept?.includes('vnd.pgrst.object')?(data[0]||null):data);return;
    }
    if(!['POST','PATCH'].includes(req.method())){await json({message:'Unexpected write method'},500);return;}
    if(table==='battles'&&state.failNext){state.failNext=false;await json({message:'Local simulated write failure',code:'PGRST204'},400);return;}
    const data=req.postDataJSON();state.writes.push({table,method:req.method(),data:clone(data)});
    let saved;
    if(req.method()==='POST'){
      saved=(Array.isArray(data)?data:[data]).map(row=>({id:'local-'+table+'-'+state.next++,created_at:new Date().toISOString(),
        ...(table==='battles'?{exclude_from_avg_stats:false}:{}),...row}));
      state[table].push(...saved);
    }else{
      saved=state[table].filter(match);saved.forEach(row=>Object.assign(row,data));
    }
    await json(req.headers().accept?.includes('vnd.pgrst.object')?project(saved[0]):saved.map(project),req.method()==='POST'?201:200);
  });
  if(mode==='guest'){
    await context.addInitScript(({series,rows})=>{
      if(localStorage.getItem('__avgFixtureReady'))return;
      localStorage.setItem('__avgFixtureReady','1');
      localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');
      localStorage.setItem('guest_series',JSON.stringify([series]));
      localStorage.setItem('guest_battles_'+series.id,JSON.stringify(rows.slice().reverse()));
    },{series,rows});
  }
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin,{waitUntil:'load'});
  if(mode==='account')await login(page);
  await chooseSeries(page,series.id,rows.length);
  return {page,context,state,errors};
}
async function login(page){
  await page.locator('#playerId').fill('fixture');await page.locator('#password').fill('local-test-password');
  await page.locator('#authBtn').click();
  await page.waitForFunction(()=>document.getElementById('appSection').style.display==='block');
}
async function chooseSeries(page,id,count){
  await page.waitForFunction(id=>[...document.getElementById('seriesSelect').options].some(o=>o.value===id),id);
  await page.locator('#seriesSelect').selectOption(id);
  await page.waitForFunction(({id,count})=>currentSeriesId===id&&battles.length===count,{id,count});
}
async function tracker(page){await page.evaluate(()=>showPage('tracker'));}
async function overall(page){return page.evaluate(()=>({
  display:['sTotal','sWins','sLosses','sWR','streakCur','streakCurLabel','streakBestW','streakBestL'].map(id=>document.getElementById(id)?.textContent),
  streak:calcStreak(battles),rates:buildSeriesAnalysisOverview(battles).rateData,
  ids:battles.map(b=>b.id),history:document.querySelectorAll('.h-card').length
}));}
async function summary(loc){return loc.evaluate(el=>({
  head:[...el.querySelectorAll('th')].map(e=>e.textContent),
  rows:[...el.querySelectorAll('tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)),
  excluded:el.querySelector('.stats-excluded-count')?.textContent,
  empty:el.querySelector('.empty')?.textContent||null
}));}
async function screen(page,name,locator){
  const file=path.join(OUT,name+'.png');
  await (locator||page).screenshot({path:file,...(!locator?{fullPage:true}:{})});screenshots.push(file);
}
async function allViews(page,tag,{n=3,excluded=1,empty=null,ko='5.0',damage='2,000'}={}){
  await page.evaluate(async()=>{showPage('analysis');await loadAnalysis();switchAnalysis('total');renderTotalStats();});
  const total=await summary(page.locator('#ttStatsSummary .stats-summary'));
  equal(total.excluded,`平均対象外: ${excluded}件（勝ち${empty&&excluded?excluded:0}件・負け${empty?0:excluded}件）`,tag+' excluded count');
  equal(total.empty,empty,tag+' empty-state message');
  if(n){
    equal(total.head,['項目',`全体(${n})`,'勝ち(2)',`負け(${n-2})`],tag+' denominators');
    equal(total.rows[0][1],ko,tag+' KO average');equal(total.rows[2][1],damage,tag+' damage average');
  }else{equal(total.rows,[],tag+' has no fake zero means');}
  await page.evaluate(()=>switchAnalysis('pokedetail'));
  await page.locator('#detailPokeSelect option[value="ピカチュウ"]').waitFor({state:'attached'});
  await page.locator('#detailPokeSelect').selectOption('ピカチュウ');
  await page.evaluate(()=>renderPokeDetail());
  equal(await summary(page.locator('#pokeDetailContent .stats-summary')),total,tag+' Pokemon detail matches total');
  await page.evaluate(async()=>{switchAnalysis('seriesanal');document.getElementById('seriesanalSelect').value=currentSeriesId;await renderSeriesAnalysis();});
  equal(await summary(page.locator('#seriesanalContent .stats-summary').first()),total,tag+' role average matches total');
  equal(await page.locator('#seriesanalContent .stats-summary').count(),5,tag+' all five roles remain visible');
  equal((await summary(page.locator('#seriesanalContent .stats-summary').nth(1))).empty,'スタッツの記録がありません',tag+' unused role is distinct');
  if(tag==='guest-initial'){
    await page.evaluate(()=>{switchAnalysis('total');renderTotalStats();});
    await screen(page,'desktop-average',page.locator('#ttStatsSummary'));
    await page.setViewportSize({width:390,height:844});
    await screen(page,'mobile-average',page.locator('#ttStatsSummary'));
    truth(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile average does not overflow');
    await page.setViewportSize({width:1200,height:900});
  }
  await tracker(page);
}
async function stored(page,state,mode){return mode==='guest'?page.evaluate(()=>guestGetBattles(currentSeriesId)):clone(state.battles);}
async function editFlag(page,id,value){
  await page.evaluate(id=>openEditModal(id),id);
  equal((await page.locator('label[for="editStatExcludeAvgStats"]').textContent()).trim(),label,'edit exact label');
  equal(await page.locator('#editStatExcludeAvgStatsHelp').textContent(),help,'edit exact help');
  await page.locator('#editStatExcludeAvgStats').setChecked(value);
  await page.locator('#editModal').getByRole('button',{name:'保存する',exact:true}).click();
  await page.waitForFunction(({id,value})=>!document.getElementById('editModal').classList.contains('open')&&battles.find(b=>b.id===id)?.exclude_from_avg_stats===value,{id,value});
}
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&c===','){row.push(field);field='';}
    else if(!quoted&&c==='\n'){row.push(field);rows.push(row);row=[];field='';}
    else if(c!=='\r'&&c!=='\uFEFF')field+=c;
  }
  if(row.length||field){row.push(field);rows.push(row);}return rows;
}
async function csvCheck(page,expected,tag){
  const wait=page.waitForEvent('download');
  await page.evaluate(async()=>{await openCsvModal();document.querySelectorAll('.csv-series-check').forEach(c=>c.checked=true);await exportCsv();});
  const download=await wait;
  const parsed=parseCsv(fs.readFileSync(await download.path(),'utf8'));
  equal(parsed[0].at(-1),'平均スタッツから除外',tag+' CSV flag column');
  equal(parsed.length-1,expected.length,tag+' CSV keeps every battle');
  const expectedRows=expected.map(b=>[...statsKeys.map(k=>b[k]==null?'':String(b[k])),String(b.exclude_from_avg_stats===true)].join('|')).sort();
  const actualRows=parsed.slice(1).map(r=>r.slice(11).join('|')).sort();
  equal(actualRows,expectedRows,tag+' CSV retains all stats and flags');
}
async function recordAndEdit(mode){
  const {page,context,state,errors}=await setup(mode);
  try{
    const before=await overall(page);
    equal(before.display.slice(0,4),['5','3','2','60.0%'],mode+' overall baseline');
    equal(await page.locator('.stats-excluded-badge').count(),2,mode+' history marks numeric and empty flagged battles');
    await allViews(page,mode+'-initial');
    await editFlag(page,'fixture-4',false);
    equal(await overall(page),before,mode+' toggle leaves wins streak rates and history unchanged');
    equal((await stored(page,state,mode)).find(b=>b.id==='fixture-4').dmg_dealt,100,mode+' edit retains damage');
    await allViews(page,mode+'-restored',{n:4,excluded:0,ko:'10.0',damage:'1,367'});
    await editFlag(page,'fixture-4',true);
    await page.reload({waitUntil:'load'});await chooseSeries(page,series.id,5);
    await allViews(page,mode+'-reload');
    await csvCheck(page,await stored(page,state,mode),mode);
    await page.evaluate(()=>document.querySelectorAll('.modal-overlay.open').forEach(el=>el.classList.remove('open')));
    if(!await page.locator('.sub-toggle').filter({hasText:'メモ（任意）'}).isVisible())await page.locator('.detail-toggle').click();
    await page.locator('.sub-toggle').filter({hasText:'メモ（任意）'}).click();
    equal(await page.locator('#statExcludeAvgStats').isChecked(),false,mode+' new record starts unchecked');
    equal((await page.locator('label[for="statExcludeAvgStats"]').textContent()).trim(),label,mode+' exact new label');
    equal(await page.locator('#statExcludeAvgStatsHelp').textContent(),help,mode+' exact new help');
    equal(await page.locator('#statExcludeAvgStats').getAttribute('aria-describedby'),'statExcludeAvgStatsHelp',mode+' checkbox description linked');
    await page.locator('#statKills').fill('7');await page.locator('#statDmgDealt').fill('77');await page.locator('#statGoals').fill('0');
    await page.locator('#statExcludeAvgStats').check();await page.locator('#noteInput').fill('検証用の記録');
    equal(await page.locator('#statKills').inputValue(),'7',mode+' checking retains numeric input');
    if(mode==='guest'){
      await screen(page,'desktop-input',page.locator('#memoSection'));
      await page.setViewportSize({width:390,height:844});await screen(page,'mobile-input',page.locator('#memoSection'));
      truth(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile input does not overflow');
      await page.evaluate(()=>openEditModal('fixture-4'));await page.locator('#editStatExcludeAvgStats').scrollIntoViewIfNeeded();await screen(page,'mobile-edit',page.locator('#editModal .modal'));
      await page.evaluate(()=>closeModal('editModal'));await screen(page,'mobile-history',page.locator('#historyCard'));
      await page.setViewportSize({width:1200,height:900});
    }
    if(mode==='account'){
      state.failNext=true;await page.locator('.btn-win').click();
      await page.waitForFunction(()=>!isRecording&&!!document.querySelector('.toast-error'));
      equal(await page.locator('#statExcludeAvgStats').isChecked(),true,'failed save retains flag');
      equal(await page.locator('#statDmgDealt').inputValue(),'77','failed save retains numeric input');
      equal(state.battles.length,5,'failed save writes no record');
    }
    await page.locator('.btn-win').click();await page.waitForFunction(()=>!isRecording&&battles.length===6);
    equal(await page.locator('#statExcludeAvgStats').isChecked(),false,mode+' successful save resets flag');
    const saved=(await stored(page,state,mode)).find(b=>b.note==='検証用の記録');
    equal([saved.kills,saved.dmg_dealt,saved.goals,saved.exclude_from_avg_stats],[7,77,0,true],mode+' new save preserves all values');
    await page.locator('.btn-loss').click();await page.waitForFunction(()=>!isRecording&&battles.length===7);
    const next=(await stored(page,state,mode)).find(b=>!fixtures.some(f=>f.id===b.id)&&b.id!==saved.id);
    equal(next.exclude_from_avg_stats,false,mode+' next match does not inherit flag');
    await page.reload({waitUntil:'load'});await chooseSeries(page,series.id,7);
    equal(await page.evaluate(id=>battles.find(b=>b.id===id).exclude_from_avg_stats,saved.id),true,mode+' new save survives reload');
    await editFlag(page,saved.id,false);
    if(mode==='account'){
      await page.evaluate(id=>openEditModal(id),saved.id);await page.locator('#editStatExcludeAvgStats').check();
      state.failNext=true;await page.locator('#editModal').getByRole('button',{name:'保存する',exact:true}).click();
      await page.waitForFunction(()=>!!document.querySelector('.toast-error'));
      equal(await page.locator('#editStatExcludeAvgStats').isChecked(),true,'failed edit retains flag input');
      equal(state.battles.find(b=>b.id===saved.id).exclude_from_avg_stats,false,'failed edit does not change stored flag');
      await page.evaluate(()=>closeModal('editModal'));
      const projections=state.reads.filter(r=>r.table==='battles'&&r.columns!=='*');
      truth(projections.some(r=>r.columns.includes('note'))&&projections.some(r=>!r.columns.includes('note')),'both explicit read paths exercised');
      truth(projections.every(r=>r.columns.split(',').includes('exclude_from_avg_stats')),'all explicit reads project new flag');
      truth(state.writes.filter(w=>w.table==='battles').every(w=>typeof w.data.exclude_from_avg_stats==='boolean'),'record and edit send boolean flag');
    }
    await csvCheck(page,await stored(page,state,mode),mode+'-after-save');
    equal(errors,[],mode+' no page errors');results.push({scenario:mode,status:'pass'});
  }finally{await context.close();}
}
async function migration(){
  const {page,context,state,errors}=await setup('guest',fixtures,false);
  try{
    const source=await stored(page,state,'guest');
    await page.evaluate(async()=>{
      localStorage.removeItem('guestMode');
      await db.auth.signInWithPassword({email:'fixture@example.invalid',password:'local-test-password'});
    });
    const result=await page.evaluate(()=>migrateGuestData());
    equal([result.failed,result.seriesCount,result.battleCount],[false,1,5],'guest migration completes');
    const pick=rows=>rows.map(b=>({time:b.created_at,flag:b.exclude_from_avg_stats===true,stats:statsKeys.map(k=>b[k]??null)})).sort((a,b)=>a.time.localeCompare(b.time));
    equal(pick(state.battles),pick(source),'migration preserves numeric and legacy flags');
    const payload=state.writes.find(w=>w.table==='battles').data;
    truth(payload.every(b=>typeof b.exclude_from_avg_stats==='boolean'),'migration sends explicit boolean for every row');
    equal(await page.evaluate(()=>guestGetSeries().length),0,'guest source cleared only after successful migration');
    const id=state.series[0].id;
    await page.reload({waitUntil:'load'});await chooseSeries(page,id,5);
    await allViews(page,'migrated');await csvCheck(page,state.battles,'migrated');
    equal(errors,[],'migration no page errors');results.push({scenario:'guest migration to simulated account',status:'pass'});
  }finally{await context.close();}
}
async function emptyStates(){
  for(const kind of ['all-excluded','all-blank']){
    const rows=[{...fixtures[0],...Object.fromEntries(statsKeys.map(k=>[k,kind==='all-excluded'?0:null])),exclude_from_avg_stats:true}];
    const {page,context,errors}=await setup('guest',rows);
    try{
      await allViews(page,kind,{n:0,excluded:kind==='all-excluded'?1:0,empty:kind==='all-excluded'?'対象の記録がありません':'スタッツの記録がありません'});
      if(kind==='all-excluded'){
        await page.evaluate(()=>{showPage('analysis');switchAnalysis('total');renderTotalStats();});
        await screen(page,'all-excluded-average',page.locator('#ttStatsSummary'));
      }
      equal(errors,[],kind+' no page errors');results.push({scenario:kind,status:'pass'});
    }finally{await context.close();}
  }
}
async function chartRenderRaces(){
  const rows=fixtures.map((b,i)=>({...b,created_at:i<3?b.created_at:`2026-08-02T00:0${i+1}:00.000Z`}));
  const {page,context,errors}=await setup('guest',rows);
  const idle=()=>page.waitForTimeout(250); // Covers both the 50ms render and 100ms chart queues.
  const chartState=()=>page.evaluate(()=>({
    alive:[seriesanalChartInst,seriesanalDayChartInst,seriesanalRateChartInst].map(c=>!!c?.canvas?.isConnected),
    canvasCount:document.querySelectorAll('#seriesanalContent canvas').length
  }));
  try{
    await page.evaluate(()=>{showPage('analysis');switchAnalysis('seriesanal');});await idle();
    equal(errors,[],'rapid navigation creates no chart errors');
    equal(await chartState(),{alive:[true,true,true],canvasCount:3},'all three charts survive overlapping navigation renders');
    await screen(page,'series-chart-race',page.locator('#seriesanalContent .chart-wrap:has(#seriesanalChart)'));

    await page.evaluate(()=>{
      const source=allSeriesData.find(s=>s.id===currentSeriesId).battles[0];
      allSeriesData.push({id:'latest-series',name:'Latest',battles:[
        {...source,id:'latest-1',pokemon:'カビゴン',rank:'レート 1200',created_at:'2026-08-01T00:00:00Z'},
        {...source,id:'latest-2',pokemon:'カビゴン',result:'loss',rank:'レート 1210',created_at:'2026-08-02T00:00:00Z'}
      ]},{id:'empty-series',name:'Empty',battles:[]});
      const sel=document.getElementById('seriesanalSelect');
      sel.add(new Option('Latest','latest-series'));sel.add(new Option('Empty','empty-series'));
      renderSeriesAnalysis();sel.value='latest-series';renderSeriesAnalysis();
    });await idle();
    equal(errors,[],'rapid series changes create no chart errors');
    equal(await page.evaluate(()=>({pokemon:seriesanalChartInst.data.labels,rates:seriesanalRateChartInst.data.datasets[0].data,days:seriesanalDayChartInst.data.labels.length})),
      {pokemon:['カビゴン'],rates:[1200,1210],days:2},'only latest series data is drawn');

    await page.evaluate(()=>{renderSeriesAnalysis();document.getElementById('seriesanalSelect').value='';renderSeriesAnalysis();});await idle();
    equal(errors,[],'clearing selection creates no chart errors');
    equal(await chartState(),{alive:[false,false,false],canvasCount:0},'clearing selection destroys charts and cancels pending draws');

    await page.evaluate(()=>{const sel=document.getElementById('seriesanalSelect');sel.value='latest-series';renderSeriesAnalysis();sel.value='empty-series';renderSeriesAnalysis();});await idle();
    equal(errors,[],'empty series creates no chart errors');
    equal(await chartState(),{alive:[false,false,false],canvasCount:0},'empty series destroys charts and cancels pending draws');

    await page.evaluate(()=>{document.getElementById('seriesanalSelect').value='latest-series';renderSeriesAnalysis();showPage('tracker');});await idle();
    equal(errors,[],'leaving analysis creates no chart errors');
    equal((await chartState()).alive,[false,false,false],'navigation guard still cancels pending draws');
    results.push({scenario:'series chart render races',status:'pass'});
  }finally{await context.close();}
}

(async()=>{
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    await recordAndEdit('guest');await recordAndEdit('account');await migration();await emptyStates();await chartRenderRaces();
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({status:'pass',checks,results,screenshots,real_database_writes:0,backend:'local simulated Supabase responses'},null,2));
    console.log(`ALL PASS — ${checks} browser checks, ${results.length} scenarios; real DB writes: 0`);
  }catch(error){
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({status:'failed',checks,results,error:error.stack,real_database_writes:0},null,2));
    console.error(error.stack);process.exitCode=1;
  }finally{
    if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  }
})();
