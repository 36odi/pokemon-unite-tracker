// Edgeの実画面。外部通信を遮断し、実DBへの書き込みなしで検査する。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/lab-improvement-implementation-20261026/stage4');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));if(path.relative(ROOT,p).startsWith('..')||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);return res.end();}res.setHeader('content-type',mime[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
let browser,checks=0,writes=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
(async()=>{try{
  fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
  const measurements=[];
  for(const width of [390,1100])for(const theme of ['dark','light']){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
    await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();if(['POST','PUT','PATCH','DELETE'].includes(r.request().method()))writes++;return r.abort();});
    await context.addInitScript(theme=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('usage_disabled','1');localStorage.setItem('theme',theme);},theme);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.evaluate(()=>showPage('lab'));await page.waitForFunction(()=>labDataReady&&labPresetUIOwner==='guest');await page.evaluate(()=>{document.documentElement.dataset.theme=localStorage.getItem('theme');switchLab('medal');});
    const order=await page.evaluate(()=>({source:JSON.stringify(POKEMON_DATA),items:JSON.stringify(GENERAL_ITEMS),count:Object.keys(LAB_STATUS).length,pokemon:[...document.querySelectorAll('#labPokeSelect option')].map(o=>o.value).filter(Boolean)}));
    eq(order.count,103,'103 stat profiles remain');eq(order.pokemon.length,103,'all stat profiles selectable');
    await page.evaluate(()=>{switchLab('ratio');ratioType='all';ratioSearch();});
    const ratioNames=await page.locator('#ratioChoices button').evaluateAll(es=>es.map(e=>e.textContent));
    eq(ratioNames,order.pokemon,'ratio and stat candidates have identical common order');
    await page.evaluate(()=>{switchLab('dmg');document.getElementById('lcEditor').open=true;});
    eq(await page.locator('#dcDefPoke option').evaluateAll(es=>es.map(e=>e.value).filter(Boolean)),order.pokemon,'defender uses common order');
    eq(await page.locator('#dcAtkPoke option').evaluateAll(es=>es.map(e=>e.value).filter(Boolean)),order.pokemon,'attacker uses common order');
    const itemOrder=await page.evaluate(()=>[...document.querySelectorAll('#labItem1 option')].map(o=>o.value).filter(Boolean));
    eq(await page.locator('#dcAtkItem1 option').evaluateAll(es=>es.map(e=>e.value).filter(Boolean)),itemOrder,'item lists share common ordering');
    const roles=await page.evaluate(()=>({missing:Object.keys(LAB_STATUS).filter(n=>!labPokemonType(n)),scyther:labPokemonType('ストライク'),tracked:Object.values(POKEMON_DATA).some(t=>t.pokemon.includes('ストライク'))}));
    eq(roles,{missing:[],scyther:'bal',tracked:false},'all lab roles covered, tracker roster unchanged');
    await page.evaluate(()=>{switchLab('ratio');ratioType='bal';ratioRenderTypes();ratioSearch();ratioPokemon='ストライク';ratioRender();});
    eq((await page.locator('#ratioResult').innerText()).includes('バランス型'),true,'Scyther role in detail');
    eq((await page.locator('#ratioChoices').innerText()).includes('ストライク'),true,'Scyther reachable by role');
    eq((await page.locator('#ratioResult').innerText()).includes('習得Lv5'),true,'explicit learned level');
    const dates=await page.locator('#ratioResult .ratio-meta').first().innerText();eq(dates.includes('最終更新日：')&&dates.includes('全数値の確認日'),true,'update date scope explained');
    await page.locator('#ratioResult > .card').first().screenshot({path:path.join(OUT,`scyther-${width}-${theme}.png`)});
    await page.evaluate(()=>switchLab('medal'));
    await page.locator('#mfName').fill('にゃお');eq(await page.locator('.medal-chip').count(),1,'hiragana partial search');
    await page.selectOption('#mfRarity','platinum');eq(await page.locator('.medal-chip').count(),1,'name + rarity combined');
    await page.selectOption('#mfRarity','gold');eq(await page.locator('.medal-chip').count(),0,'unavailable rarity remains filtered');
    await page.locator('#mfName').fill('<script>');eq(await page.locator('.medal-chip').count(),0,'unsafe text treated as query');
    await page.evaluate(()=>labResetMedalFilters());eq(await page.locator('#mfName').inputValue(),'','reset clears name');eq(await page.locator('.medal-chip').count(),257,'reset recovers all medals');
    await page.locator('#mfName').fill('ﾆｬｰｽ');eq(await page.locator('.medal-chip').count(),1,'halfwidth name search');
    await page.evaluate(()=>{labMedalPresets[0]={name:'長い名前のメダルセット検査',slots:['ニャオハ','マスカーニャ',...Array(8).fill(null)],rarities:Array(10).fill('platinum')};labRenderMedalPresets();labLoadMedalPreset(0);});
    const metrics=await page.evaluate(()=>{
      const buttons=[...document.querySelectorAll('.medal-preset-btn,.medal-preset-rename,.medal-slot-del')].filter(e=>e.getBoundingClientRect().width);
      const targets=buttons.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,label:e.getAttribute('aria-label')}));
      const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number),lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      let c=document.getElementById('mfName'),bg;while(c){bg=getComputedStyle(c).backgroundColor;if(!bg.includes('rgba')&&bg!=='transparent')break;c=c.parentElement;}
      const a=lum(getComputedStyle(document.getElementById('mfName')).color),b=lum(bg);
      return {targets,overflow:document.documentElement.scrollWidth>innerWidth,searchContrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),slotOverlap:[...document.querySelectorAll('.medal-slot.is-filled')].some(slot=>{const n=slot.querySelector('.ms-name').getBoundingClientRect(),d=slot.querySelector('.medal-slot-del').getBoundingClientRect();return n.right>d.left&&n.left<d.right&&n.bottom>d.top&&n.top<d.bottom;})};
    });
    eq(metrics.targets.every(m=>m.w>=44&&m.h>=44),true,'existing save/load/delete/rename controls >=44');
    eq(metrics.targets.every(m=>m.label),true,'buttons describe intended set or medal');eq(metrics.overflow,false,'no page overflow');eq(metrics.slotOverlap,false,'delete control does not cover medal name');eq(await page.locator('.ms-rar').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)),true,'rarity labels fit without clipping');eq(metrics.searchContrast>=4.5,true,'search text contrast');
    await page.locator('#mfName').focus();await page.keyboard.press('Control+A');await page.keyboard.type('mew');eq(await page.locator('.medal-chip').count(),0,'keyboard search works');
    await page.locator('#medalPresetGrid').screenshot({path:path.join(OUT,`presets-${width}-${theme}.png`)});
    await page.locator('#medalSlotBar').screenshot({path:path.join(OUT,`slots-${width}-${theme}.png`)});
    await page.locator('#medalPresetGrid .load').focus();await page.keyboard.press('Enter');eq(await page.evaluate(()=>labMedalSlots.slice(0,2)),['ニャオハ','マスカーニャ'],'keyboard preset load');
    eq(await page.evaluate(()=>JSON.stringify(POKEMON_DATA)),order.source,'display sorting never mutates roster');eq(await page.evaluate(()=>JSON.stringify(GENERAL_ITEMS)),order.items,'display sorting never mutates items');
    eq(errors,[],'no browser errors');measurements.push({width,theme,metrics});await context.close();
  }
  eq(writes,0,'no external writes');fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({checks,writes,measurements},null,2));console.log('ALL PASS — '+checks+' discovery/readability browser checks; real DB writes: 0');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{if(browser)await browser.close();server.close();}})();
