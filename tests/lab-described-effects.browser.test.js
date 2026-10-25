// 既知の説明効果75行を実際に選択し、3画面すべてで誤った未確認表示が消えることを確認する。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/effect-display-recheck-20261025/screens'),base='https://36odi.github.io/pokemon-unite-tracker/';
const rules=require('../data/lab-described-effects.json').rules;let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
(async()=>{let browser;try{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'}),errors=[],writes=[];
 await ctx.route('**/*',r=>{const q=r.request();if(q.method()!=='GET'){writes.push(q.url());return r.abort();}if(!q.url().startsWith(base))return r.abort();const f=path.resolve(root,decodeURIComponent(new URL(q.url()).pathname.slice('/pokemon-unite-tracker/'.length))||'index.html');if(path.relative(root,f).startsWith('..')||!fs.existsSync(f))return r.abort();return r.fulfill({body:fs.readFileSync(f),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(f)]||'application/octet-stream'});});
 await ctx.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('usage_disabled','1');localStorage.setItem('theme','dark');});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.evaluate(()=>showPage('lab'));await page.waitForFunction(()=>typeof LAB_DESCRIPTIONS!=='undefined'&&libReady('lab'));
 const before=await page.evaluate(()=>JSON.stringify({K:LAB_SKILLS,S:LAB_STATUS}));
 const counts=await page.evaluate(rules=>{
  const count={ratio:0,stats:0,damage:0},unknown='この成分の計算式は未確認';
  switchLab('ratio');for(const r of rules){ratioPokemon=r.pokemon;ratioRender();const name=r.name.replace(/[+＋]$/,'');const section=document.getElementById('ratioSlot'+ratioSlots.indexOf(r.slot));const card=[...section.querySelectorAll('.card')].find(c=>[...c.querySelectorAll('h4')].some(h=>h.firstChild.textContent.trim().replace(/[+＋]$/,'')===name));if(!card||card.textContent.includes(unknown)||!card.textContent.includes(labMoveDescription(r.pokemon,r.name)))throw Error(r.pokemon+'/'+r.name+' ratio unresolved');count.ratio++;}
  switchLab('calc');for(const r of rules){document.getElementById('labPokeSelect').value=r.pokemon;labOnPokeChange();let id;if(r.slot==='ユナイトわざ')id='labDmgOutUnite';else{const slot=r.slot.slice(-1);document.getElementById('labSkill'+slot+'Sel').value=r.name;labSkillChanged(slot);id='labDmgOut'+slot;}const text=document.getElementById(id).textContent;if(text.includes(unknown)||!text.includes(labMoveDescription(r.pokemon,r.name)))throw Error(r.pokemon+'/'+r.name+' stats unresolved');count.stats++;}
  switchLab('dmg');document.getElementById('dcDefPoke').value='カビゴン';for(const r of rules){document.getElementById('dcAtkPoke').value=r.pokemon;calcDmgCalcMain(false);let id;if(r.slot==='ユナイトわざ')id='dcDmgOutUnite';else{const slot=r.slot.slice(-1);document.getElementById('dcSkill'+slot+'Sel').value=r.name;dcSkillChanged(slot);id='dcDmgOut'+slot;}const text=document.getElementById(id).textContent;if(text.includes(unknown)||!text.includes(labMoveDescription(r.pokemon,r.name)))throw Error(r.pokemon+'/'+r.name+' damage unresolved');count.damage++;}return count;
 },rules);eq(counts,{ratio:75,stats:75,damage:75},'all 225 affected selections');
 for(const mode of ['calc','dmg']){
  const plus=await page.evaluate(mode=>{switchLab(mode);if(mode==='calc'){document.getElementById('labPokeSelect').value='ニンフィア';labOnPokeChange();document.getElementById('labSkill2Sel').value='めいそう+';labSkillChanged(2);return document.getElementById('labDmgOut2').textContent;}document.getElementById('dcAtkPoke').value='ニンフィア';calcDmgCalcMain(false);document.getElementById('dcSkill2Sel').value='めいそう+';dcSkillChanged(2);return document.getElementById('dcDmgOut2').textContent;},mode);
  eq(plus.includes('＋版の変更点：')&&plus.includes('最初のダメージを1回防ぎ')&&plus.includes('シールド'),true,mode+' selects plus explanation even when base components are carried');
 }
 const safeUnknown=await page.evaluate(()=>{
  const r={name:'めいそう',coeff:null,effectStatus:'described'},d=LAB_DESCRIPTIONS.pokemon['ニンフィア'].moves['めいそう'];
  const unreviewed=ratioRow({...r,effectStatus:undefined},'ニンフィア').includes('計算式は未確認');
  LAB_DESCRIPTIONS.pokemon['ニンフィア'].moves['めいそう']=undefined;
  const missing=ratioRow(r,'ニンフィア').includes('計算式は未確認');LAB_DESCRIPTIONS.pokemon['ニンフィア'].moves['めいそう']=d;return{unreviewed,missing};
 });eq(safeUnknown,{unreviewed:true,missing:true},'genuine unknowns and missing descriptions remain explicit');
 await page.evaluate(()=>{switchLab('ratio');ratioPokemon='ニンフィア';ratioRender();});
 const mind=page.locator('#ratioSlot2 .card').filter({hasText:'めいそう'});
 const text=await mind.innerText();for(const part of ['30%','40%','10%','3秒','特攻 × 90％ ＋ 100','＋版の待ち時間：未確認'])eq(text.includes(part),true,'Calm Mind preserves '+part);
 const metrics=[];for(const width of [1100,390])for(const theme of ['dark','light']){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.classList.toggle('light-mode',theme==='light'),theme);
  await mind.screenshot({path:path.join(out,'calm-mind-'+theme+'-'+width+'.png')});eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow '+theme+width);
  const style=await mind.locator('.ratio-description').first().evaluate(el=>{const s=getComputedStyle(el),b=getComputedStyle(el.closest('.card'));return{color:s.color,background:b.backgroundColor,font:parseFloat(s.fontSize),line:parseFloat(s.lineHeight)};});
  const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  const a=lum(style.color),b=lum(style.background),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);eq(contrast>=4.5&&style.font>=14&&style.line/style.font>=1.6,true,'legible text '+theme+width);metrics.push({width,theme,...style,contrast});
 }
 await page.evaluate(()=>{switchLab('calc');document.getElementById('labPokeSelect').value='フーパ';labOnPokeChange();});
 await page.locator('#labUniteSection').screenshot({path:path.join(out,'hoopa-unite-calc-light-390.png')});
 eq((await page.locator('#labDmgOutUnite').innerText()).includes('最大HPが40%上がり'),true,'Unite unique explanation is shown separately from common buffs');
 await page.evaluate(()=>switchLab('ratio'));
 await page.locator('#ratioSearch').focus();await page.keyboard.press('Tab');eq(await page.evaluate(()=>document.activeElement.id!=='ratioSearch'),true,'keyboard navigation');
 eq(await page.evaluate(()=>JSON.stringify({K:LAB_SKILLS,S:LAB_STATUS})),before,'no rendering mutation');eq(errors,[],'no runtime errors');eq(writes,[],'no external writes');
 fs.writeFileSync(path.join(out,'../browser-verification.json'),JSON.stringify({checks,counts,metrics,errors,writes},null,2));console.log('ALL PASS — '+checks+' effect description browser checks, 225 selections; external writes: 0');
}finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
