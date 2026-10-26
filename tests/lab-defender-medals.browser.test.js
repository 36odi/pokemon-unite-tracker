// Edgeの実画面。外部通信を遮断し、実DBへの書き込みなしで検査する。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/lab-improvement-implementation-20261026/stage3');
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
    await page.evaluate(()=>{switchLab('dmg');document.getElementById('lcEditor').open=true;document.getElementById('dcAtkPoke').value='アブソル';document.getElementById('dcDefPoke').value='カビゴン';calcDmgCalcMain();});
    const original=await page.evaluate(()=>({attack:dcAtkStats,defense:dcDefStats}));
    for(const [color,key] of [['ブルー','防御'],['パープル','特防']]){
      const result=await page.evaluate(({color,key})=>{
        const names=LAB_MEDALS.filter(m=>m.c1===color||m.c2===color).slice(0,6).map(m=>m.name);
        const preset={name:'相手の非公開名',slots:[...names,...Array(4).fill(null)],rarities:Array(10).fill('silver')};
        labMedalPresets[1]=preset;dcRefreshMedalSelect();document.getElementById('dcDefMedal').value='1';calcDmgCalcMain();
        const statKey=key,rawKey=key==='防御'?'防御':'特防';
        const flat=names.reduce((n,name)=>{const m=LAB_MEDALS.find(x=>x.name===name);return n+(m.upStat===rawKey?(m.sUp||0):0)+(m.dnStat===rawKey?(m.sDn||0):0);},0);
        const base=LAB_STATUS['カビゴン'][key==='防御'?'def':'spdef'][8];
        return {actual:dcDefStats[key],expected:Math.round((base+flat+base*.08)*1e8)/1e8,attack:dcAtkStats,rawBefore:dcCalcActual(1000,base),rawAfter:dcCalcActual(1000,dcDefStats[key]),selection:CalcConditions.capture().defenseMedal};
      },{color,key});
      eq(result.actual,result.expected,color+' uses defender base + silver flats + 8% base');
      eq(result.attack,original.attack,color+' never leaks into attacker');eq(result.rawAfter<=result.rawBefore,true,color+' changes damage using defender armor');
      eq(result.selection.rarities.every(r=>r==='silver'),true,color+' capture retains rarity');
    }
    await page.evaluate(()=>{document.getElementById('dcAtkMedal').value='1';document.getElementById('dcDefMedal').value='';calcDmgCalcMain();});
    eq(await page.evaluate(()=>dcDefStats),original.defense,'attacker medals never leak into defender');
    await page.evaluate(()=>{document.getElementById('dcAtkMedal').value='';document.getElementById('dcDefMedal').value='1';calcDmgCalcMain();LabReview.captureA();document.getElementById('dcAtkItem1').value='ちからのハチマキ';calcDmgCalcMain();});
    const captured=await page.evaluate(()=>CalcConditions.capture()),stats=await page.evaluate(()=>[dcAtkStats,dcDefStats]);
    const comparison=await page.evaluate(()=>LabReview.compareRows(LabReview.exportState().baseline,LabReview.captureEquipment()));
    eq((await page.locator('#lrComparisonOutput').innerText()).includes('攻撃側と防御側のメダル'),true,'A/B states both medals are shared conditions');
    eq(comparison.rows.every(x=>x.a&&x.b),true,'A/B evaluates both sides with defender stats');
    await page.locator('#lcSave').click();await page.locator('#lcName').fill('相手メダル検査');await page.locator('#lcSaveForm button[type=submit]').click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('unite_calc_conditions_v1_guest'))[0].condition);
    eq(saved,captured,'local saved condition includes defender medal snapshot');
    const link=await page.evaluate(()=>location.origin+location.pathname+'#conditions='+CalcConditionCodec.encode(CalcConditions.capture()));
    eq(new URL(link).hash.includes('相手の非公開名'),false,'private preset name not shared');
    await page.evaluate(()=>{labMedalPresets[1]=null;LabReview.resetCalculator();});
    await page.evaluate(async c=>CalcConditions.apply(c),saved);
    eq(await page.evaluate(()=>CalcConditions.capture()),captured,'restore independent of edited or removed preset');
    eq(await page.evaluate(()=>[dcAtkStats,dcDefStats]),stats,'restore reproduces damage stats');
    await page.locator('#lcCurrent summary').click();eq((await page.locator('#lcCurrent').innerText()).includes('防御側メダル'),true,'summary names defender medals');
    await page.evaluate(()=>document.getElementById('lcEditor').open=true);
    const metric=await page.locator('#dcDefMedal').evaluate(e=>({label:e.labels[0]?.textContent,h:e.getBoundingClientRect().height}));
    eq(metric.h>=44,true,'defender select >=44px');eq(metric.label.includes('防御側'),true,'defender select has visible accessible label');
    await page.locator('#dcDefMedal').focus();await page.keyboard.press('Home');await page.keyboard.press('Enter');await page.locator('#dcDefMedal').dispatchEvent('change');
    eq(await page.locator('#dcDefMedal').inputValue(),'','keyboard can clear defender medals');
    eq(await page.evaluate(()=>dcDefStats),original.defense,'cleared defender selection returns original stats');
    await page.evaluate(async c=>CalcConditions.apply(c),saved);await page.evaluate(()=>document.getElementById('lcEditor').open=true);
    await page.locator('#dcDefMedal').screenshot({path:path.join(OUT,`defender-select-${width}-${theme}.png`)});
    await page.locator('#lrComparison').screenshot({path:path.join(OUT,`defender-comparison-${width}-${theme}.png`)});
    // Conditional effect units: these values must not enter damage mitigation or ordinary speed.
    for(const [color,count,key,expected,unit] of [['グレー',5,'1回の攻撃で受けるダメージ',-6,''],['イエロー',3,'非戦闘時の移動速度',4,'%'],['ピンク',3,'妨害を受けた時の持続時間',-4,'%'],['ネイビー',3,'ユナイトわざゲージ（メダル）',1,'%']]){
      const result=await page.evaluate(({color,count,key})=>{
        const slots=LAB_MEDALS.filter(m=>m.c1===color||m.c2===color).slice(0,count).map(m=>m.name);slots.push(...Array(10-slots.length).fill(null));
        labMedalPresets[2]={name:'条件付き',slots,rarities:Array(10).fill('gold')};dcRefreshMedalSelect();document.getElementById('dcDefMedal').value='2';calcDmgCalcMain();
        const r={slot:'わざ1',coeff:100,stat:'攻撃',fixed:100};
        const a=labEvaluateComponent(r,dcAtkStats,dcDefStats,9),clean={...dcDefStats};delete clean[key];
        return {value:dcDefStats[key],meta:labStatMeta(key),a:a.value,b:labEvaluateComponent(r,dcAtkStats,clean,9).value,notice:document.getElementById('dcStatSummary').textContent};
      },{color,count,key});
      eq(result.value,expected,color+' retains documented amount');eq(result.meta.unit,unit,color+' correct unit');eq(result.meta.conditional,true,color+' distinct from base');eq(result.a,result.b,color+' conditional effect not silently used in damage');
      eq(result.notice.includes(result.meta.note),true,color+' limitation shown in result');
    }
    await page.locator('#dcStatSummary').screenshot({path:path.join(OUT,`conditional-${width}-${theme}.png`)});
    eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
    if(width===390&&theme==='dark'){
      const recipient=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
      await recipient.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await recipient.addInitScript(()=>localStorage.setItem('usage_disabled','1'));
      const received=await recipient.newPage();await received.goto(link);await received.waitForFunction(()=>document.getElementById('lcImportDialog')?.open);await received.locator('#lcApply').click();
      eq(await received.evaluate(()=>CalcConditions.capture()),captured,'new recipient restores both sides and A/B');eq(await received.evaluate(()=>[dcAtkStats,dcDefStats]),stats,'new recipient reproduces calculation');
      eq(await received.evaluate(()=>localStorage.getItem('unite_calc_conditions_v1_guest')),null,'shared link does not auto-save conditions');
      // old shared payload has no defenseMedal field and must clear existing selection
      const legacy={...captured};delete legacy.defenseMedal;
      const payload=Buffer.from(JSON.stringify(legacy)).toString('base64url');
      await received.goto(origin+'/#conditions='+payload);await received.waitForFunction(()=>document.getElementById('lcImportDialog')?.open);await received.locator('#lcApply').click();
      eq(await received.evaluate(()=>CalcConditions.capture().defenseMedal),null,'old actual payload defaults defender to no medals');
      eq(await received.evaluate(()=>dcDefStats),original.defense,'legacy link keeps original defender result');
      await recipient.close();
    }
    eq(errors,[],'no browser errors');measurements.push({width,theme,metric});await context.close();
  }
  eq(writes,0,'external writes blocked');fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({checks,writes,measurements},null,2));
  console.log('ALL PASS — '+checks+' defender/effect browser checks; real DB writes: 0');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{if(browser)await browser.close();server.close();}})();
