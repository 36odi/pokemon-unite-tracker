// ローカルの実画面を検証。外部通信は遮断し、実DBへの書き込みは行わない。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/mypickup');
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
  if(path.relative(ROOT,p).startsWith('..')||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
fs.mkdirSync(OUT,{recursive:true});
let browser,checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'});
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({status:200,body:'',contentType:'application/javascript'}));
  await context.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('guest_series',JSON.stringify([{id:'lab-fixture',name:'ラボ検証',created_at:'2026-09-09T00:00:00Z'}]));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(async()=>{
    await loadAnalysis();
    const battles=Array.from({length:20},(_,i)=>({id:String(i),result:i<10?'win':'loss',pokemon:'ピカチュウ',match_type:'solo',created_at:new Date(2026,8,1,i).toISOString()}));
    allSeriesData=[{id:'old',name:'以前',created_at:'2026-08-01',battles:battles.slice(0,10)},{id:'new',name:'最新',created_at:'2026-09-01',battles}];
    for(const id of ['trendSeriesSelect','seriesanalSelect'])document.getElementById(id).innerHTML='<option value="old">以前</option><option value="new">最新</option>';
    showPage('analysis');switchAnalysis('mypickup');
    localStorage.setItem('mp_cards',JSON.stringify(['recent','winrate','recent','obsolete','pokewr']));
    renderMyPickup();renderMyPickupEdit();
    document.getElementById('myPickupEdit').style.display='block';
  });
  eq(await page.evaluate(()=>getMyPickupSelection()),['recent','winrate','pokewr'],'legacy IDs cleaned and order retained');
  eq(await page.locator('.mp-card').evaluateAll(es=>es.map(e=>e.dataset.mpCard)),['recent','winrate','pokewr'],'saved display order');
  eq((await page.locator('[data-mp-card="recent"]').innerText()).includes('0勝 10敗'),true,'recent uses last ten');
  eq((await page.locator('[data-mp-card="winrate"]').innerText()).includes('50.0%'),true,'series rate uses all twenty');
  eq((await page.locator('[data-mp-card="winrate"]').innerText()).includes('直近'),false,'summary has no duplicate recent');
  await page.locator('[data-mp-move="winrate:-1"]').click();
  eq(await page.evaluate(()=>JSON.parse(localStorage.getItem('mp_cards'))),['winrate','recent','pokewr'],'move saved');
  await page.evaluate(()=>toggleMyPickupCard('recent'));
  await page.evaluate(()=>toggleMyPickupCard('recent'));
  eq(await page.evaluate(()=>getMyPickupSelection()),['winrate','pokewr','recent'],'readded card goes last');
  for(const width of [390,1100]){
    await page.setViewportSize({width,height:844});
    eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no overflow '+width);
  }
  await page.locator('[data-mp-card="recent"] .mp-detail-link').click();
  eq(await page.locator('#trendSeriesSelect').inputValue(),'new','trend keeps latest series');
  eq(await page.evaluate(()=>trendMode),'recent','recent mode selected');
  for(const id of ['rate','pokewr','worstpoke','modewr','lane','role']){
    await page.evaluate(id=>{document.getElementById('seriesanalSelect').value='old';openMyPickupDetail(id);},id);
    eq(await page.locator('#seriesanalSelect').inputValue(),'new',id+' keeps latest series');
  }
  await page.evaluate(()=>{saveMyPickupSelection([]);switchAnalysis('mypickup');});
  eq((await page.locator('#myPickupContent').innerText()).includes('表示するカードがありません'),true,'empty selection supported');
  await page.reload();
  eq(await page.evaluate(()=>getMyPickupSelection()),[],'empty preference survives reload');
  eq(errors,[],'no browser errors');
  console.log('ALL PASS — '+checks+' browser checks');
}catch(e){console.error(e);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
