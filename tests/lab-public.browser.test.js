// 公開用ローカルURLをGitHub Pages相当の相対配置で検査。外部通信と実DB書込は禁止。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/lab-improvement-implementation-20261026/stage5');
const {build}=require('../tools/build_lab_pages');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain'};
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.startsWith('/pokemon-unite-tracker/'))name=name.slice('/pokemon-unite-tracker'.length);if(name.endsWith('/'))name+='index.html';const p=path.resolve(ROOT,'.'+name);if(path.relative(ROOT,p).startsWith('..')||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
let browser,checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
(async()=>{try{
 fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/pokemon-unite-tracker/';
 browser=await chromium.launch({channel:'msedge',headless:true});
 const files=build();for(const [p,html]of files){eq(fs.readFileSync(path.join(ROOT,p),'utf8'),html,'generated artifact matches current shared source: '+p);if(p.endsWith('.html')){const response=await fetch(base+p.split('/').map(encodeURIComponent).join('/'));eq(response.status,200,'direct static 200: '+p);}}
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'data/lab-pages-manifest.json'),'utf8'));
 eq(manifest.pokemon.length,103,'103 static Pokémon pages');
 for(const p of manifest.pokemon){const html=fs.readFileSync(path.join(ROOT,'lab/pokemon',p,'index.html'),'utf8');eq(html.includes('<link rel="canonical" href="https://36odi.github.io/pokemon-unite-tracker/lab/pokemon/'+encodeURIComponent(p)+'/">'),true,'individual canonical');eq(html.includes('<tbody><tr>'),true,'stats present without JS');eq(html.includes('ratio-formula'),true,'formulas present without JS');eq(/onclick=|supabase|GoatCounter/i.test(html),false,'static page has no auth/inline interaction/tracking');}
 const measurements=[];let publicShared;
 for(const width of [390,1100])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'}),requests=[],errors=[];
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();requests.push({url:r.request().url(),method:r.request().method()});return r.abort();});
  const state=width===390?{guestMode:'1',guest_series:'[{"id":"keep"}]',guest_battles_keep:'[{"id":"battle"}]',guestMigratePending:'1',guest_medal_presets_snap:'[null]',unite_medal_presets:'[null]'}:{'sb-example-auth-token':'{"access_token":"preserve-account","refresh_token":"preserve-refresh"}',unite_medal_presets_v2_account:'{"keep":true}',lastSeriesId:'keep'};
  await context.addInitScript(({state,theme})=>{if(!localStorage.getItem('__publicFixture')){for(const [k,v]of Object.entries({...state,theme,__publicFixture:'1'}))localStorage.setItem(k,v);}window.__storageWrites=[];const original=Storage.prototype.setItem,remove=Storage.prototype.removeItem;Storage.prototype.setItem=function(k,v){if(this===localStorage)window.__storageWrites.push(k);return original.call(this,k,v);};Storage.prototype.removeItem=function(k){if(this===localStorage)window.__storageWrites.push(k);return remove.call(this,k);};},{state,theme});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?lab='+encodeURIComponent('アブソル'));await page.waitForFunction(()=>window.LabPublic&&ratioPokemon==='アブソル');
  const original=await page.evaluate(()=>JSON.stringify({...localStorage}));
  eq(await page.evaluate(()=>db),null,'auth client never created');eq(await page.evaluate(()=>isGuest()),false,'public lab does not enter saved guest mode');eq(await page.locator('#ratioResult h2').innerText(), ' アブソル','direct public Pokémon');
  if(width===390&&theme==='dark'){
    const matches=await page.evaluate(async names=>{
      const result=[];
      for(const p of names){const response=await fetch('lab/pokemon/'+encodeURIComponent(p)+'/'),doc=new DOMParser().parseFromString(await response.text(),'text/html');ratioPokemon=p;ratioRender();
        const formulas=es=>[...es].map(e=>e.textContent);
        const sameFormula=JSON.stringify(formulas(doc.querySelectorAll('.ratio-formula')))===JSON.stringify(formulas(document.querySelectorAll('#ratioResult .ratio-formula')));
        const rows=[...doc.querySelectorAll('.lab-static-table tbody tr')],sameStats=rows.every((row,i)=>{const actual=[...row.querySelectorAll('td')].map(e=>e.textContent);return JSON.stringify(actual)===JSON.stringify(Object.values(computeStats({poke:p,lv:i+1},LAB_STATS_DEPS)).map(String));});result.push({p,sameFormula,sameStats});
      }
      ratioPokemon='アブソル';ratioRender();return result;
    },manifest.pokemon);
    for(const m of matches){eq(m.sameFormula,true,'static vs browser formulas: '+m.p);eq(m.sameStats,true,'15 levels static vs browser calculator: '+m.p);}
  }
  await page.locator('#ratioChoices button').filter({hasText:/^ピカチュウ$/}).click();eq(new URL(page.url()).searchParams.get('lab'),'ピカチュウ','selection updates URL');
  await page.goBack();await page.waitForFunction(()=>ratioPokemon==='アブソル');eq(await page.locator('#ratioResult h2').innerText(),' アブソル','back restores Pokémon');
  await page.goForward();await page.waitForFunction(()=>ratioPokemon==='ピカチュウ');
  await page.evaluate(()=>switchLab('calc'));eq(await page.locator('#labPokeSelect').inputValue(),'ピカチュウ','tabs retain selected Pokémon');eq(new URL(page.url()).searchParams.get('tool'),'calc','tab URL');
  await page.locator('#labPokeSelect').selectOption('ストライク');await page.goBack();await page.waitForFunction(()=>document.getElementById('labPokeSelect').value==='ピカチュウ');eq(new URL(page.url()).searchParams.get('lab'),'ピカチュウ','back restores stat selection');
  await page.evaluate(()=>switchLab('dmg'));await page.locator('#lcEdit').click();await page.locator('#dcDefPoke').selectOption('カビゴン');
  await page.evaluate(()=>calcDmgCalcMain(false));eq(await page.locator('#dcResultCard').isVisible(),true,'public damage calculation');
  const condition=await page.evaluate(()=>CalcConditions.capture());await page.evaluate(()=>CalcConditions.apply(CalcConditions.capture()));eq(await page.evaluate(()=>CalcConditions.capture()),condition,'public condition apply roundtrip');
  await page.locator('#lcSave').click();await page.locator('#lcName').fill('一時保存の確認');await page.locator('#lcSaveForm button[type=submit]').click();eq(await page.locator('#lcSavedList').innerText().then(s=>s.includes('一時保存の確認')),true,'in-memory conditions usable');
  await page.evaluate(()=>CalcConditions.share(CalcConditions.capture()));const shared=await page.locator('#lcShareUrl').inputValue();publicShared=shared;eq(new URL(shared).searchParams.get('lab'),'ピカチュウ','share retains public route');await page.locator('#lcShareDialog [data-close]').click();
  await page.evaluate(()=>{switchLab('medal');labMedalSlots[0]='フシギダネ';labRenderMedalSlots();});await page.evaluate(()=>labSaveMedalPreset(0));eq(await page.evaluate(()=>labMedalPresets[0].slots[0]),'フシギダネ','public medal temporary preset usable');
  eq(await page.evaluate(()=>JSON.stringify({...localStorage})),original,'all account/guest/storage bytes unchanged');eq(await page.evaluate(()=>window.__storageWrites),[],'public viewing/calculation/save causes no persistent writes');
  await page.evaluate(()=>switchLab('ratio'));await page.locator('#ratioChoices button').filter({hasText:/^ストライク$/}).focus();await page.keyboard.press('Enter');eq(await page.evaluate(()=>ratioPokemon),'ストライク','keyboard selects Pokémon');
  const metrics=await page.locator('.lab-public-nav').evaluate(e=>({overflow:document.documentElement.scrollWidth>innerWidth+1,links:[...e.querySelectorAll('a')].map(n=>{const b=n.getBoundingClientRect();return {width:b.width,height:b.height};})}));eq(metrics.overflow,false,'public lab no page overflow');eq(metrics.links.every(b=>b.height>=44&&b.width>=44),true,'new links touch targets');
  await page.screenshot({path:path.join(OUT,`public-${width}-${theme}.png`)});
  await page.goto(shared);await page.locator('#lcImportDialog').waitFor({state:'visible'});eq(await page.locator('#lcSavedCount').innerText(),'0件','temporary conditions disappear after navigation');eq(await page.evaluate(()=>labMedalPresets.every(p=>p===null)),true,'temporary medal sets disappear after navigation');await page.locator('#lcApply').click();eq(await page.evaluate(()=>CalcConditions.capture()),condition,'shared conditions restore with no login');eq(await page.evaluate(()=>localStorage.getItem('guestMode')),state.guestMode??null,'share does not enable guest mode');eq(await page.evaluate(()=>window.__storageWrites),[],'shared import no persistent writes');
  await page.goto(base+'lab/');await page.locator('#labStaticSearch').fill('ぴか');eq(await page.locator('.lab-static-list li:visible').count(),1,'static list hiragana search');await page.locator('.lab-static-list li:visible a').focus();await page.keyboard.press('Enter');eq(await page.locator('h1').innerText(),'ピカチュウのデータ','static keyboard navigation');
  eq(await page.locator('link[rel=canonical]').getAttribute('href'),'https://36odi.github.io/pokemon-unite-tracker/lab/pokemon/'+encodeURIComponent('ピカチュウ')+'/','canonical uses published base');
  eq(await page.locator('.lab-static-table tbody tr').count(),15,'all levels in static HTML');eq(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'static page no page overflow');
  await page.screenshot({path:path.join(OUT,`static-${width}-${theme}.png`)});
  eq(errors,[],'no browser exceptions');eq(requests,[],'no external requests including authentication or DB');measurements.push({width,theme,metrics});await context.close();
 }
 // JavaScriptを実行しない新規ブラウザーでも本文を取得できる。
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900},serviceWorkers:'block'});const page=await nojs.newPage();await page.goto(base+'lab/pokemon/'+encodeURIComponent('アブソル')+'/');eq(await page.locator('.ratio-formula').count()>10,true,'no-JS formulas readable');eq(await page.locator('tbody tr').count(),15,'no-JS all stat rows');eq(await page.locator('h1').innerText(),'アブソルのデータ','no-JS title');await page.screenshot({path:path.join(OUT,'no-js-390.png')});await nojs.close();
 // サブディレクトリなしの配置も同じ相対リンクで動く。
 const plain=await browser.newContext({serviceWorkers:'block'});await plain.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const plainPage=await plain.newPage();await plainPage.goto(origin+'/?lab='+encodeURIComponent('アブソル')+'&tool=calc');await plainPage.waitForFunction(()=>document.getElementById('labPokeSelect').value==='アブソル');eq(await plainPage.locator('#labPublicData').getAttribute('href'),origin+'/lab/pokemon/'+encodeURIComponent('アブソル')+'/index.html','root deployment relative link');
 await plainPage.goto(publicShared);await plainPage.locator('#lcImportDialog').waitFor({state:'visible'});await plainPage.locator('#lcApply').click();eq(await plainPage.evaluate(()=>document.getElementById('dcAtkPoke').value),'ピカチュウ','new browser shared import');eq(await plainPage.evaluate(()=>({...localStorage})),{},'brand-new browser remains free of guest/account/storage state');eq(await plainPage.evaluate(()=>db),null,'new browser shared import no auth client');
 await plainPage.goto(origin+'/?lab='+encodeURIComponent('未収録名')+'&tool=invalid');await plainPage.waitForFunction(()=>window.LabPublic);eq(await plainPage.locator('#ratioResult').innerText(),'指定されたポケモンは見つかりません。一覧から選択してください。','unknown Pokémon handled explicitly');eq(await plainPage.locator('#labRatioPanel').isVisible(),true,'unknown tool falls back to ratio');await plain.close();
 fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({checks,externalRequests:0,realDBWrites:0,measurements},null,2));console.log('ALL PASS — '+checks+' public lab/static/browser checks; real DB writes: 0');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{if(browser)await browser.close();server.close();}})();
