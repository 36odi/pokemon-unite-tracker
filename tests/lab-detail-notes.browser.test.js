// 詳細仕様を3画面へ表示し、数値・選択データを変えないことを確認。外部送信を遮断する。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/international-data-quality-20261025/screens'),base='https://36odi.github.io/pokemon-unite-tracker/';
const detail=require('../data/lab-detail-notes.json');let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'}),errors=[],writes=[];
 await ctx.route('**/*',r=>{const q=r.request();if(q.method()!=='GET'){writes.push(q.url());return r.abort();}if(!q.url().startsWith(base))return r.abort();const f=path.resolve(root,decodeURIComponent(new URL(q.url()).pathname.slice('/pokemon-unite-tracker/'.length))||'index.html');if(path.relative(root,f).startsWith('..')||!fs.existsSync(f))return r.abort();return r.fulfill({body:fs.readFileSync(f),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream'});});
 await ctx.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('usage_disabled','1');localStorage.setItem('theme','dark');});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.evaluate(()=>showPage('lab'));await page.waitForFunction(()=>typeof LAB_DESCRIPTIONS!=='undefined'&&libReady('lab'));
 const before=await page.evaluate(()=>JSON.stringify({S:LAB_STATUS,K:LAB_SKILLS,I:LAB_ITEMS,M:LAB_MEDALS}));
 const results=await page.evaluate(detail=>{
  const rows=detail.rules.flatMap(r=>r.targets.map(t=>({...t,id:r.id,text:r.text,status:r.status})));
  const check=(el,t,view)=>{if(!el||!el.textContent.includes(t.text))throw Error(view+' '+t.id+' '+t.pokemon+'/'+t.name+' missing details');};
  const results={ratio:0,calc:0,dmg:0,combat:0};
  switchLab('ratio');
  for(const p of Object.keys(LAB_STATUS)){
   ratioPokemon=p;ratioRender();for(const t of rows.filter(t=>t.pokemon===p)){const slot={Basic:0,'Move 1':1,'Move 2':2,'Unite Move':3,Passive:4}[t.slot];check(document.getElementById('ratioSlot'+slot),t,'ratio');results.ratio++;}
   if(!document.getElementById('ratioResult').textContent.includes(detail.combat[p].critical))throw Error(p+' combat notes missing');results.combat++;
  }
  for(const view of ['calc','dmg']){
   switchLab(view);const dc=view==='dmg',prefix=dc?'dc':'lab';
   if(dc)document.getElementById('dcDefPoke').value='カビゴン';
   for(const p of Object.keys(LAB_STATUS)){
    document.getElementById(dc?'dcAtkPoke':'labPokeSelect').value=p;
    document.getElementById(dc?'dcAtkLv':'labLvSlider').value=15;
    if(dc)calcDmgCalcMain(false);else calcLabStats(false);
    if(!document.getElementById(prefix+'DmgOutNormal').textContent.includes(detail.combat[p].critical))throw Error(view+' '+p+' combat notes missing');results.combat++;
    for(const t of rows.filter(t=>t.pokemon===p)){
     let suffix={Basic:'Normal',Passive:'Passive','Unite Move':'Unite'}[t.slot];
     if(!suffix){const slot=t.slot==='Move 1'?1:2,select=document.getElementById(prefix+'Skill'+slot+'Sel'),name=t.name+(t.kind==='upgrades'?'+':'');if(![...select.options].some(o=>o.value===name))throw Error(view+' '+p+' option absent '+name);select.value=name;if(dc)dcSkillChanged(slot);else labSkillChanged(slot);suffix=slot;}
     check(document.getElementById(prefix+'DmgOut'+suffix),t,view);results[view]++;
    }
   }
  }
  return results;
 },detail);
 for(const view of ['ratio','calc','dmg'])eq(results[view],162,view+' all detail bindings');eq(results.combat,309,'all species in all three views have combat notes');
 await page.evaluate(()=>{switchLab('ratio');ratioPokemon='ギルガルド';ratioRender();});
 eq((await page.locator('#ratioSlot2').innerText()).includes('未確定の仕様：'),true,'unconfirmed Iron Defense remains qualified');
 eq((await page.locator('#ratioSlot2').innerText()).includes('妨害効果は防ぎません'),true,'Iron Head damage versus hindrance');
 const disclosure=page.locator('#ratioResult details').first();await disclosure.locator('summary').focus();await page.keyboard.press('Enter');eq(await disclosure.getAttribute('open'),'','keyboard opens combat notes');await page.keyboard.press('Enter');eq(await disclosure.getAttribute('open'),null,'keyboard closes combat notes');
 eq(await disclosure.locator('summary').evaluate(el=>el.getBoundingClientRect().height>=44),true,'combat disclosure touch target');
 for(const p of ['ラティアス','ドラパルト']){await page.evaluate(p=>{ratioPokemon=p;ratioRender();},p);eq((await page.locator('#ratioResult').innerText()).includes('出典間で相違：'),true,p+' conflict visible');}
 await page.evaluate(()=>{ratioPokemon='レシラム';ratioRender();});eq((await page.locator('#ratioSlot3').innerText()).includes('使用3回目の、強化されたユナイトわざでのみ'),true,'conditional shared Unite buffs');
 const metrics=[];
 for(const width of [1100,390])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.classList.toggle('light-mode',theme==='light');ratioPokemon='ギルガルド';ratioRender();},theme);
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,theme+'/'+width+' no horizontal overflow');
  const card=page.locator('#ratioSlot2 .card').filter({has:page.locator('h4',{hasText:/^てっぺき/})});await card.screenshot({path:path.join(out,'iron-defense-'+theme+'-'+width+'.png')});
  const style=await card.locator('.lab-effect-description').first().evaluate(el=>{const s=getComputedStyle(el),card=getComputedStyle(el.closest('.card'));return {color:s.color,background:card.backgroundColor,font:parseFloat(s.fontSize),line:parseFloat(s.lineHeight)};});
  const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return v[0]*.2126+v[1]*.7152+v[2]*.0722;};const a=lum(style.color),b=lum(style.background),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);eq(contrast>=4.5,true,'detail contrast '+theme+width);eq(style.font>=14&&style.line/style.font>=1.6,true,'detail readability '+theme+width);metrics.push({width,theme,...style,contrast});
  await page.evaluate(()=>{ratioPokemon='ラティアス';ratioRender();});await page.locator('.ratio-section .card').filter({has:page.locator('h4',{hasText:/^ドラゴンエール/})}).screenshot({path:path.join(out,'latias-conflict-'+theme+'-'+width+'.png')});
 }
 await page.evaluate(()=>{switchLab('calc');document.documentElement.classList.remove('light-mode');document.getElementById('labPokeSelect').value='ギルガルド';calcLabStats(false);document.getElementById('labSkill2Sel').value='アイアンヘッド+';labSkillChanged(2);});await page.locator('#labDmgOut2').screenshot({path:path.join(out,'iron-head-calculator-mobile.png')});
 await page.evaluate(()=>{switchLab('ratio');const d=LAB_DESCRIPTIONS.pokemon['ギルガルド'].moves['アイアンヘッド'].details[0];d.text='<img src=x onerror="window.__detailsXss=1">';d.label='<script>';ratioPokemon='ギルガルド';ratioRender();});eq(await page.locator('#ratioSlot2 .lab-effect-description img,#ratioSlot2 .lab-effect-description script').count(),0,'detail text HTML escaped');eq(await page.evaluate(()=>window.__detailsXss===undefined),true,'no details script execution');
 eq(await page.evaluate(()=>JSON.stringify({S:LAB_STATUS,K:LAB_SKILLS,I:LAB_ITEMS,M:LAB_MEDALS})),before,'calculation data not mutated');eq(errors,[],'no browser errors');eq(writes,[],'no external writes');
 fs.writeFileSync(path.join(out,'../detail-browser-verification.json'),JSON.stringify({checks,results,metrics,errors,writes},null,2));console.log('ALL PASS — '+checks+' detailed mechanics browser checks, 486 bindings and 309 combat views; external writes: 0');
}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
