// 利用者と同じfile://から開始し、速度資料と計算欄の説明を検査する。
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/lab-local-reading-fix-20261026');
const baseline=require('./fixtures/lab-calculation-reading-before-20261026.json');
let browser,checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
(async()=>{try{
 fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(path.join(ROOT,'work/attack-speed-dragonite-20261026'),{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true});const measurements=[];
 for(const width of [390,1100])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
  let external=0;await context.route(/^https?:/,r=>{external++;return r.abort();});await context.addInitScript(t=>localStorage.setItem('theme',t),theme);
  const page=await context.newPage(),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(r.url().includes('attack-speed-'))failed.push(r.url());});
  const file=pathToFileURL(path.join(ROOT,'index.html')).href;
  await page.goto(file+'?lab='+encodeURIComponent('アブソル')+'&tool=calc');await page.locator('#labAttackSpeed[data-state=reference]').waitFor();
  eq(await page.locator('.lab-as-fill').count(),1,'file:// reference plot loads without JSON fetch');eq(await page.locator('.lab-as-retry').count(),0,'no endless retry for local file');
  const data=await page.evaluate(()=>JSON.stringify([LAB_STATUS,LAB_SKILLS,LAB_ITEMS,LAB_MEDALS]));
  if(width===390&&theme==='dark'){
   const rows=await page.evaluate(()=>{
    const output={},issues=[],proseIssues=[];document.getElementById('labLvSlider').value='13';
    const sentences=text=>String(text||'').split(/(?<=。)/).filter(Boolean);
    for(const poke of Object.keys(LAB_STATUS)){
     document.getElementById('labPokeSelect').value=poke;labOnPokeChange();
     const groups=[['labDmgOutNormal',(LAB_SKILLS[poke]||[]).filter(r=>r.slot==='通常攻撃')],['labDmgOutPassive',labPassiveRows(poke)],['labDmgOutUnite',(LAB_SKILLS[poke]||[]).filter(r=>r.slot==='ユナイトわざ')]];
     for(const slot of ['わざ1','わざ2'])for(const name of [...new Set(LAB_SKILLS[poke].filter(r=>r.slot===slot).map(r=>r.name))]){
      const id='labDmgOut'+(slot==='わざ1'?'1':'2');document.getElementById('labSkill'+(slot==='わざ1'?'1':'2')+'Sel').value=name;
      for(const upg of [...new Set(LAB_SKILLS[poke].filter(r=>r.name===name).map(r=>r.upg))])groups.push([id,labUpgradeRows(poke,name,upg)]);
     }
     for(const [id,rs]of groups){if(!rs.length)continue;if(/^labDmgOut[12]$/.test(id))document.getElementById('labSkill'+id.slice(-1)+'Sel').value=rs[0].name;_renderDmgRows(id,rs);const root=document.getElementById(id),key=JSON.stringify([poke,id,rs[0].name,rs[0].upg||'']);
      output[key]={numbers:[...root.querySelectorAll('.lab-damage-num')].map(e=>e.textContent.trim()),formulas:[...root.querySelectorAll('.lab-damage-sub')].map(e=>e.textContent.trim())};
      if(root.querySelector('details details'))issues.push(key+' nested');
      if(/NaN|undefined|Infinity/.test(root.textContent))issues.push(key+' invalid');
      const main=id==='labDmgOutNormal'?labBasicDescription(poke):labMoveDescription(poke,rs[0].name);
      const extra=id==='labDmgOutNormal'?labDescriptionDetails(poke,'通常攻撃','basics'):id==='labDmgOutPassive'?labPassiveRows(poke).flatMap(r=>labDescriptionDetails(poke,r.name,'passives')):rs.flatMap(r=>labDescriptionDetails(poke,r.name));
      const pieces=[main,...extra.map(r=>r.text),...rs.filter(r=>r.description).map(r=>r.description)];
      for(const sentence of new Set(pieces.flatMap(sentences)))if(!root.textContent.includes(sentence))proseIssues.push(key+' missing '+sentence);
     }
    }
    return {output,issues,proseIssues};
   });
   eq(Object.keys(rows.output).length,1198,'all pre-fix groups covered');
   for(const [key,expected]of Object.entries(baseline)){eq(rows.output[key]?.numbers,expected.numbers,key+' calculated amounts preserved');eq(rows.output[key]?.formulas,expected.formulas,key+' exact calculation text preserved');}
   eq(rows.issues,[],'no nested folds or invalid numbers');eq(rows.proseIssues.length,0,'all source explanation sentences preserved: '+JSON.stringify(rows.proseIssues.slice(0,3)));
  }
  await page.selectOption('#labPokeSelect','カイリュー');await page.locator('#labLvSlider').fill('13');await page.locator('#labLvSlider').dispatchEvent('input');
  for(const [slot,name]of [['1','りゅうのまい'],['2','はかいこうせん']])await page.selectOption('#labSkill'+slot+'Sel',name);
  for(const [slot,item]of [['1','ちからのハチマキ'],['2','れんだスカーフ'],['3','ピントレンズ']]){
   await page.selectOption('#labItem'+slot,item);await page.locator('#labGrade'+slot).fill('40');await page.locator('#labGrade'+slot).dispatchEvent('input');
  }
  eq(await page.locator('#labAttackSpeed').getAttribute('data-state'),'reference','Dragonite now renders reference plot in the reported file screen');
  eq(await page.evaluate(()=>labCalcResult['通常攻撃の速さ']),57.99,'reported Lv13 G40 build uses existing shared bonus');
  eq(await page.locator('#labAttackSpeed .is-current>span').innerText(),'40F','reported build has visible stage');
  eq((await page.locator('#labAttackSpeed .lab-as-scope-note').innerText()).includes('げきりん中'),true,'Dragonite exception is visible without opening details');
  eq((await page.locator('#labAttackSpeed').innerText()).includes('適用確認待ち'),false,'reported blocking message is gone');
  await page.locator('#labEffects input[value="れんだスカーフ"]').check();eq(await page.locator('#labAttackSpeed .is-current>span').innerText(),'36F','Scarf proc updates Dragonite plot');await page.locator('#labEffects input[value="れんだスカーフ"]').uncheck();
  eq(await page.locator('.lab-as-retry').count(),0,'reported Dragonite screen has no retry error');
  await page.locator('#labAttackSpeed').screenshot({path:path.join(ROOT,'work/attack-speed-dragonite-20261026',`dragonite-${width}-${theme}.png`)});
  eq(await page.locator('#labSkillCard details[open]').count(),0,'explanations and formulas initially collapsed');
  eq(await page.locator('#labDmgOutNormal>.lab-reading-details').count(),1,'normal attack has one explanation disclosure');
  eq(await page.locator('#labDmgOutUnite .lab-reading-details').count()>=2,true,'move and common Unite enhancement separated');
  const metrics=await page.locator('#labSkillCard').evaluate(card=>{
   const normal=document.getElementById('labDmgOutNormal'),preview=normal.querySelector('.lab-reading-preview'),body=normal.querySelector('.lab-reading-body'),summary=normal.querySelector('summary'),s=getComputedStyle(preview);
   const lum=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
   const contrast=[...card.querySelectorAll('.lab-reading-label,.lab-reading-preview,.lab-damage-label,.lab-damage-label>.u-c-text3,.lab-calculation-warning')].map(e=>{
    const color=lum(getComputedStyle(e).color);let node=e,background='';while(node){background=getComputedStyle(node).backgroundColor;if(!['rgba(0, 0, 0, 0)','transparent'].includes(background))break;node=node.parentElement;}
    const back=lum(background);return (Math.max(color,back)+.05)/(Math.min(color,back)+.05);
   });
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,columns:getComputedStyle(card.querySelector('.lab-skill-grid')).gridTemplateColumns.split(' ').length,
    minimumTextContrast:Math.min(...contrast),
    previewFont:parseFloat(s.fontSize),previewLine:parseFloat(s.lineHeight),previewHeight:preview.getBoundingClientRect().height,
    bodyFont:parseFloat(getComputedStyle(body.querySelector('p')).fontSize),summaryHeight:summary.getBoundingClientRect().height,height:card.getBoundingClientRect().height};
  });eq(metrics.overflow,false,'no horizontal overflow');eq(metrics.columns,1,'full-width move sections instead of narrow columns');eq(metrics.previewHeight<=metrics.previewLine*2+1,true,'short preview capped at two lines');eq(metrics.bodyFont>=16,true,'readable full explanation');eq(metrics.summaryHeight>=44,true,'touch target >=44');
  eq(metrics.minimumTextContrast>=4.5,true,'new reading elements meet 4.5:1 in both themes');
  await page.locator('#labSkillCard').screenshot({path:path.join(OUT,`dragonite-${width}-${theme}-closed.png`)});
  const description=page.locator('#labDmgOutNormal>.lab-reading-details>summary');await description.focus();await page.keyboard.press('Enter');
  eq(await page.locator('#labDmgOutNormal .lab-reading-body').first().isVisible(),true,'Enter opens explanation');eq(await page.locator('#labDmgOutNormal .lab-reading-preview').isVisible(),false,'preview is hidden while reading the full explanation');
  await page.locator('#labLvSlider').fill('14');await page.locator('#labLvSlider').dispatchEvent('input');eq(await page.locator('#labDmgOutNormal>.lab-reading-details').getAttribute('open')!==null,true,'input changes retain disclosure state');
  const formula=page.locator('#labDmgOutNormal .lab-reading-formula>summary').first();await formula.focus();await page.keyboard.press('Enter');eq(await page.locator('#labDmgOutNormal .lab-damage-sub').first().isVisible(),true,'Enter opens exact formula');
  await page.locator('#labDmgOutNormal').screenshot({path:path.join(OUT,`normal-${width}-${theme}-open.png`)});
  await page.evaluate(()=>switchLab('dmg'));await page.locator('#lcEdit').click();await page.selectOption('#dcAtkPoke','カイリュー');await page.selectOption('#dcDefPoke','カビゴン');await page.locator('#labDmgCalcPanel button').filter({hasText:'計算する'}).first().click();
  eq(await page.locator('#dcDmgOutNormal>.lab-reading-details').count(),1,'damage calculation uses same explanation layout');eq(await page.locator('#dcResultCard details details').count(),0,'damage view has no nested explanation folds');
  eq(await page.evaluate(()=>JSON.stringify([LAB_STATUS,LAB_SKILLS,LAB_ITEMS,LAB_MEDALS])),data,'source data is unchanged');eq(failed,[],'no failed speed-resource requests');eq(errors,[],'file rendering has no script errors');eq(external,0,'direct file needs no external connection');measurements.push({width,theme,...metrics});await context.close();
 }
 const guest=await browser.newContext({serviceWorkers:'block'});await guest.route(/^https?:/,r=>r.abort());
 await guest.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('guest_series',JSON.stringify([{id:'local-reading-fixture',name:'検査用'}]));});
 const guestPage=await guest.newPage();await guestPage.goto(pathToFileURL(path.join(ROOT,'index.html')).href);await guestPage.evaluate(()=>{showPage('lab');switchLab('calc');});await guestPage.selectOption('#labPokeSelect','アブソル');await guestPage.locator('#labAttackSpeed[data-state=reference]').waitFor();eq(await guestPage.locator('.lab-as-fill').count(),1,'plain local-file guest launch also works');await guest.close();
 fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({checks,groups:1198,measurements,realDBWrites:0},null,2));
 console.log(`ALL PASS — ${checks} local-file/reading checks; 1198 calculated groups preserved; real DB writes: 0`);
}catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser?.close();}})();
