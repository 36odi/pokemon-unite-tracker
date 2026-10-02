#!/usr/bin/env node
// メダルスロット（ラボ > メダルセット作成）の表示・操作の実ブラウザ検証。外部通信なし・実DB書き込みなし。
// 実行: NODE_PATHにPlaywrightの置き場を設定し node tests/medal-slots.browser.test.js
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
const NAMES=['ピジョット','オニドリル','ケンタロス','ギャラドス','ニョロボン','オコリザル','ガラガラ','カイリキー','プテラ','ホウオウ'];
(async()=>{
  let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
    const exe=process.env.BROWSER_EXECUTABLE;
    browser=await chromium.launch(exe?{executablePath:exe,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    for(const width of [1100,375]){
      const context=await browser.newContext({viewport:{width,height:900},colorScheme:'dark',serviceWorkers:'block'});
      await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort();});
      await context.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin,{waitUntil:'load'});
      await page.evaluate(()=>showPage('lab'));
      await page.waitForFunction(()=>labDataReady);
      await page.evaluate(names=>{switchLab('medal');labMedalSlots=names.slice();labMedalRarities=['gold','gold','silver','gold','bronze','gold','gold','silver','gold','gold'];labActiveMedalSlot=9;labRenderMedalSlots();},NAMES);
      equal(await page.locator('#medalSlotBar .medal-slot').count(),10,`${width}: 10 slot cards`);
      const names=await page.locator('#medalSlotBar .ms-name').evaluateAll(els=>els.map(e=>({t:e.textContent,clipped:e.scrollWidth>e.clientWidth+1})));
      equal(names.map(n=>n.t),NAMES,`${width}: full medal names in slots`);
      equal(names.filter(n=>n.clipped).map(n=>n.t),[],`${width}: no medal name is cut off`);
      equal(await page.locator('#medalSlotBar .medal-slot-btn').nth(4).getAttribute('aria-label'),'スロット5：ニョロボン（銅・ブルー・ブラウン）',`${width}: slot label includes rarity and colors`);
      equal(await page.locator('#medalSlotBar .medal-slot-btn[aria-current="true"]').count(),1,`${width}: active slot is marked`);
      equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: no horizontal overflow`);
      await page.getByRole('button',{name:'スロット3のケンタロスを外す'}).click();
      equal(await page.evaluate(()=>labMedalSlots[2]),null,`${width}: remove button clears the slot`);
      equal(await page.locator('#medalSlotBar .medal-slot-btn').nth(2).getAttribute('aria-label'),'スロット3：空き',`${width}: empty slot label`);
      await page.locator('#medalSlotBar .medal-slot-btn').nth(2).click();
      equal(await page.evaluate(()=>labActiveMedalSlot),2,`${width}: clicking a slot selects it`);
      equal(errors,[],`${width}: no page errors`);
      await context.close();
    }
    console.log(`ALL PASS — ${checks} medal slot checks; real DB writes: 0`);
  }catch(e){console.error(e.stack);process.exitCode=1;}
  finally{if(browser)await browser.close();server.close();}
})();
