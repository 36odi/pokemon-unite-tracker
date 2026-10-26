// Edgeの実画面。外部通信を遮断し、実DBへの書き込みなしで検査する。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/lab-improvement-implementation-20261026/stage2');
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
    await page.selectOption('#mfRarity','platinum');eq(await page.locator('.medal-chip').count(),6,'six platinum rows');
    eq(await page.locator('.medal-chip [data-rar="bronze"],.medal-chip [data-rar="silver"],.medal-chip [data-rar="gold"]').count(),0,'no unavailable rarity buttons');
    await page.getByRole('button',{name:'ニャオハをプラチナで選択',exact:true}).focus();await page.keyboard.press('Enter');
    eq(await page.evaluate(()=>labMedalRarities[0]),'platinum','keyboard selects platinum');
    eq((await page.locator('.ms-rar').first().innerText()),'プラチナ','slot displays platinum');
    await page.evaluate(()=>labSetAllRarity('bronze'));eq(await page.evaluate(()=>labMedalRarities[0]),'platinum','bulk bronze cannot downgrade platinum');
    for(const rarity of ['bronze','silver','gold']){
      await page.selectOption('#mfRarity',rarity);eq(await page.locator('[data-medal="ニャオハ"]').count(),0,rarity+' filter excludes platinum-only');
    }
    await page.evaluate(()=>{labMedalPresets[0]={name:'旧保存',slots:['ニャオハ',...Array(9).fill(null)],rarities:Array(10).fill('bronze')};labLoadMedalPreset(0);});
    eq(await page.evaluate(()=>labMedalRarities[0]),'platinum','legacy preset restores actual rarity');
    eq(await page.evaluate(()=>labMedalPresets[0].rarities[0]),'bronze','legacy source not silently rewritten');
    await page.evaluate(()=>labSaveMedalPreset(1));
    eq(await page.evaluate(()=>labPresetStore.snapshot().values[1].rarities[0]),'platinum','new save uses platinum');
    await page.selectOption('#mfRarity','platinum');
    const metrics=await page.evaluate(()=>{
      const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number),lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const contrast=el=>{let n=el,bg;while(n){bg=getComputedStyle(n).backgroundColor;if(!bg.includes('rgba')&&bg!=='transparent')break;n=n.parentElement;}const a=lum(getComputedStyle(el).color),b=lum(bg||'rgb(255,255,255)');return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
      return {overflow:document.documentElement.scrollWidth>innerWidth,targets:[...document.querySelectorAll('.mcr-btn')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height,contrast:contrast(b)})),slotClipped:[...document.querySelectorAll('.ms-rar')].some(e=>e.scrollWidth>e.clientWidth+1)};
    });
    eq(metrics.overflow,false,'no page overflow');eq(metrics.targets.every(b=>b.w>=44&&b.h>=44),true,'rarity targets >=44px');eq(metrics.targets.every(b=>b.contrast>=4.5),true,'rarity text contrast >=4.5');eq(metrics.slotClipped,false,'platinum label fits');
    await page.locator('#medalListContainer').screenshot({path:path.join(OUT,`platinum-${width}-${theme}.png`)});
    await page.locator('#medalSlotBar').screenshot({path:path.join(OUT,`platinum-slots-${width}-${theme}.png`)});
    await page.evaluate(()=>{switchLab('calc');document.getElementById('labPokeSelect').value='アブソル';document.getElementById('labLvSlider').value='9';document.getElementById('labItem1').value='アクセルリスト';document.getElementById('labGrade1').value='30';calcLabStats();});
    eq(await page.evaluate(()=>labCalcResult['待ち時間']),23,'rendered stats share corrected CDR');
    eq((await page.locator('#labTotalStats').innerText()).includes('わざの待ち時間短縮'),true,'CDR label says reduction');
    eq(errors,[],'no runtime errors');measurements.push({width,theme,...metrics});await context.close();
  }
  const fresh=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
  await fresh.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();if(['POST','PUT','PATCH','DELETE'].includes(r.request().method()))writes++;return r.abort();});
  await fresh.addInitScript(()=>{localStorage.setItem('usage_disabled','1');localStorage.setItem('guestHideRegPrompt','1');});
  const emptyEquipment={items:Array.from({length:3},()=>({name:'',grade:30})),activeEffects:[],goalCount:0,koStack:0,dmgStack:0,healTarget:'self',proc:{TargetPct:null,SelfPct:null,HPDamage:null}};
  const old={schema:1,dataVersion:'data-before-medal-fix',attacker:'アブソル',defender:'カビゴン',attackLevel:9,defendLevel:9,skills:[{name:'',upgrade:''},{name:'',upgrade:''}],medal:{slots:['ニャオハ',...Array(9).fill(null)],rarities:Array(10).fill('bronze')},attack:emptyEquipment,defense:emptyEquipment,baseline:null};
  const recipient=await fresh.newPage();await recipient.goto(origin+'/#conditions='+Buffer.from(JSON.stringify(old),'utf8').toString('base64url'));await recipient.waitForFunction(()=>document.getElementById('lcImportDialog')?.open);
  eq((await recipient.locator('#lcImportSummary').innerText()).includes('現在のデータで再計算'),true,'old data version warns before import');
  eq(await recipient.evaluate(()=>isGuest()),false,'preview alone does not start guest session');await recipient.locator('#lcApply').click();await recipient.waitForFunction(()=>!document.getElementById('lcImportDialog').open);
  eq(await recipient.evaluate(()=>CalcConditions.capture().medal.rarities[0]),'platinum','actual old shared link restores platinum in fresh browser');
  eq(await recipient.evaluate(()=>dcAtkStats['移動速度']-LAB_STATUS['アブソル'].ms[8]),35,'old rarity keeps its original numeric bonus');
  eq(await recipient.evaluate(()=>CalcConditions.capture().dataVersion!=='data-before-medal-fix'),true,'new capture uses current data version');
  await fresh.close();
  eq(writes,0,'no real DB write attempts');fs.writeFileSync(path.join(OUT,'browser-checks.json'),JSON.stringify({checks,writes,measurements},null,2));console.log('ALL PASS — '+checks+' medal correction browser checks; real DB writes: 0');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser?.close();server.close();}})();
