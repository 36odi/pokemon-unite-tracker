#!/usr/bin/env node
// 編集を続けて開いた場合のもちもの復元・保存をEdgeで検証。外部通信と実DBへの書き込みは遮断。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(ROOT,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
  if(path.relative(ROOT,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
let checks=0;
function equal(actual,expected,label){assert.deepEqual(actual,expected,label);checks++;}
const items=['ちからのハチマキ','れんだスカーフ','しんげきメガネ'];
const rows=[
  ['a','ストリンダー',items.join(',')],
  ['b','ピカチュウ',[items[1],items[2],items[0]].join(',')],
  ['c','ニンフィア',[items[2],items[0],items[1]].join(',')],
  ['d','ザシアン','くちたけん,ちからのハチマキ,れんだスカーフ'],
  ['e','ピカチュウ',''],
  ['f','ピカチュウ','しんげきメガネ']
].map(([id,pokemon,items])=>({id,pokemon,items:items||null,series_id:'edit-test',result:'win',match_type:'solo',created_at:'2026-10-01T10:00:00.000Z',battle_item:'プラスパワー'}));
(async()=>{
  let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin='http://127.0.0.1:'+server.address().port;
    const exe=process.env.BROWSER_EXECUTABLE;
    browser=await chromium.launch(exe?{executablePath:exe,headless:true}:{channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
    for(const width of [1100,390]){
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await context.addInitScript(rows=>{
        if(localStorage.getItem('guestMode'))return;
        localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');
        localStorage.setItem('guest_series',JSON.stringify([{id:'edit-test',name:'編集検証',created_at:'2026-10-01T00:00:00.000Z'}]));
        localStorage.setItem('guest_battles_edit-test',JSON.stringify(rows));
      },rows);
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin,{waitUntil:'load'});
      await page.locator('#seriesSelect').selectOption('edit-test');
      await page.waitForFunction(()=>battles.length===6);
      const values=()=>page.locator('#editModal select[id^="editItem"]').evaluateAll(els=>els.map(el=>el.value));
      for(const id of ['a','b']){
        await page.evaluate(id=>openEditModal(id),id);
        await page.waitForTimeout(100);
        equal(await values(),rows.find(r=>r.id===id).items.split(','),`${width}: cancelled previous edit does not affect next record`);
        await page.getByRole('button',{name:'キャンセル',exact:true}).click();
      }
      for(const id of ['a','b','c','a','d','b','e','f','c']){
        const row=rows.find(r=>r.id===id),expected=(row.items||'').split(',');
        while(expected.length<3)expected.push('');
        if(id==='d')expected[0]='';
        await page.evaluate(id=>openEditModal(id),id);
        // アイコン更新に伴う候補の絞り込みが完了してから確認。
        await page.waitForTimeout(100);
        equal(await values(),expected,`${width}: ${id} restores all slots after previous edit`);
        await page.getByRole('button',{name:'保存する',exact:true}).click();
        await page.waitForFunction(()=>!document.getElementById('editModal').classList.contains('open'));
        equal(await page.evaluate(id=>guestGetBattles('edit-test').find(b=>b.id===id).items,id),row.items,`${width}: unchanged save preserves items`);
      }
      await page.reload({waitUntil:'load'});
      await page.waitForFunction(()=>battles.length===6);
      equal(await page.evaluate(()=>guestGetBattles('edit-test').map(b=>b.items)),rows.map(b=>b.items),`${width}: saved items survive reload`);
      await page.evaluate(()=>openEditModal('a'));
      await page.waitForTimeout(100);
      await page.locator('#editItem1').selectOption('きあいのハチマキ');
      equal(await page.locator('#editItem2 option').evaluateAll(es=>es.some(e=>e.value==='きあいのハチマキ')),false,`${width}: duplicate selection still excluded`);
      equal(await page.locator('#editItem2 option').evaluateAll(es=>es.some(e=>e.value==='ちからのハチマキ')),true,`${width}: released item available in another slot`);
      equal(errors,[],`${width}: no page errors`);
      await context.close();
    }
    console.log(`ALL PASS — ${checks} edit-item checks; real DB writes: 0`);
  }catch(e){console.error(e.stack);process.exitCode=1;}
  finally{if(browser)await browser.close();server.close();}
})();
