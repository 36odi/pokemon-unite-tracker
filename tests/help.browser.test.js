// ローカルの実画面を検証。外部通信は遮断し、実DBへの書き込みは行わない。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/help-review');
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
  for(const width of [390,1100]){
    await page.setViewportSize({width,height:844});
    const keys=await page.evaluate(()=>Object.keys(HELP_CONTENT));
    eq(keys.length,15,'15 general help sections');
    for(const key of keys){
      await page.evaluate(k=>openHelp(k),key);
      eq(await page.locator('#helpModal').isVisible(),true,key+' opens');
      eq((await page.locator('#helpBody').innerText()).length>20,true,key+' has content');
      eq(await page.locator('#helpModal .help-modal').evaluate(e=>e.scrollWidth<=e.clientWidth),true,key+' fits');
      await page.locator('#helpModal button').click();
      eq(await page.locator('#helpModal').isVisible(),false,key+' closes');
    }
    for(const name of ['Calc','Dmg','Medal']){
      const id=name.toLowerCase()+'HelpOverlay';
      await page.evaluate(n=>window['show'+n+'Help'](),name);
      eq(await page.locator('#'+id).isVisible(),true,name+' opens');
      eq(await page.locator('#'+id+' .help-modal').evaluate(e=>e.scrollWidth<=e.clientWidth),true,name+' fits');
      await page.locator('#'+id+' button').click();
      eq(await page.locator('#'+id).isVisible(),false,name+' closes');
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{showPage('lab');switchLab('ratio');});
  await page.locator('#labRatioPanel .btn-help').click();
  eq(await page.locator('#helpTitle').innerText(),'❓ レシオ一覧','ratio help entry');
  await page.screenshot({path:path.join(OUT,'ratio-help-mobile.png')});
  await page.locator('#helpModal button').click();
  await page.evaluate(()=>showPage('analysis'));
  await page.locator('#myPickupPanel .btn-help').click();
  eq(await page.locator('#helpTitle').innerText(),'❓ マイピックアップ','pickup help entry');
  await page.locator('#helpModal button').click();
  await page.evaluate(()=>showMedalHelp());
  await page.screenshot({path:path.join(OUT,'medal-help-mobile.png')});
  await page.locator('#medalHelpOverlay button').click();
  eq(errors,[],'no browser errors');
  console.log('ALL PASS — '+checks+' help browser checks');
}catch(e){console.error(e);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
