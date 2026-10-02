#!/usr/bin/env node
// 「ホーム画面に追加」案内の「次回から表示しない」と、ストライクの画像の実ブラウザ検証。外部通信なし・実DB書き込みなし。
// 実行: NODE_PATHにPlaywrightの置き場を設定し node tests/pwa-icon.browser.test.js
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
(async()=>{
  let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
    const exe=process.env.BROWSER_EXECUTABLE;
    browser=await chromium.launch(exe?{executablePath:exe,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort();});
    await context.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const prompt=()=>page.evaluate(()=>window.dispatchEvent(new Event('beforeinstallprompt')));
    const shown=()=>page.evaluate(()=>document.getElementById('pwaBar').classList.contains('show'));
    await page.goto(origin,{waitUntil:'load'});
    await prompt();
    equal(await shown(),true,'install bar shows when the browser offers installation');
    await page.locator('#pwaBar .btn-pwa-close').click();
    equal(await shown(),false,'close hides the bar for now');
    await page.reload({waitUntil:'load'});await prompt();
    equal(await shown(),true,'closing only hides it this time');
    await page.locator('#pwaNeverCheck').check();
    equal([await shown(),await page.evaluate(()=>localStorage.getItem('pwaBarHidden'))],[false,'1'],'"do not show again" hides the bar and is remembered');
    await page.reload({waitUntil:'load'});await prompt();
    equal(await shown(),false,'bar stays hidden on later visits');
    // ストライクの画像
    await page.evaluate(()=>showPage('lab'));
    await page.waitForFunction(()=>labDataReady);
    await page.locator('#ratioSearch').fill('すとらいく');
    const img=page.locator('#ratioChoices button',{hasText:'ストライク'}).locator('img');
    equal(await img.getAttribute('src'),'images/pokemon/123.png','Scyther uses its own sprite');
    await page.waitForFunction(()=>{const i=[...document.querySelectorAll('#ratioChoices img')].find(x=>x.src.endsWith('/123.png'));return i&&i.complete&&i.naturalWidth>0;});
    equal(true,true,'Scyther sprite loads');
    equal(errors,[],'no page errors');
    console.log(`ALL PASS — ${checks} pwa/icon checks; real DB writes: 0`);
  }catch(e){console.error(e.stack);process.exitCode=1;}
  finally{if(browser)await browser.close();server.close();}
})();
