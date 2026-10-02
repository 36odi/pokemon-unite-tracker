#!/usr/bin/env node
// 更新配信の直後に「新しいHTML＋古いCSS」が混ざって表示崩れしないことの実ブラウザ検証（Service Worker 有効）。
// 現在の版（V）と、版数を1つ上げた次の版（V+1）を一時フォルダに作り、配信を切り替える。
// GitHub Pages の CDN を模擬し、切り替え前に配信済みのURLは一定時間古い内容を返す（URLごとのキャッシュ）。
// 外部通信なし・実DB書き込みなし。
// 実行: NODE_PATHにPlaywrightの置き場を設定し node tests/sw-update.browser.test.js
// ブラウザ: 既定はEdge。BROWSER_EXECUTABLE（実行ファイルのパス）か BROWSER_CHANNEL で変更できる。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
let checks=0;
function equal(a,e,l){assert.deepEqual(a,e,l);checks++;}
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain'};

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sw-update-'));
const skip=new Set(['.git','work','data','tests','tools','docs','.claude','Claude outputs','images.zip']);
function makeCopy(name,marker,bump){
  const dir=path.join(tmp,name);
  fs.cpSync(ROOT,dir,{recursive:true,filter:src=>!skip.has(path.basename(src))||src===ROOT});
  const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
  const ver=Number(sw.match(/unite-tracker-v(\d+)/)[1]);
  const next=ver+bump;
  let html=fs.readFileSync(path.join(dir,'index.html'),'utf8').replace(/\?v=\d+/g,'?v='+next);
  html=html.replace('<head>',`<head>\n<meta name="testver" content="${marker}">`);
  fs.writeFileSync(path.join(dir,'index.html'),html);
  fs.writeFileSync(path.join(dir,'sw.js'),sw.replace(/\?v=\d+/g,'?v='+next).replace(/unite-tracker-v\d+/,'unite-tracker-v'+next));
  fs.appendFileSync(path.join(dir,'styles.css'),`\n:root{--testver:${marker}}\n`);
  return dir;
}
const A=makeCopy('current','A',0), B=makeCopy('next','B',1);
const state={dir:A,old:null,seen:new Set(),switchedAt:0,staleMs:0};
const server=http.createServer((req,res)=>{
  const full=req.url;
  if(!state.old)state.seen.add(full);
  let dir=state.dir;
  if(state.old&&state.seen.has(full)&&Date.now()-state.switchedAt<state.staleMs&&!full.split('?')[0].endsWith('sw.js'))dir=state.old;
  const pathname=decodeURIComponent(full.split('?')[0]);
  const file=path.resolve(dir,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(path.relative(dir,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const body=fs.readFileSync(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'max-age=600',
    'ETag':'"'+require('node:crypto').createHash('sha1').update(body).digest('hex')+'"'});
  res.end(body);
});
(async()=>{
  let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
    const exe=process.env.BROWSER_EXECUTABLE;
    browser=await chromium.launch(exe?{executablePath:exe,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1100,height:900}});
    await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort();});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const read=()=>page.evaluate(()=>[document.querySelector('meta[name=testver]')?.content,getComputedStyle(document.documentElement).getPropertyValue('--testver').trim()]);
    await page.goto(origin+'/');
    await page.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:15000});
    await page.reload();await page.waitForTimeout(800);
    equal(await read(),['A','A'],'current version shown before the update');
    // 配信を次の版へ。HTML以外の既存URLは8秒間、古い内容を返す（CDNの反映待ちを模擬）
    state.seen.delete('/');state.seen.delete('/index.html');
    Object.assign(state,{old:A,dir:B,switchedAt:Date.now(),staleMs:8000});
    const loads=[];
    for(let i=0;i<5;i++){await page.reload();await page.waitForTimeout(1500);loads.push(await read());}
    equal(loads.filter(([html,css])=>html!==css),[],'HTML and CSS always come from the same version');
    equal(loads[loads.length-1],['B','B'],'the new version is shown after reloads');
    equal(errors,[],'no page errors');
    console.log(`ALL PASS — ${checks} sw update checks (loads: ${loads.map(x=>x.join('')).join(' ')}); real DB writes: 0`);
  }catch(e){console.error(e.stack);process.exitCode=1;}
  finally{if(browser)await browser.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});}
})();
