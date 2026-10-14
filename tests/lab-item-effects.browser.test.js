// 外部通信を遮断。実DBへの書込みを行わず、15種の切替・入力・両側の計算を確認。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/lab-item-effects');
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
  if(path.relative(ROOT,p).startsWith('..')||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
let browser,checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
(async()=>{try{
  fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'});
  let realWrites=0;
  await context.route('**/*',r=>{
    if(r.request().url().startsWith(origin))return r.continue();
    if(['POST','PUT','PATCH','DELETE'].includes(r.request().method()))realWrites++;
    return r.fulfill({status:200,body:'',contentType:'application/javascript'});
  });
  await context.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('guest_series',JSON.stringify([{id:'item-effect-fixture',name:'ラボ検証',created_at:'2026-10-11T00:00:00Z'}]));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(()=>{showPage('lab');switchLab('calc');});await page.selectOption('#labPokeSelect','カメックス');
  const proc=(prefix,name)=>page.locator('#'+prefix+'Effects input[data-proc][value="'+name+'"]');
  const names=['ちからのハチマキ','こだわりメガネ','するどいツメ','じゅうてんチャーム','ピントレンズ','ゴツゴツメット','かいがらのすず','きあいのハチマキ','たべのこし','いやしのかんむり','さきがけベル','とつげきチョッキ','おたすけバリア','きょうめいガード','ゴールサポーター'];
  const fill=async(id,value)=>{await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');};
  for(const name of names){
    await page.selectOption('#labItem1',name);const totals=await page.evaluate(()=>({...labCalcResult}));
    eq(await proc('lab',name).isChecked(),false,'default OFF: '+name);
    await proc('lab',name).check();
    eq(await page.locator('#labItemEffectResults').isVisible(),true,'ON result: '+name);
    eq((await page.locator('#labItemEffectResults').innerText()).includes(name),true,'correct name: '+name);
    if(name==='ちからのハチマキ'){
      eq((await page.locator('#labItemEffectResults').innerText()).includes('入力してください'),true,'missing enemy HP');
      await fill('labProcTargetHP','10000');
      eq((await page.locator('#labItemEffectResults').innerText()).includes('物理：300'),true,'muscle hand value');
    }
    if(name==='きあいのハチマキ'){
      await fill('labProcSelfPct','25');eq((await page.locator('#labItemEffectResults').innerText()).includes('25%未満'),true,'focus invalid threshold');
      await fill('labProcSelfPct','20');const recovery=Math.floor(totals.HP*.8*.12+1e-9);
      eq((await page.locator('#labItemEffectResults').innerText()).includes('自己回復：'+recovery.toLocaleString()),true,'focus missing HP');
    }
    if(name==='いやしのかんむり'){
      eq((await page.locator('#labItemEffectResults').innerText()).includes('入力してください'),true,'crown unknown damage');
      await fill('labProcHPDamage','1000');eq((await page.locator('#labItemEffectResults').innerText()).includes('自己回復：150'),true,'crown physical HP damage');
    }
    eq(await page.evaluate(()=>({...labCalcResult})),totals,'proc does not change base stats: '+name);
    await proc('lab',name).uncheck();eq(await page.locator('#labItemEffectResults').isVisible(),false,'OFF hides: '+name);
  }
  await page.selectOption('#labItem1','ゴールサポーター');await proc('lab','ゴールサポーター').check();
  await page.locator('#labGrade1').fill('10');await page.locator('#labGrade1').dispatchEvent('input');
  const hp=await page.evaluate(()=>labCalcResult.HP);
  eq((await page.locator('#labItemEffectResults').innerText()).includes(Math.floor(hp*.075+22*9).toLocaleString()),true,'score uses level plus G10');
  eq(await proc('lab','ゴールサポーター').isChecked(),true,'grade retains ON');
  await page.selectOption('#labItem1','');await page.selectOption('#labItem1','ゴールサポーター');
  eq(await proc('lab','ゴールサポーター').isChecked(),false,'re-equip resets');
  await page.evaluate(()=>switchLab('dmg'));await page.locator('#lcEdit').click();await page.selectOption('#dcAtkPoke','ピカチュウ');await page.selectOption('#dcDefPoke','カメックス');
  await page.locator('#labDmgCalcPanel button',{hasText:'計算する'}).click();
  for(const name of names){
    await page.selectOption('#dcAtkItem1',name);eq(await proc('dcAtk',name).isChecked(),false,'DC default OFF: '+name);
    await proc('dcAtk',name).check();eq((await page.locator('#dcItemEffectResults').innerText()).includes(name),true,'DC ON: '+name);
    await proc('dcAtk',name).uncheck();eq(await page.locator('#dcItemEffectResults').isVisible(),false,'DC OFF: '+name);
  }
  await page.selectOption('#dcAtkItem1','ちからのハチマキ');await proc('dcAtk','ちからのハチマキ').check();
  eq(await page.locator('#dcAtkProcTargetPct').inputValue(),'100','enemy starts 100 percent');
  await fill('dcAtkProcTargetPct','0');eq((await page.locator('#dcItemEffectResults').innerText()).includes('実ダメ 0'),true,'zero HP not minimum 1');
  await page.locator('#dcAtkGrade1').fill('10');await page.locator('#dcAtkGrade1').dispatchEvent('input');
  eq(await page.locator('#dcAtkProcTargetPct').inputValue(),'0','input retained across grade');
  await fill('dcAtkProcTargetPct','');eq((await page.locator('#dcItemEffectResults').innerText()).includes('入力してください'),true,'blank does not default back to 100');
  await fill('dcAtkProcTargetPct','101');eq((await page.locator('#dcItemEffectResults').innerText()).includes('入力してください'),true,'invalid percent no invented result');
  await fill('dcAtkProcTargetPct','50');
  await page.selectOption('#dcDefItem1','ゴツゴツメット');await proc('dcDef','ゴツゴツメット').check();
  eq(await proc('dcAtk','ちからのハチマキ').isChecked(),true,'defense independent');
  const reflection=await page.evaluate(()=>{const raw=Math.floor(dcDefStats.HP*.025+1e-9);return Math.floor(raw*600/(600+dcAtkStats.防御));});
  eq((await page.locator('#dcItemEffectResults').innerText()).includes('実ダメ '+reflection.toLocaleString()),true,'reflection uses defender HP and attacker defense');
  await page.selectOption('#dcAtkItem1','かいがらのすず');await page.selectOption('#dcAtkItem2','おおきなねっこ');
  await page.locator('#dcAtkGrade1').fill('30');await page.locator('#dcAtkGrade1').dispatchEvent('input');
  await proc('dcAtk','かいがらのすず').check();await page.selectOption('#dcAtkHealTarget','ally');
  const selfHeal=await page.evaluate(()=>Math.floor(Math.floor(dcAtkStats.特攻*.6+80+1e-9)*1.2+1e-9));
  eq((await page.locator('#dcItemEffectResults').innerText()).includes('自己回復：'+selfHeal.toLocaleString()),true,'item self heal independent of move ally selection');
  await page.selectOption('#dcDefItem2','おたすけバリア');await page.selectOption('#dcDefItem3','レスキューフード');
  const before=await page.locator('#dcDmgOutNormal').innerText();await proc('dcDef','おたすけバリア').check();
  const shield=await page.evaluate(()=>({self:Math.floor(dcDefStats.HP*.25+1e-9),ally:Math.floor(Math.floor(dcDefStats.HP*.25+1e-9)*1.23+1e-9)}));
  eq((await page.locator('#dcItemEffectResults').innerText()).includes('自分 '+shield.self.toLocaleString()+' ／ 味方1体 '+shield.ally.toLocaleString()),true,'hood only ally on defender');
  eq(await page.locator('#dcDmgOutNormal').innerText(),before,'shield not automatically subtracted from attacks');
  eq(await page.locator('#dcDefHealTarget').count(),0,'defender procs use actual recipients, no unused move target selector');
  await page.locator('#dcResultCard').screenshot({path:path.join(OUT,'results-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('#dcResultCard').screenshot({path:path.join(OUT,'results-mobile.png')});
  await page.locator('#dcDefEffects').screenshot({path:path.join(OUT,'controls-mobile.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'390px no overflow');
  eq(errors,[],'no page errors');eq(realWrites,0,'no external mutation requests');
  console.log('ALL PASS — '+checks+' item proc browser checks; real DB writes: 0');
}catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})();
