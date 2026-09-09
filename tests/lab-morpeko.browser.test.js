// ローカルの実画面を検証。外部通信は遮断し、実DBへの書き込みは行わない。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/20260909-morpeko-balance');
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
  if(path.relative(ROOT,p).startsWith('..')||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
let browser,checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'});
  await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({status:200,body:'',contentType:'application/javascript'}));
  await context.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('guest_series',JSON.stringify([{id:'lab-fixture',name:'ラボ検証',created_at:'2026-09-09T00:00:00Z'}]));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(()=>showPage('lab'));await page.selectOption('#labPokeSelect','モルペコ');
  eq(await page.locator('#labPassiveSection').isVisible(),true,'Morpeko passive visible');
  for(const lv of [1,9,15]){
    await page.locator('#labLvSlider').fill(String(lv));await page.locator('#labLvSlider').dispatchEvent('input');
    const state=await page.evaluate(()=>({atk:labCalcResult['攻撃'],normal:document.getElementById('labDmgOutNormal').innerText,passive:document.getElementById('labDmgOutPassive').innerText,unite:document.getElementById('labDmgOutUnite').innerText}));
    const contains=(text,n,label)=>eq(text.includes(n.toLocaleString('en-US')),true,label);
    contains(state.normal,state.atk,'normal Lv'+lv);contains(state.normal,Math.round(state.atk*1.25),'boosted Lv'+lv);
    contains(state.passive,Math.round(state.atk*.85+340),'heal Lv'+lv);
    contains(state.unite,Math.round(state.atk*2.6+1040),'full belly Lv'+lv);contains(state.unite,Math.round(state.atk*2.6+1200),'hangry Lv'+lv);
    for(const [slot,name,formula] of [[1,'スパーク+',[1.7,360,1.71,684]],[2,'ダメおし+',[1.8,720,.6,240]]]){
      await page.selectOption('#labSkill'+slot+'Sel',name);const text=await page.locator('#labDmgOut'+slot).innerText();
      contains(text,Math.round(state.atk*formula[0]+formula[1]),name+' main');contains(text,Math.round(state.atk*formula[2]+formula[3]),name+' additional');
    }
  }
  await page.locator('#labSkillCard').screenshot({path:path.join(OUT,'lab-morpeko-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('#labSkillCard').screenshot({path:path.join(OUT,'lab-morpeko-mobile.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile no overflow');
  await page.selectOption('#labPokeSelect','ギルガルド');eq((await page.locator('#labDmgOutPassive').innerText()).includes('防御上昇'),true,'zero coefficient passive shown');
  const buffBefore=await page.locator('#labDmgOutPassive').innerText();
  await page.selectOption('#labItem1','レスキューフード');
  eq(await page.locator('#labDmgOutPassive').innerText(),buffBefore,'Shield Stance buffs do not receive shield item bonus');
  await page.selectOption('#labItem1','');
  await page.selectOption('#labPokeSelect','ピカチュウ');eq(await page.locator('#labPassiveSection').isVisible(),false,'passive hidden on switch');
  await page.evaluate(()=>switchLab('dmg'));await page.selectOption('#dcAtkPoke','モルペコ');await page.selectOption('#dcDefPoke','ピカチュウ');
  await page.locator('#labDmgCalcPanel button', {hasText:'計算する'}).click();
  eq(await page.locator('#dcPassiveSection').isVisible(),true,'DC passive visible');
  const expectedHeal=await page.evaluate(()=>Math.round(dcAtkStats['攻撃']*.85+340));
  eq((await page.locator('#dcDmgOutPassive').innerText()).includes(expectedHeal.toLocaleString('en-US')),true,'DC healing ignores defender defense');
  await page.selectOption('#dcAtkPoke','ギルガルド');eq(await page.locator('#dcPassiveSection').isVisible(),false,'Shield Stance buffs do not create empty DC passive section');
  await page.selectOption('#dcAtkPoke','ピカチュウ');eq(await page.locator('#dcPassiveSection').isVisible(),false,'DC passive hidden on switch');
  eq(errors,[],'no browser errors');
  fs.writeFileSync(path.join(OUT,'browser-result.json'),JSON.stringify({status:'pass',checks,real_database_writes:0,levels:[1,9,15],screenshots:['lab-morpeko-desktop.png','lab-morpeko-mobile.png']},null,2));console.log('ALL PASS — '+checks+' browser checks');
}catch(e){fs.writeFileSync(path.join(OUT,'browser-result.json'),JSON.stringify({status:'failed',checks,error:e.stack}));console.error(e);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
