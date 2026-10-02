#!/usr/bin/env node
// 後から読み込むスクリプト（Chart.js・ラボデータ）の読み込み途中に操作しても壊れないことの実ブラウザ検証。
// 2つのスクリプトの応答を意図的に止め、その間にラボ・分析・レシオ一覧を操作する。外部通信なし・実DB書き込みなし。
// 実行: NODE_PATHにPlaywrightの置き場を設定し node tests/deferred-load.browser.test.js
// ブラウザ: 既定はEdge。BROWSER_EXECUTABLE（実行ファイルのパス）か BROWSER_CHANNEL で変更できる。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
let checks=0;
function equal(a,e,l){assert.deepEqual(a,e,l);checks++;}
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
  if(path.relative(ROOT,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
const series={id:'defer-series',name:'読み込み検証',archived:false,created_at:'2026-08-01T00:00:00.000Z'};
const rows=Array.from({length:8},(_,i)=>({id:'d'+i,series_id:series.id,result:i%3?'win':'loss',match_type:'solo',pokemon:'ピカチュウ',
  is_bot:false,created_at:`2026-08-0${i+1}T00:00:00.000Z`}));
let origin,browser;
// mode: 'hold' = 解放されるまで応答を止める / 'fail' = 読み込み失敗にする
async function open(mode){
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',serviceWorkers:'block'});
  const held=[];let release;
  const released=new Promise(r=>{release=r;});
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin!==origin){await route.abort();return;}
    if(/\/(lab_data\.js|vendor\/chart\.umd\.min\.js)$/.test(u.pathname)){
      if(mode==='fail'&&u.pathname.endsWith('lab_data.js')){await route.abort();return;}
      held.push(u.pathname);await released;
    }
    await route.continue();
  });
  await context.addInitScript(({series,rows})=>{
    if(localStorage.getItem('__deferFixture'))return;localStorage.setItem('__deferFixture','1');
    localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');
    localStorage.setItem('guest_series',JSON.stringify([series]));localStorage.setItem('guest_battles_'+series.id,JSON.stringify(rows.slice().reverse()));
  },{series,rows});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.goto(origin,{waitUntil:'commit'}).catch(()=>{});
  await page.waitForFunction(()=>typeof showPage==='function'&&document.getElementById('appSection')?.style.display==='block',null,{timeout:15000});
  return {page,context,errors,release,held};
}
(async()=>{
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
    const exe=process.env.BROWSER_EXECUTABLE;
    browser=await chromium.launch(exe?{executablePath:exe,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});

    // 1. ラボ：読み込み途中にタブ・名前検索を操作 → エラーなし、完了後に使える
    {
      const {page,context,errors,release}=await open('hold');
      equal(await page.evaluate(()=>[typeof LAB_SKILLS,typeof Chart]),['undefined','undefined'],'both deferred scripts are still pending');
      await page.evaluate(()=>showPage('lab'));
      equal(await page.locator('#labPage .page-gate-msg').isVisible(),true,'lab shows a loading message while data is pending');
      equal(await page.evaluate(()=>document.querySelector('#labPage .analysis-tabs').inert),true,'lab tabs are inert while pending');
      await page.evaluate(()=>{switchLab('ratio');switchLab('calc');ratioSearch();});
      await page.locator('#labPage .analysis-tab').first().click({force:true}).catch(()=>{});
      await page.locator('#ratioSearch').fill('ぴか',{force:true,timeout:1000}).catch(()=>{});
      await page.locator('#ratioSearch').dispatchEvent('input');
      equal(errors,[],'no errors when operating lab before data is ready');
      release();
      await page.waitForFunction(()=>typeof LAB_SKILLS!=='undefined'&&labDataReady&&!document.querySelector('#labPage .page-gate-msg'));
      equal(await page.evaluate(()=>document.querySelector('#labPage .analysis-tabs').inert),false,'lab becomes operable after load');
      await page.locator('#ratioSearch').fill('ぴか');
      equal(await page.locator('#ratioChoices button').count()>0,true,'name search works after load');
      await page.locator('#labPage .analysis-tab',{hasText:'ステータス計算'}).click();
      equal(await page.locator('#labCalcPanel').isVisible(),true,'tab switching works after load');
      equal(errors,[],'no errors after lab load');
      await context.close();
    }
    // 2. 分析：読み込み途中にサブタブを操作 → エラーなし、完了後にグラフ描画
    {
      const {page,context,errors,release}=await open('hold');
      await page.evaluate(()=>showPage('analysis'));
      equal(await page.locator('#analysisPage .page-gate-msg').isVisible(),true,'analysis shows a loading message while Chart.js is pending');
      await page.evaluate(()=>{switchAnalysis('trend');switchAnalysis('seriesanal');});
      equal(errors,[],'no errors when operating analysis before Chart.js is ready');
      release();
      await page.waitForFunction(()=>typeof Chart!=='undefined'&&!document.querySelector('#analysisPage .page-gate-msg'));
      await page.evaluate(()=>switchAnalysis('trend'));
      await page.waitForFunction(()=>typeof trendChartInst!=='undefined'&&trendChartInst);
      equal(errors,[],'no errors after analysis load');
      await context.close();
    }
    // 3. 対戦記録の「レシオ一覧」：読み込み途中に押す → 完了後にレシオ一覧が開く
    {
      const {page,context,errors,release}=await open('hold');
      await page.waitForFunction(()=>currentSeriesId===null||true);
      await page.evaluate(()=>{selectedPoke='ピカチュウ';openRecordRatio();});
      equal(await page.evaluate(()=>document.getElementById('labPage').style.display),'block','ratio shortcut opens the lab page while pending');
      equal(errors,[],'no errors when using the ratio shortcut before data is ready');
      release();
      await page.waitForFunction(()=>labDataReady&&document.getElementById('labRatioPanel').style.display==='block'&&ratioPokemon==='ピカチュウ');
      equal(await page.locator('#ratioResult').innerText().then(t=>t.length>0),true,'ratio result rendered after load');
      equal(errors,[],'no errors after ratio shortcut load');
      await context.close();
    }
    // 4. ラボデータの読み込み失敗 → 案内を表示し、例外を出さない
    {
      const {page,context,errors,release}=await open('fail');
      release();
      await page.waitForFunction(()=>document.getElementById('labDataScript')?.dataset.state==='error');
      await page.evaluate(()=>showPage('lab'));
      await page.waitForFunction(()=>document.querySelector('#labPage .page-gate-msg.is-error'));
      equal((await page.locator('#labPage .page-gate-msg').innerText()).includes('読み込めませんでした'),true,'failure message shown');
      await page.evaluate(()=>{switchLab('ratio');ratioSearch();});
      equal(errors,[],'no errors when lab data failed to load');
      await context.close();
    }
    console.log(`ALL PASS — ${checks} deferred-load browser checks; real DB writes: 0`);
  }catch(e){console.error(e.stack);process.exitCode=1;}
  finally{if(browser)await browser.close();server.close();}
})();
