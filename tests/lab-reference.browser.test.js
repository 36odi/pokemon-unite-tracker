// 全103体を3画面で開く。実DB・外部サービスへの送信を遮断する。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/tracker-improvement-20261024/screens'),base='https://36odi.github.io/pokemon-unite-tracker/';
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'}),errors=[],writes=[];
 await ctx.route('**/*',r=>{const q=r.request();if(q.method()!=='GET'){writes.push(q.url());return r.abort();}if(!q.url().startsWith(base))return r.abort();const u=new URL(q.url()),f=path.resolve(root,decodeURIComponent(u.pathname.slice('/pokemon-unite-tracker/'.length))||'index.html');if(path.relative(root,f).startsWith('..')||!fs.existsSync(f))return r.abort();return r.fulfill({body:fs.readFileSync(f),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream'});});
 await ctx.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('usage_disabled','1');localStorage.setItem('theme','dark');});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.evaluate(()=>showPage('lab'));await page.waitForFunction(()=>typeof LAB_DESCRIPTIONS!=='undefined'&&libReady('lab'));
 const before=await page.evaluate(()=>JSON.stringify({S:LAB_STATUS,K:LAB_SKILLS,I:LAB_ITEMS}));
 const ratios=await page.evaluate(()=>{switchLab('ratio');let n=0;for(const p of Object.keys(LAB_SKILLS)){ratioPokemon=p;ratioRender();if(!document.querySelector('#ratioSlot0').textContent.includes(labBasicDescription(p)))throw Error(p+' basic explanation absent');if(!document.querySelector('#ratioSlot3').textContent.includes('使用後の共通強化'))throw Error(p+' Unite metadata absent');if(/NaN|undefined/.test(document.querySelector('#ratioResult').textContent))throw Error(p+' invalid ratio value');n++;}return n;});eq(ratios,103,'all ratio pages');
 const withheldText=await page.evaluate(()=>['キュワワー','ヌメルゴン'].map(p=>{ratioPokemon=p;ratioRender();return document.getElementById('ratioResult').textContent;}).join('\n'));eq(/持続時間は未確定|合計は未確定|参照元未確認|自身と相手のどちらのHPかは未確認/.test(withheldText),false,'unconfirmed narrative specifications are not published');
 const stats=await page.evaluate(()=>{switchLab('calc');let n=0;for(let i=1;i<=3;i++)document.getElementById('labItem'+i).value='';for(const p of Object.keys(LAB_STATUS)){document.getElementById('labPokeSelect').value=p;document.getElementById('labLvSlider').value=15;calcLabStats(false);if(!document.querySelector('#labDmgOutNormal').textContent.includes(labBasicDescription(p)))throw Error(p+' calculator basic explanation absent');if(/NaN|undefined/.test(document.querySelector('#labResultCard').textContent))throw Error(p+' invalid stat value');n++;}return n;});eq(stats,103,'all stat calculators');
 await page.evaluate(()=>{document.getElementById('labPokeSelect').value='リザードン';document.getElementById('labItem1').value='ピントレンズ';document.getElementById('labGrade1').value=30;calcLabStats(false);});
 eq((await page.locator('#labTotalStats').innerText()).includes('急所率\n36%'),true,'critical rate includes intrinsic 30% plus item 6%');
 await page.evaluate(()=>{document.getElementById('labPokeSelect').value='ハピナス';calcLabStats(false);document.getElementById('labSkill1Sel').value='てだすけ';labSkillChanged(1);});eq((await page.locator('#labDmgOut1').innerText()).includes('4秒間30%'),true,'known support effect stays selectable and displays its amount and duration');
 const damage=await page.evaluate(()=>{switchLab('dmg');document.getElementById('dcDefPoke').value='カビゴン';let n=0;for(const p of Object.keys(LAB_STATUS)){document.getElementById('dcAtkPoke').value=p;calcDmgCalcMain(false);if(!document.querySelector('#dcDmgOutNormal').textContent.includes(labBasicDescription(p)))throw Error(p+' damage basic explanation absent');if(/NaN|undefined/.test(document.querySelector('#dcResultCard').textContent))throw Error(p+' invalid damage output');n++;}return n;});eq(damage,103,'all damage calculators');
 const plusSelection=await page.evaluate(()=>{let checked=0;for(const[p,rs]of Object.entries(LAB_SKILLS))for(const name of new Set(rs.filter(r=>/[+＋]$/.test(r.name)).map(r=>r.name))){const levels=[...new Set(rs.filter(r=>r.name===name).map(r=>r.upg))];if(levels.length!==1)continue;if(JSON.stringify(labUpgradeRows(p,name,''))!==JSON.stringify(labUpgradeRows(p,name,levels[0])))throw Error(p+'/'+name+' loses upgraded components when level selector is hidden');checked++;}return checked;});eq(plusSelection>300,true,'all single-level upgrades keep their components with a hidden level selector');
 const solgaleoPlus=await page.evaluate(()=>{document.getElementById('dcAtkPoke').value='ソルガレオ';calcDmgCalcMain(false);dcAtkStats={HP:6000,攻撃:400,特攻:0};dcDefStats={HP:10000,防御:0,特防:0};for(const[slot,name]of [[1,'アイアンヘッド+'],[2,'サイコショック+']]){document.getElementById('dcSkill'+slot+'Sel').value=name;dcSkillChanged(slot);}return{attack:[...document.querySelectorAll('#dcDmgOut1 .lab-dmg-row')].find(el=>el.textContent.includes('[9]'))?.querySelector('.dc-act')?.textContent,heal:[...document.querySelectorAll('#dcDmgOut2 .lab-dmg-row')].find(el=>el.textContent.includes('[11]'))?.querySelector('.dc-act')?.textContent};});
 eq(solgaleoPlus.attack,'2,275','Iron Head+ anti-unstoppable damage: 400*325%+975');eq(solgaleoPlus.heal,'588','Psyshock+ healing: 400*84%+252');
 await page.evaluate(()=>{document.getElementById('dcAtkPoke').value='キュワワー';calcDmgCalcMain(false);document.getElementById('dcSkill1Sel').value='フラワーヒール';dcSkillChanged(1);LabReview.captureA();});
 const pending=await page.evaluate(()=>[...document.querySelectorAll('#lrComparisonOutput tbody tr')].filter(r=>r.querySelector('th')?.textContent.includes('最大HPを超えた分')).map(r=>[...r.querySelectorAll('td')].slice(0,2).map(t=>t.textContent)));
 eq(pending.length>0,true,'comparison includes overheal components');eq(pending.every(v=>v.every(t=>t==='条件未確認')),true,'unknown overheal is never zero in comparison');
 await page.evaluate(()=>{switchLab('ratio');ratioPokemon='ニンフィア';ratioRender();});eq((await page.locator('#ratioSlot2').innerText()).includes('＋版の待ち時間：未確認'),false,'source base inheritance removes false unknown upgrade cooldown');
 const addedMechanics=await page.evaluate(()=>{
  const shield=LAB_SKILLS['マスカーニャ'].find(r=>r.narrativeKey==='Meowscarada|Move 2|Trailblaze|rsb|enhanced|くさわけ+');
  const psy=LAB_SKILLS['グレンアルマ'].find(r=>r.sourceKey==='Armarouge|Move 2|Psyshock|rsb|base'&&r.name==='サイコショック');
  const previous=labCalcResult;labCalcResult={HP:6000,攻撃:400,特攻:400};document.getElementById('labLvSlider').value=13;
  const text=html=>{const box=document.createElement('div');box.innerHTML=html;return box.textContent;};
  const result={formula:ratioFormula(shield),stat:text(_calcDmgHtml(shield,'マスカーニャ')),damage:text(_dcDmgHtml(shield,labCalcResult,{HP:10000,防御:600,特防:600},13,0,'マスカーニャ')),penetration:text(_dcDmgHtml(psy,labCalcResult,{HP:10000,防御:600,特防:600},13,15,'グレンアルマ'))};
  labCalcResult=previous;return result;
 });
 eq(addedMechanics.formula,'HP × （20 ＋ 0.5 ×（Lv − 1））％','level growth is shown inside the HP percentage');
 eq(addedMechanics.stat.includes('1,560'),true,'stat renderer calculates the level-13 Trailblaze shield');
 eq(addedMechanics.damage.includes('1,560'),true,'damage renderer calculates the same Trailblaze shield');
 eq(addedMechanics.penetration.includes('472'),true,'damage renderer combines Psyshock native penetration and Spoon');
 const snipeShot=await page.evaluate(()=>{
  const values=[];for(const name of ['ねらいうち','ねらいうち+'])for(const pen of [0,15]){
   const rows=LAB_SKILLS['インテレオン'].filter(r=>r.name===name&&r.sourceKey);
   values.push(rows.map(r=>{const box=document.createElement('div');box.innerHTML=_dcDmgHtml(r,{HP:6000,攻撃:400,特攻:400},{HP:10000,防御:600,特防:600},13,pen,'インテレオン');return Number(box.querySelector('.dc-act').textContent.replaceAll(',',''));}));
  }return {values,summary:labMoveDescription('インテレオン','ねらいうち')};
 });
 eq(snipeShot.values,[[265,424,577],[289,463,631],[265,424,577],[289,463,631]],'normal and upgraded Snipe Shot render distance-based penetration with and without Spoon');
 eq(snipeShot.summary.includes('ため具合'),false,'Snipe Shot penetration is described by distance rather than charge');
 const recovered=await page.evaluate(()=>{const text=html=>{const el=document.createElement('div');el.innerHTML=html;return el.textContent;};labCalcResult={HP:6000,攻撃:400,特攻:400};document.getElementById('labLvSlider').value=13;return ['オーロット','ヨクバリス'].map(p=>{const r=LAB_SKILLS[p].find(r=>r.dmgType===(p==='オーロット'?'回復（しぜんかいふく）':'きのみの追加回復（オボン・カムラ）'));return{text:text(_calcDmgHtml(r,p)),formula:ratioFormula(r)};});});
 eq(recovered[0].text.replaceAll(',','').includes('1992'),true,'Natural Cure total is rendered after rounding each level-dependent tick');
 eq(recovered[0].formula.includes('0.18'),true,'Natural Cure exposes percentage growth in the ratio formula');
 eq(recovered[1].text.includes('83'),true,'Sitrus/Salac extra healing excludes the Oran level term in the calculator');
 const rendererOnly=await page.evaluate(()=>{const r=LAB_SKILLS['カビゴン'].find(r=>r.name==='じたばた+'&&r.dmgType==='強化攻撃（じたばた・HP段階5）'),d=LAB_SKILLS['ジュラルドン'].find(r=>r.name==='りゅうのはどう'&&r.dmgType==='ダメージ（初撃・最大ため）');labCalcResult={HP:6000,攻撃:400,特攻:400};document.getElementById('labLvSlider').value=13;const text=html=>{const e=document.createElement('div');e.innerHTML=html;return e.textContent.replaceAll(',','');};return{flail:text(_calcDmgHtml(r,'カビゴン')),formula:ratioFormula(r),damage:text(_dcDmgHtml(r,labCalcResult,{HP:10000,防御:600,特防:600},13,0,'カビゴン')),pulse:text(_calcDmgHtml(d,'ジュラルドン'))};});
 eq(rendererOnly.flail.includes('1884'),true,'Flail mixed attack and HP formula is rendered in stat calculator');eq(rendererOnly.flail.includes('最大HP6000 x 10%'),true,'stat calculator exposes the separate self HP term');eq(rendererOnly.formula.includes('自分の最大HP × 10％'),true,'ratio list includes the self HP term');eq(rendererOnly.damage.includes('942'),true,'damage calculator reduces combined Flail terms by defense');eq(rendererOnly.pulse.includes('268'),true,'Dragon Pulse missing main damage is available in calculator');
 const views=[],visualAudit=[];
 for(const width of [1100,390])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.classList.toggle('light-mode',theme==='light'),theme);
  await page.evaluate(()=>{switchLab('calc');document.getElementById('labPokeSelect').value='リザードン';calcLabStats(false);});await page.locator('#labResultCard').screenshot({path:path.join(out,'stats-'+theme+'-'+width+'.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'stat no overflow '+theme+width);
  await page.evaluate(()=>{switchLab('ratio');ratioPokemon='キュワワー';ratioRender();});await page.locator('#ratioSlot1').screenshot({path:path.join(out,'shield-'+theme+'-'+width+'.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'formula no overflow '+theme+width);
  await page.evaluate(()=>{ratioPokemon='ニンフィア';ratioRender();});await page.locator('#ratioSlot3').screenshot({path:path.join(out,'unite-'+theme+'-'+width+'.png')});
  await page.evaluate(()=>{ratioPokemon='マスカーニャ';ratioRender();});await page.locator('#ratioSlot2').screenshot({path:path.join(out,'level-shield-'+theme+'-'+width+'.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'level-dependent formula no overflow '+theme+width);views.push({width,theme});
  await page.evaluate(()=>{ratioPokemon='オーロット';ratioRender();});await page.locator('#ratioSlot4').screenshot({path:path.join(out,'natural-cure-'+theme+'-'+width+'.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Natural Cure formula and source conditions fit '+theme+width);
  await page.evaluate(()=>{ratioPokemon='ラティオス';ratioRender();});await page.locator('#ratioSlot2').screenshot({path:path.join(out,'missing-hp-'+theme+'-'+width+'.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'upgrade-only HP terms fit '+theme+width);
  await page.evaluate(()=>{ratioPokemon='カビゴン';ratioRender();});await page.locator('#ratioSlot1 .ratio-row').filter({hasText:'通常攻撃（じたばた・HP段階1）'}).first().screenshot({path:path.join(out,'flail-'+theme+'-'+width+'.png')});
  eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mixed attack plus HP formula fits '+theme+width);
  await page.evaluate(()=>{ratioPokemon='ジュラルドン';ratioRender();});await page.locator('#ratioSlot1 .ratio-row').filter({hasText:'初撃・最大ため'}).first().screenshot({path:path.join(out,'dragon-pulse-'+theme+'-'+width+'.png')});
  visualAudit.push({width,theme,samples:await page.locator('#ratioSlot1 .ratio-row').filter({hasText:'初撃・最大ため'}).first().evaluate(el=>[...el.querySelectorAll('.ratio-label,.ratio-formula,.ratio-meta')].map(n=>{let p=n,bg;for(;p;p=p.parentElement){bg=getComputedStyle(p).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;}const s=getComputedStyle(n);return{text:n.textContent.slice(0,45),color:s.color,background:bg,fontSize:s.fontSize,lineHeight:s.lineHeight};}))});
 }
 await page.locator('#ratioSearch').focus();await page.keyboard.press('Tab');eq(await page.evaluate(()=>document.activeElement!==document.getElementById('ratioSearch')),true,'keyboard moves from search');
 eq(await page.evaluate(()=>JSON.stringify({S:LAB_STATUS,K:LAB_SKILLS,I:LAB_ITEMS})),before,'rendering never mutates source data');eq(errors,[],'no browser runtime errors');eq(writes,[],'no external writes');
 const result={checks,ratioSpecies:ratios,statSpecies:stats,damageSpecies:damage,views,errors,writes};fs.writeFileSync(path.join(out,'../browser-verification.json'),JSON.stringify(result,null,2));console.log('ALL PASS — '+checks+' reviewed browser checks (309 species/views)');
 fs.writeFileSync(path.join(root,'work/improvement-next-20261025/visual-audit-samples-resume2.json'),JSON.stringify(visualAudit,null,2));
}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
