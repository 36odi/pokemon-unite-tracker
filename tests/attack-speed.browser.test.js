const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/attack-speed-implementation-20261026');
const server=http.createServer((req,res)=>{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/pokemon-unite-tracker/,'');if(name.endsWith('/'))name+='index.html';
  const file=path.resolve(ROOT,'.'+name);if(path.relative(ROOT,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
let browser,checks=0,external=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
(async()=>{try{
  fs.mkdirSync(OUT,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port,base=origin+'/pokemon-unite-tracker/';
  browser=await chromium.launch({channel:'msedge',headless:true});const measurements=[];
  for(const width of [320,390,620,1100])for(const theme of ['dark','light']){
    const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
    await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();external++;return r.abort();});
    await context.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'index.html?lab='+encodeURIComponent('アブソル')+'&tool=calc');
    await page.locator('#labAttackSpeed[data-state=reference]').waitFor();
    const source=await page.evaluate(()=>JSON.stringify([LAB_STATUS,LAB_ITEMS,LAB_MEDALS]));
    await page.selectOption('#labItem1','ちからのハチマキ');await page.selectOption('#labItem2','れんだスカーフ');
    await page.evaluate(()=>{
      const reds=LAB_MEDALS.filter(m=>m.c1==='レッド'||m.c2==='レッド').slice(0,7).map(m=>m.name);
      labMedalPresets[0]={name:'赤7検査',slots:[...reds,...Array(3).fill(null)],rarities:Array(10).fill('gold')};labRefreshCalcMedalSelect();
    });
    await page.selectOption('#labMedalSetSel','0');
    eq(await page.evaluate(()=>labCalcResult['通常攻撃の速さ']),42.63,'existing common calculation produces sample 42.63');
    eq(await page.locator('.lab-as-current span').innerText(),'+42.63%','plot uses common result');
    eq(await page.locator('.lab-as-stage.is-current>span').innerText(),'44F','sample bucket');
    eq((await page.locator('.lab-as-summary').innerText()).includes('8.66'),true,'next boundary difference');
    eq(await page.locator('#labAttackSpeed details[open]').count(),0,'details initially closed');
    await page.locator('#labCalcPanel button').filter({hasText:'計算する'}).first().click();
    await page.waitForFunction(()=>{const r=document.getElementById('labAttackSpeed').getBoundingClientRect();return r.top>=0&&r.top<innerHeight-100;});
    const measure=await page.locator('#labAttackSpeed').evaluate(host=>{
      const chart=host.querySelector('.lab-as-chart').getBoundingClientRect(),track=host.querySelector('.lab-as-track').getBoundingClientRect(),fill=host.querySelector('.lab-as-fill').getBoundingClientRect();
      const current=host.querySelector('.lab-as-stage small').getBoundingClientRect(),next=host.querySelector('.lab-as-next-label').getBoundingClientRect();
      const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(n=>{const v=Number(n)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
      const background=lum(getComputedStyle(host).backgroundColor);
      const ratios=[...host.querySelectorAll('h2,.lab-as-heading>span,.lab-as-intro,.lab-as-context,.lab-as-stage,.lab-as-range,.lab-as-summary,.lab-as-numbers,summary,a')].map(e=>{const l=lum(getComputedStyle(e).color);return (Math.max(l,background)+.05)/(Math.min(l,background)+.05);});
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,fillRatio:fill.width/track.width,
        minimumTextContrast:Math.min(...ratios),
        labelsInside:[...host.querySelectorAll('.lab-as-current,.lab-as-stage,.lab-as-next-label')].every(e=>{const r=e.getBoundingClientRect();return r.left>=chart.left-1&&r.right<=chart.right+1;}),annotationsOverlap:!(current.bottom<=next.top||current.right<=next.left||next.right<=current.left)};
    });
    eq(measure.overflow,false,'page does not overflow');eq(measure.labelsInside,true,'all chart labels stay in plot');eq(measure.annotationsOverlap,false,'current/next labels do not collide');
    eq(measure.minimumTextContrast>=4.5,true,'feature text contrast meets 4.5:1 in both themes');
    eq(Math.abs(measure.fillRatio-42.63/68.08)<.002,true,'colored portion matches actual axis');measurements.push({width,theme,...measure});
    await page.locator('#labAttackSpeed').screenshot({path:path.join(OUT,`attack-speed-${width}-${theme}.png`)});
    await page.locator('#labAttackSpeed details summary').first().focus();await page.keyboard.press('Enter');
    eq(await page.locator('#labAttackSpeed details').first().getAttribute('open')!==null,true,'keyboard opens breakdown');
    await page.locator('#labEffects input[value="れんだスカーフ"]').check();
    eq(await page.evaluate(()=>labCalcResult['通常攻撃の速さ']),67.63,'Scarf proc adds exactly 25, not passive twice');
    eq(await page.locator('.lab-as-stage.is-current>span').innerText(),'40F','Scarf crosses into next bucket');
    eq(await page.locator('#labAttackSpeed details').first().getAttribute('open')!==null,true,'disclosure stays open across updates');
    await page.selectOption('#labItem2','');eq((await page.locator('.lab-as-context').innerText()).includes('OFF'),true,'removing item resets effect');
    await page.selectOption('#labItem2','れんだスカーフ');eq(await page.locator('#labEffects input[value="れんだスカーフ"]').isChecked(),false,'re-equipping starts OFF');
    await page.locator('#labGrade1').fill('40');await page.locator('#labGrade1').dispatchEvent('input');
    eq(await page.evaluate(()=>labCalcResult['通常攻撃の速さ']),43.88,'G40 reuses current 8.75 item data');
    await page.locator('#labLvSlider').fill('15');await page.locator('#labLvSlider').dispatchEvent('input');
    eq((await page.locator('.lab-as-context').innerText()).includes('Lv15'),true,'level updates plot context');
    await page.selectOption('#labPokeSelect','サンダース');eq(await page.locator('#labAttackSpeed').getAttribute('data-state'),'unsupported','unconfirmed application stays unsupported');
    eq((await page.locator('#labAttackSpeed').textContent()).includes('個別適用は未確認'),true,'unconfirmed application is explicit');
    eq(/確認中|確認待ち/.test(await page.locator('#labAttackSpeed').textContent()),false,'no misleading promise of automatic checking');
    eq(await page.locator('.lab-as-fill').count(),0,'pending never leaves stale graph');
    await page.selectOption('#labPokeSelect','');eq(await page.locator('#labAttackSpeed').isVisible(),false,'clearing Pokémon hides stale result');
    if(width===390&&theme==='dark'){
      const sweep=await page.evaluate(()=>{
        const issues=[];let count=0;
        for(const poke of Object.keys(LAB_STATUS))for(let lv=1;lv<=15;lv++){
          const computed=computeStatsDetailed({poke,lv},LAB_STATS_DEPS);
          LabAttackSpeed.render({poke,lv,computed,activeEffects:[]});
          const host=document.getElementById('labAttackSpeed'),text=host.textContent;
          if(/NaN|undefined|Infinity/.test(text))issues.push(poke+':'+lv+' invalid');
          if(host.dataset.state==='unsupported'&&host.querySelector('.lab-as-chart'))issues.push(poke+':'+lv+' pending plot');
          count++;
        }
        return {issues,count};
      });eq(sweep.count,1545,'all 103 Pokémon × 15 levels rendered');eq(sweep.issues,[],'full reference/pending sweep has no invalid text');
      await page.evaluate(()=>{
        const computed=computeStatsDetailed({poke:'アブソル',lv:9},LAB_STATS_DEPS);computed.totals['通常攻撃の速さ']=68.06;
        LabAttackSpeed.render({poke:'アブソル',lv:9,computed,activeEffects:[]});
      });eq(await page.locator('#labAttackSpeed').getAttribute('data-state'),'boundary','uncertain boundary in real renderer');
      eq(await page.locator('.lab-as-stage.is-current').count(),0,'no single current stage for uncertainty');
      await page.evaluate(()=>{
        const computed=computeStatsDetailed({poke:'アブソル',lv:9},LAB_STATS_DEPS);computed.totals['通常攻撃の速さ']=37.56;
        LabAttackSpeed.render({poke:'アブソル',lv:9,computed,activeEffects:[]});
      });eq((await page.locator('.lab-as-summary').innerText()).includes('ライン上'),true,'strict equality explains crossing rather than showing misleading zero remaining');
    }
    eq(await page.evaluate(()=>JSON.stringify([LAB_STATUS,LAB_ITEMS,LAB_MEDALS])),source,'render never mutates source data');
    eq(await page.evaluate(()=>db),null,'public mode does not start authentication');
    eq(await page.evaluate(()=>Object.keys(localStorage)),['theme'],'no new persistent state');eq(errors,[],'no browser errors');
    await context.close();
  }
  // 初回読込の失敗後、利用者の再試行で回復する。
  const retry=await browser.newContext({serviceWorkers:'block'});let fail=true;
  await retry.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external++;return r.abort();}if(fail&&r.request().url().includes('attack-speed-data.js'))return r.fulfill({status:503,body:'unavailable'});return r.continue();});
  const page=await retry.newPage();await page.goto(base+'index.html?lab='+encodeURIComponent('アブソル')+'&tool=calc');await page.locator('.lab-as-retry').waitFor();
  fail=false;await page.locator('.lab-as-retry').click();await page.locator('#labAttackSpeed[data-state=reference]').waitFor();eq(await page.locator('.lab-as-fill').count(),1,'retry recovers graph');await retry.close();
  // 実際のService Workerで規則も保存し、通信を切った後の再読込と入力変更を確認。
  const offline=await browser.newContext({serviceWorkers:'allow'});
  await offline.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();external++;return r.abort();});
  const cached=await offline.newPage();await cached.goto(base+'index.html?lab='+encodeURIComponent('アブソル')+'&tool=calc');
  await cached.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;});
  await cached.reload();await cached.locator('#labAttackSpeed[data-state=reference]').waitFor();await offline.setOffline(true);
  await cached.reload();await cached.locator('#labAttackSpeed[data-state=reference]').waitFor();
  eq(await cached.locator('.lab-as-stage.is-current>span').innerText(),'52F','offline reload retains base Lv9 reference');
  await cached.locator('#labLvSlider').fill('15');await cached.locator('#labLvSlider').dispatchEvent('input');
  eq(await cached.locator('.lab-as-stage.is-current>span').innerText(),'48F','offline input still recalculates');await offline.close();
  eq(external,0,'public calculator starts no external requests');
  fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({checks,measurements,externalRequests:external,realDBWrites:0},null,2));
  console.log(`ALL PASS — ${checks} attack speed browser checks; 1545 states rendered; real DB writes: 0`);
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await browser?.close();server.close();}})();
