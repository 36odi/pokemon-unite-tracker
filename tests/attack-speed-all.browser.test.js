const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/attack-speed-all-20261027');
let browser,checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
(async()=>{try{
 fs.mkdirSync(OUT,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true});const metrics=[];
 for(const width of [320,390,1100])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
  let external=0;await context.route(/^https?:/,r=>{external++;return r.abort();});await context.addInitScript(t=>localStorage.setItem('theme',t),theme);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(ROOT,'index.html')).href+'?lab='+encodeURIComponent('カイリュー')+'&tool=calc');await page.locator('#labAttackSpeed[data-state=reference]').waitFor();
  const original=await page.evaluate(()=>JSON.stringify([LAB_STATUS,LAB_SKILLS,LAB_ITEMS,LAB_MEDALS]));
  await page.locator('#labLvSlider').fill('13');await page.locator('#labLvSlider').dispatchEvent('input');
  await page.locator('.lab-as-options>summary').focus();await page.keyboard.press('Enter');
  eq(await page.locator('#labSpeedEffect-dance').isVisible(),true,'keyboard opens state controls');
  const shared=await page.evaluate(()=>labCalcResult['通常攻撃の速さ']);
  await page.selectOption('#labSpeedEffect-dance','on');eq(await page.evaluate(()=>labCalcResult['通常攻撃の速さ']),shared,'manual state never alters common totals');
  eq(await page.evaluate(()=>document.activeElement.id),'labSpeedEffect-dance','focus survives control redraw');
  eq((await page.locator('.lab-as-current').innerText()).includes((shared+80).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')),true,'actual control adds dance once');
  await page.selectOption('#labSpeedState','outrage');eq(await page.locator('#labAttackSpeed').getAttribute('data-state'),'excluded','altered attack removes timing');eq(await page.locator('.lab-as-chart').count(),0,'no stale chart for excluded state');
  await page.selectOption('#labSpeedState','normal');eq(await page.locator('#labSpeedEffect-dance').inputValue(),'off','state change clears incompatible effects');
  await page.selectOption('#labPokeSelect','ストリンダー');await page.locator('.lab-as-options').evaluate(d=>d.open=true);await page.selectOption('#labSpeedEffect-punk','5');await page.selectOption('#labSpeedEffect-gear','on');
  await page.selectOption('#labSpeedState','electric');eq(await page.locator('#labSpeedEffect-gear').count(),0,'poison-only effect disappears');eq(await page.locator('#labSpeedEffect-punk').inputValue(),'0','state switch resets explicit snapshot');
  await page.selectOption('#labPokeSelect','ギャラドス');await page.locator('.lab-as-options').evaluate(d=>d.open=true);await page.selectOption('#labSpeedState','magikarp');eq(await page.locator('.lab-as-fixed-chart').count(),1,'fixed-animation visual');
  eq(await page.locator('.lab-as-fill').count(),0,'no fake fixed-speed bar fill');
  await page.selectOption('#labPokeSelect','サンダース');eq(await page.locator('#labAttackSpeed').getAttribute('data-state'),'unsupported','unknown defaults to no interval');
  await page.selectOption('#labSpeedState','shared-model');eq(await page.locator('#labAttackSpeed').getAttribute('data-state'),'model','explicit provisional choice');eq((await page.locator('#labAttackSpeed').innerText()).includes('モデルの段階'),true,'model is clearly labeled');
  for(const [poke,label]of [['ミュウツーY','effects'],['リザードン','fixed'],['ブースター','unconfirmed']]){
   await page.selectOption('#labPokeSelect',poke);
   const m=await page.locator('#labAttackSpeed').evaluate(host=>{
    if(host.querySelector('.lab-as-options'))host.querySelector('.lab-as-options').open=true;
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,
     controls:[...host.querySelectorAll('select')].map(e=>({height:e.getBoundingClientRect().height,label:!!host.querySelector('label[for="'+e.id+'"]'),font:parseFloat(getComputedStyle(e).fontSize)})),
     summaryHeight:host.querySelector('summary')?.getBoundingClientRect().height};
   });eq(m.overflow,false,'no narrow overflow');for(const c of m.controls){eq(c.height>=44,true,'44px controls');eq(c.label,true,'control is labeled');eq(c.font>=16,true,'readable native control');}
   await page.locator('#labAttackSpeed').screenshot({path:path.join(OUT,`all-${label}-${width}-${theme}.png`)});metrics.push({width,theme,poke,...m});
  }
  if(width===390&&theme==='dark'){
   const sweep=await page.evaluate(()=>{
    const issues=[];let cases=0;
    const check=(poke,lv,state,effects)=>{
     const host=document.getElementById('labAttackSpeed'),computed=computeStatsDetailed({poke,lv},LAB_STATS_DEPS);
     LabAttackSpeed.render(null);LabAttackSpeed.render({poke,lv,computed,activeEffects:[]});
     const fire=(selector,value)=>{const el=host.querySelector(selector);if(el){el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}};
     fire('[data-speed-state]',state);for(const [id,value]of Object.entries(effects))fire('[data-speed-effect="'+id+'"]',value);
     const expected=LabAttackSpeedCore.calculate({profile:LAB_ATTACK_SPEED_DATA.profiles[poke],lv,bonus:computed.totals['通常攻撃の速さ'],stateId:state,effects},LAB_ATTACK_SPEED_DATA.rules);
     if(host.dataset.state!==expected.state)issues.push(poke+':'+lv+':'+state+' state');
     if(/NaN|undefined|Infinity/.test(host.textContent))issues.push(poke+':'+lv+' invalid');
     if(['fixed','excluded','unsupported'].includes(expected.state)&&host.querySelector('.lab-as-chart'))issues.push(poke+':'+lv+' stale graph');
     cases++;
    };
    for(const [poke,profile]of Object.entries(LAB_ATTACK_SPEED_DATA.profiles))for(let lv=1;lv<=15;lv++)for(const state of LabAttackSpeedCore.resolve(profile,lv).states){
     const r=LabAttackSpeedCore.resolve(profile,lv,state.id);check(poke,lv,state.id,{});
     for(const e of r.effects)for(const o of e.options)check(poke,lv,state.id,{[e.id]:o.id});
     check(poke,lv,state.id,Object.fromEntries(r.effects.map(e=>[e.id,e.options.at(-1).id])));
    }
    return {cases,issues};
   });eq(sweep.cases,5243,'all states and option cases rendered by actual controls');eq(sweep.issues,[],'all level/state/effect combinations render consistently');
  }
  eq(await page.evaluate(()=>JSON.stringify([LAB_STATUS,LAB_SKILLS,LAB_ITEMS,LAB_MEDALS])),original,'sources unmodified');eq(external,0,'no network needed for direct file');eq(errors,[],'no script errors');eq(await page.evaluate(()=>Object.keys(localStorage)),['theme'],'manual state is ephemeral');await context.close();
 }
 fs.writeFileSync(path.join(OUT,'all-browser-results.json'),JSON.stringify({checks,cases:5243,metrics,realDBWrites:0,physicalDevice:false},null,2));console.log(`ALL PASS — ${checks} UI checks; 5243 level/state/effect renders; real DB writes: 0`);
}catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser?.close();}})();
