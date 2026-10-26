// 詳細仕様を3画面へ表示し、数値・選択データを変えないことを確認。外部送信を遮断する。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/confirmed-specifications-20261025/screens'),base='https://36odi.github.io/pokemon-unite-tracker/';
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
  // 出典の技1/技2とアプリの既存の並びが異なる場合も、実際の表示先で検査する。
  const appSlot=t=>(LAB_SKILLS[t.pokemon]||[]).find(r=>labDescriptionKey(r.name)===labDescriptionKey(t.name))?.slot||({Basic:'通常攻撃',Passive:'特性','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ'}[t.slot]);
  const check=(el,t,view)=>{if(!el||el.textContent.includes(t.text)!==(t.status==='documented'))throw Error(view+' '+t.id+' '+t.pokemon+'/'+t.name+' confirmed-only visibility mismatch');};
  const results={ratio:0,calc:0,dmg:0,combat:0};
  switchLab('ratio');
  for(const p of Object.keys(LAB_STATUS)){
   ratioPokemon=p;ratioRender();for(const t of rows.filter(t=>t.pokemon===p)){const slot={'通常攻撃':0,'わざ1':1,'わざ2':2,'ユナイトわざ':3,'特性':4}[appSlot(t)];check(document.getElementById('ratioSlot'+slot),t,'ratio');results.ratio++;}
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
     let suffix={'通常攻撃':'Normal','特性':'Passive','ユナイトわざ':'Unite'}[appSlot(t)];
     if(!suffix){const slot=appSlot(t)==='わざ1'?1:2,select=document.getElementById(prefix+'Skill'+slot+'Sel'),name=t.name+(t.kind==='upgrades'?'+':'');const option=[...select.options].find(o=>o.value.normalize('NFKC')===name.normalize('NFKC'));if(!option)throw Error(view+' '+p+' option absent '+name);select.value=option.value;if(dc)dcSkillChanged(slot);else labSkillChanged(slot);suffix=slot;}
     check(document.getElementById(prefix+'DmgOut'+suffix),t,view);results[view]++;
    }
   }
  }
  return results;
 },detail);
 const bindings=detail.rules.reduce((n,r)=>n+r.targets.length,0);
 for(const view of ['ratio','calc','dmg'])eq(results[view],bindings,view+' all detail bindings');eq(results.combat,309,'all species in all three views have combat notes');
 await page.evaluate(()=>{switchLab('ratio');ratioPokemon='ギルガルド';ratioRender();});
 eq((await page.locator('#ratioSlot2').innerText()).includes('未確定の仕様：'),false,'unconfirmed Iron Defense specification is hidden');
 eq((await page.locator('#ratioSlot2').innerText()).includes('他資料での確認が完了していません'),false,'no unconfirmed Iron Defense prose');
 eq((await page.locator('#ratioSlot2').innerText()).includes('妨害効果は防ぎません'),true,'Iron Head damage versus hindrance');
 const disclosure=page.locator('#ratioResult details').first();await disclosure.locator('summary').focus();await page.keyboard.press('Enter');eq(await disclosure.getAttribute('open'),'','keyboard opens combat notes');await page.keyboard.press('Enter');eq(await disclosure.getAttribute('open'),null,'keyboard closes combat notes');
 eq(await disclosure.locator('summary').evaluate(el=>el.getBoundingClientRect().height>=44),true,'combat disclosure touch target');
 for(const p of ['ラティアス','ドラパルト']){await page.evaluate(p=>{ratioPokemon=p;ratioRender();},p);eq((await page.locator('#ratioResult').innerText()).includes('出典間で相違'),false,p+' conflict hidden');}
 eq(await page.evaluate(()=>{renderChangelog();return document.getElementById('changelogList').textContent.includes('海外データサイトも照合し、出典に食い違いがある仕様や、追加確認が必要な補足を区別して表示します。');}),false,'requested changelog sentence removed');
 await page.evaluate(()=>{ratioPokemon='レシラム';ratioRender();});eq((await page.locator('#ratioSlot3').innerText()).includes('使用3回目の、強化されたユナイトわざでのみ'),true,'conditional shared Unite buffs');
 const metrics=[];
 for(const width of [1100,390])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.classList.toggle('light-mode',theme==='light');ratioPokemon='ギルガルド';ratioRender();},theme);
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,theme+'/'+width+' no horizontal overflow');
  const card=page.locator('#ratioSlot2 .card').filter({has:page.locator('h4',{hasText:/^てっぺき/})});await card.screenshot({path:path.join(out,'iron-defense-'+theme+'-'+width+'.png')});
  const confirmedCard=page.locator('#ratioSlot2 .card').filter({has:page.locator('h4',{hasText:/^アイアンヘッド/})});
  const style=await confirmedCard.locator('.lab-effect-description').first().evaluate(el=>{const s=getComputedStyle(el),card=getComputedStyle(el.closest('.card'));return {color:s.color,background:card.backgroundColor,font:parseFloat(s.fontSize),line:parseFloat(s.lineHeight)};});
  const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return v[0]*.2126+v[1]*.7152+v[2]*.0722;};const a=lum(style.color),b=lum(style.background),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);eq(contrast>=4.5,true,'detail contrast '+theme+width);eq(style.font>=14&&style.line/style.font>=1.6,true,'detail readability '+theme+width);metrics.push({width,theme,...style,contrast});
  await page.evaluate(()=>{ratioPokemon='ラティアス';ratioRender();});await page.locator('.ratio-section .card').filter({has:page.locator('h4',{hasText:/^ドラゴンエール/})}).screenshot({path:path.join(out,'latias-summary-'+theme+'-'+width+'.png')});
 }
 await page.evaluate(()=>{switchLab('calc');document.documentElement.classList.remove('light-mode');document.getElementById('labPokeSelect').value='ギルガルド';calcLabStats(false);document.getElementById('labSkill2Sel').value='アイアンヘッド+';labSkillChanged(2);});await page.locator('#labDmgOut2').screenshot({path:path.join(out,'iron-head-calculator-mobile.png')});
 await page.evaluate(()=>{switchLab('ratio');const d=LAB_DESCRIPTIONS.pokemon['ギルガルド'].moves['アイアンヘッド'].details[0];d.text='<img src=x onerror="window.__detailsXss=1">';d.label='<script>';ratioPokemon='ギルガルド';ratioRender();});eq(await page.locator('#ratioSlot2 .lab-effect-description img,#ratioSlot2 .lab-effect-description script').count(),0,'detail text HTML escaped');eq(await page.evaluate(()=>window.__detailsXss===undefined),true,'no details script execution');
 eq(await page.evaluate(()=>JSON.stringify({S:LAB_STATUS,K:LAB_SKILLS,I:LAB_ITEMS,M:LAB_MEDALS})),before,'calculation data not mutated');eq(errors,[],'no browser errors');eq(writes,[],'no external writes');
 fs.writeFileSync(path.join(out,'../detail-browser-verification.json'),JSON.stringify({checks,results,metrics,errors,writes},null,2));console.log('ALL PASS — '+checks+' confirmed-only browser checks, '+(bindings*3)+' bindings audited and 309 combat views; external writes: 0');
}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
