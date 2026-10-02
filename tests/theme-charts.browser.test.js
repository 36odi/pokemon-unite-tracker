#!/usr/bin/env node
// テーマ切り替えで描画済みグラフの配色が更新されることの実ブラウザ検証（ゲストモード・外部通信なし）。
// 実行: NODE_PATHにPlaywrightの置き場を設定し node tests/theme-charts.browser.test.js
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
const series={id:'theme-series',name:'配色検証',archived:false,created_at:'2026-08-01T00:00:00.000Z'};
const rows=Array.from({length:12},(_,i)=>({id:'t'+i,series_id:series.id,result:i%3?'win':'loss',match_type:'solo',pokemon:i%2?'ピカチュウ':'ルカリオ',
  is_bot:false,created_at:`2026-08-${String(i+1).padStart(2,'0')}T00:00:00.000Z`}));
(async()=>{
  let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
    const exe=process.env.BROWSER_EXECUTABLE;
    browser=await chromium.launch(exe?{executablePath:exe,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1100,height:900},colorScheme:'dark',serviceWorkers:'block'});
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort();});
    await context.addInitScript(({series,rows})=>{
      if(localStorage.getItem('__themeFixture'))return;localStorage.setItem('__themeFixture','1');
      localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('theme','dark');
      localStorage.setItem('guest_series',JSON.stringify([series]));localStorage.setItem('guest_battles_'+series.id,JSON.stringify(rows.slice().reverse()));
    },{series,rows});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>document.getElementById('appSection').style.display==='block');
    await page.evaluate(()=>showPage('analysis'));
    await page.evaluate(()=>switchAnalysis('trend'));
    await page.waitForFunction(()=>typeof trendChartInst!=='undefined'&&trendChartInst);
    await page.evaluate(()=>{switchAnalysis('seriesanal');const s=document.getElementById('seriesanalSelect');s.value='theme-series';renderSeriesAnalysis();});
    await page.waitForFunction(()=>Object.values(Chart.instances).length>=2,null,{timeout:10000});
    const snap=()=>page.evaluate(()=>{
      const c=chartColors();
      const all=Object.values(Chart.instances).map(ch=>({
        ticks:Object.values(ch.options.scales||{}).map(s=>s.ticks&&s.ticks.color),
        grid:Object.values(ch.options.scales||{}).map(s=>s.grid&&s.grid.color),
        ds:ch.data.datasets.map(d=>[d.borderColor,d.backgroundColor].flat())
      }));
      return {c,all};
    });
    const dark=await snap();
    equal(dark.all.every(ch=>ch.ticks.every(t=>t===dark.c.text)),true,'dark: tick colors follow --text2');
    await page.evaluate(()=>toggleTheme());
    const light=await snap();
    equal(light.c.text!==dark.c.text,true,'theme switch changes the text token');
    equal(light.all.every(ch=>ch.ticks.every(t=>t===light.c.text)),true,'light: existing charts tick colors updated');
    equal(light.all.every(ch=>ch.grid.every(g=>g===light.c.grid)),true,'light: existing charts grid colors updated');
    const flat=light.all.flatMap(ch=>ch.ds.flat()).filter(x=>typeof x==='string').map(x=>x.toLowerCase());
    const darkOnly=[dark.c.win,dark.c.loss,dark.c.accent].filter(x=>![light.c.win,light.c.loss,light.c.accent].includes(x)).map(x=>x.toLowerCase());
    equal(flat.some(x=>darkOnly.some(d=>x.startsWith(d))),false,'light: no dark-only dataset colors remain');
    await page.evaluate(()=>toggleTheme());
    const back=await snap();
    equal(back.all.every(ch=>ch.ticks.every(t=>t===dark.c.text)),true,'back to dark: tick colors restored');
    equal(errors,[],'no page errors');
    console.log(`ALL PASS — ${checks} theme chart checks; real DB writes: 0`);
  }catch(e){console.error(e.stack);process.exitCode=1;}
  finally{if(browser)await browser.close();server.close();}
})();
