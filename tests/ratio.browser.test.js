// ローカルの実画面を検証。外部通信は遮断し、実DBへの書き込みは行わない。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/ratio-page');
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
  await page.evaluate(()=>showPage('lab'));
  eq(await page.locator('#labRatioPanel').isVisible(),true,'ratio is initial lab panel');
  eq(await page.locator('#labPage .analysis-tab').first().innerText(),'📖 レシオ一覧','ratio first');
  for(const role of ['atk','bal','spd','def','sup']){
    await page.locator('#ratioTypes .'+role).click();
    const expected=await page.evaluate(r=>Object.keys(LAB_SKILLS).filter(n=>POKEMON_DATA[r].pokemon.includes(n)).sort(),role);
    eq((await page.locator('#ratioChoices button').allTextContents()).sort(),expected,role+' roster');
  }
  await page.locator('#ratioTypes .atk').click();
  await page.locator('#ratioSearch').fill('すとりんだー');
  eq(await page.locator('#ratioChoices button').count(),1,'combined name and role');
  await page.locator('#ratioTypes .def').click();
  eq(await page.locator('#ratioChoices button').count(),0,'combined role excludes name');
  await page.locator('#ratioTypes .all').click();
  await page.locator('#ratioSearch').fill('すとりんだー');
  eq(await page.locator('#ratioChoices button').count(),1,'hiragana search');
  await page.locator('#ratioChoices button').click();
  const text=await page.locator('#ratioResult').innerText();
  eq(text.includes('特攻 × 40％ ＋ 120'),true,'raw Overdrive formula');
  eq(text.includes('直接ダメージなし'),true,'effect-only Gear');
  eq(text.includes('オーバードライブ+'),true,'plus variant');
  eq(text.includes('Lv13'),true,'plus level');
  await page.locator('#ratioSearch').fill('no-match');
  eq(await page.locator('#ratioChoices').innerText(),'該当するポケモンがいません。','empty search');
  const count=await page.evaluate(()=>{
    for(const p of Object.keys(LAB_SKILLS)){ratioPokemon=p;ratioRender();if(!document.getElementById('ratioResult').textContent.includes(p))throw Error(p);}
    return Object.keys(LAB_SKILLS).length;
  });
  eq(count,101,'all Pokemon render');
  await page.evaluate(()=>{ratioPokemon='ヌメルゴン';ratioRender();});
  eq(await page.locator('#ratioResult .ratio-label', {hasText:'ダメージ（中心）'}).count(),2,'center condition survives upgrade inheritance');
  eq(await page.locator('#ratioResult .ratio-label', {hasText:'ダメージ（周囲）'}).count(),2,'side condition survives upgrade inheritance');
  eq((await page.locator('#ratioResult').innerText()).includes('自身の減少HPに応じた回復はこの式に含まれません'),true,'partial heal formula explained');
  eq(await page.locator('#ratioSlot0 h4').count(),0,'normal attack heading is not duplicated');
  await page.evaluate(()=>{ratioPokemon='バシャーモ';ratioRender();});
  eq(await page.locator('#ratioSlot3 h4').allTextContents(),['爆炎旋風拳','爆炎旋風脚'],'both unite move names');
  await page.evaluate(()=>{ratioPokemon='ウーラオス';ratioRender();});
  eq(await page.locator('#ratioSlot3 h4').allTextContents(),['漆黒の終拳','蒼流の舞踏'],'both Urshifu styles');
  await page.evaluate(()=>{ratioPokemon='ストリンダー';ratioRender();});
  const overdrive=page.locator('#ratioSlot2 .card').filter({hasText:'オーバードライブ'});
  eq((await overdrive.innerText()).match(/待ち時間：9秒/g).length,2,'cooldown once per variant');
  eq(await overdrive.locator('.ratio-same').count(),1,'unchanged upgrade formulas are not repeated');
  await page.evaluate(()=>{ratioPokemon='ピカチュウ';ratioRender();});
  eq(await page.locator('#ratioSlot1 .card').filter({hasText:'エレキボール'}).locator('.ratio-same').count(),0,'changed upgrade formula remains visible');
  await page.evaluate(()=>{ratioPokemon='ストリンダー';ratioRender();});
  await page.locator('#ratioSearch').fill('');
  await page.setViewportSize({width:390,height:844});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile no overflow');
  await page.screenshot({path:path.join(OUT,'mobile.png'),fullPage:true});
  for(const poke of ['ヌメルゴン','タイレーツ','バシャーモ']){
    await page.evaluate(p=>{ratioPokemon=p;ratioRender();},poke);
    eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,poke+' labels fit mobile');
    await page.locator('#ratioResult').screenshot({path:path.join(OUT,poke+'-labels.png')});
  }
  await page.evaluate(()=>switchLab('calc'));
  eq(await page.locator('#labCalcPanel').isVisible(),true,'calculator preserved');
  eq(await page.locator('#labRatioPanel').isVisible(),false,'ratio hidden');
  for(const width of [390,1100]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>{showPage('tracker');document.getElementById('inputCard').style.display='block';selectPoke('ストリンダー');document.getElementById('matchType').value='duo';});
    await page.locator('.ratio-shortcut').click();
    eq((await page.locator('#ratioResult').innerText()).includes('ストリンダー'),true,'shortcut selected Pokemon');
    eq(await page.locator('#ratioSearch').inputValue(),'','shortcut clears old search');
    eq(await page.locator('#ratioTypes .all').getAttribute('aria-pressed'),'true','shortcut clears old role');
    eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'role filters fit '+width);
    await page.evaluate(()=>showPage('tracker'));
    eq(await page.evaluate(()=>selectedPoke),'ストリンダー','draft Pokemon retained');
    eq(await page.locator('#matchType').inputValue(),'duo','draft mode retained');
    const shortcut=await page.locator('.ratio-shortcut').boundingBox(),help=await page.locator('#inputCard .btn-help').boundingBox();
    eq(shortcut.x+shortcut.width<=help.x,true,'record buttons separated');
    await page.evaluate(()=>{showPage('analysis');switchAnalysis('mypickup');});
    const a=await page.locator('.mp-toolbar .btn-help').boundingBox(),b=await page.locator('.mp-edit-btn').boundingBox();
    eq(a.x+a.width+7<=b.x,true,'help gap '+width);
    eq(Math.abs(a.y+a.height/2-b.y-b.height/2)<1,true,'help centered '+width);
  }
  await page.evaluate(()=>{showPage('tracker');clearPoke();openRecordRatio();});
  eq(await page.locator('#ratioResult').innerText(),'ポケモンを選ぶと、全わざのレシオを表示します。','shortcut without Pokemon clears stale result');
  for(const [tab,panel] of [['calc','labCalcPanel'],['dmg','labDmgCalcPanel'],['medal','labMedalPanel'],['ratio','labRatioPanel']]){
    await page.locator('[data-lab-tab="'+tab+'"]').click();
    eq(await page.locator('#'+panel).isVisible(),true,tab+' panel');
    eq(await page.locator('#labPage .analysis-tab.active').getAttribute('data-lab-tab'),tab,tab+' active tab');
  }
  eq(errors,[],'no browser errors');
  console.log('ALL PASS — '+checks+' browser checks');
}catch(e){console.error(e);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
