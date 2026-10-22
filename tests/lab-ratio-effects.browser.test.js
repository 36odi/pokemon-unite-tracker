// レシオ一覧・両計算画面で特性44成分と係数0の式の表示を確認。外部通信は遮断。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/lab-ratio-effects');
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
  if(path.relative(ROOT,p).startsWith('..')||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
let browser,checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
(async()=>{try{
  fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'});
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({status:200,body:'',contentType:'application/javascript'}));
  await context.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('guest_series',JSON.stringify([{id:'ratio-fixture',name:'ラボ検証',created_at:'2026-10-11T00:00:00Z'}]));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.evaluate(()=>showPage('lab'));
  const species=await page.evaluate(()=>Object.keys(LAB_SKILLS).filter(p=>LAB_SKILLS[p].some(r=>r.slot==='特性'&&r.coeff!=null)));
  eq(species.length,32,'32 species with source numeric passives');
  for(const p of species){
    await page.evaluate(p=>{ratioPokemon=p;ratioRender();},p);
    const labels=await page.evaluate(p=>LAB_SKILLS[p].filter(r=>r.slot==='特性').map(r=>ratioLabel(p,r)),p);
    const text=await page.locator('#ratioSlot4').innerText();
    eq(labels.every(l=>text.includes(l)),true,'ratio passive components '+p);
  }
  await page.evaluate(()=>switchLab('calc'));
  for(const p of species){
    await page.selectOption('#labPokeSelect',p);
    const count=await page.evaluate(p=>LAB_SKILLS[p].filter(r=>r.slot==='特性'&&r.coeff!=null).length,p);
    eq(await page.locator('#labDmgOutPassive .lab-damage-box').count(),count,'stat all passive components '+p);
    const descriptions=await page.evaluate(p=>LAB_SKILLS[p].filter(r=>r.slot==='特性'&&r.description).map(r=>r.description),p);
    const passiveText=await page.locator('#labDmgOutPassive').innerText();
    eq(descriptions.every(d=>passiveText.includes(d)),true,'stat passive descriptions '+p);
  }
  await page.selectOption('#labPokeSelect','ヌメルゴン');await page.selectOption('#labSkill1Sel','りゅうのはどう');
  eq(await page.locator('#labDmgOut1 .lab-damage-box').count(),4,'Goodra two damages and two fixed healing rows');
  eq((await page.locator('#labDmgOut1').innerText()).includes('自身の減少HPに応じた回復はこの式に含まれません'),true,'partial recovery still identified');
  eq((await page.locator('#labDmgOut1').innerText()).includes('94'),true,'fixed healing at Lv9');
  await page.selectOption('#labItem1','おおきなねっこ');eq((await page.locator('#labDmgOut1').innerText()).includes('112'),true,'fixed healing with root floor(94*1.2)');
  await page.selectOption('#labSkill1Sel','りゅうのはどう+');eq(await page.locator('#labDmgOut1 .lab-damage-box').count(),4,'upgrade retains both fixed heal conditions');
  await page.selectOption('#labItem1','');
  await page.evaluate(()=>switchLab('dmg'));await page.locator('#lcEdit').click();await page.selectOption('#dcDefPoke','カメックス');
  await page.selectOption('#dcAtkPoke','ギルガルド');await page.locator('#labDmgCalcPanel button',{hasText:'計算する'}).click();
  for(const p of species){
    await page.selectOption('#dcAtkPoke',p);const count=await page.evaluate(p=>labPassiveRows(p).length,p);
    eq(await page.locator('#dcDmgOutPassive .lab-dmg-row').count(),count,'DC all passive components '+p);
  }
  await page.selectOption('#dcAtkPoke','ギルガルド');
  eq(await page.locator('#dcDmgOutPassive .dc-arrow').count(),0,'stance changes are not damage');
  eq(await page.locator('#dcDmgOutPassive .dc-act').allTextContents(),['280','200','160'],'Lv9 stance values');
  await page.selectOption('#dcAtkItem1','エナジーアンプ');await page.locator('#dcAtkEffects input[value="エナジーアンプ"]').check();
  eq(await page.locator('#dcDmgOutPassive .dc-act').allTextContents(),['280','200','160'],'amp excludes all stance values');
  await page.selectOption('#dcAtkItem2','レスキューフード');await page.selectOption('#dcAtkHealTarget','ally');
  eq(await page.locator('#dcDmgOutPassive .dc-act').allTextContents(),['280','200','160'],'shield form is not a shield bonus');
  await page.selectOption('#dcAtkItem1','');await page.selectOption('#dcAtkItem2','');
  await page.selectOption('#dcAtkPoke','ヌメルゴン');await page.selectOption('#dcSkill1Sel','りゅうのはどう');
  eq(await page.locator('#dcDmgOut1 .lab-dmg-row').count(),4,'DC fixed recovery rows');
  const heals=page.locator('#dcDmgOut1 .lab-dmg-row').filter({hasText:'回復の固定部分'});
  eq(await heals.locator('.dc-act').allTextContents(),['94','94'],'fixed recovery bypasses defense');
  eq(await heals.locator('.dc-arrow').count(),0,'healing no mitigation arrow');
  await page.selectOption('#dcDefItem1','ふんばりベルト');await page.locator('#dcDefEffects input[value="ふんばりベルト"]').check();
  eq(await heals.locator('.dc-act').allTextContents(),['94','94'],'defender boost excludes recovery');
  await page.selectOption('#dcAtkPoke','マホイップ');
  eq((await page.locator('#dcDmgOutUnite').innerText()).includes('最大HP増加'),true,'non-damage unite effect included');
  await page.selectOption('#dcAtkPoke','ジュナイパー');await page.selectOption('#dcSkill1Sel','はっぱカッター');
  eq((await page.locator('#dcDmgOut1').innerText()).includes('48%'),true,'attack speed unit retained');
  await page.selectOption('#dcAtkPoke','ルカリオ');eq(await page.locator('#dcDmgOutPassive .dc-arrow').count(),0,'passive shield no mitigation');
  await page.selectOption('#dcAtkPoke','マッシブーン');await page.selectOption('#dcSkill2Sel','きゅうけつ');
  const rate=page.locator('#dcDmgOut2 .lab-dmg-row').filter({hasText:'回復率（%）'});
  eq(await rate.locator('.dc-act').innerText(),'80%','Leech Life is a percentage of damage dealt');
  await page.selectOption('#dcAtkItem1','おおきなねっこ');eq(await rate.locator('.dc-act').innerText(),'80%','do not apply HP modifiers to a ratio without damage input');
  await page.selectOption('#dcAtkItem1','');
  await page.selectOption('#dcAtkPoke','ルカリオ');
  await page.setViewportSize({width:390,height:844});await page.locator('#dcResultCard').screenshot({path:path.join(OUT,'passive-shield-mobile.png')});
  await page.selectOption('#dcAtkPoke','ヌメルゴン');await page.selectOption('#dcSkill1Sel','りゅうのはどう');
  await page.locator('#dcResultCard').screenshot({path:path.join(OUT,'fixed-healing-mobile.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px no overflow');
  eq(errors,[],'no page errors');console.log('ALL PASS — '+checks+' ratio effects browser checks; real DB writes: 0');
}catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
