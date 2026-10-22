const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/conditions-patch-check');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,p=path.resolve(ROOT,'.'+(name==='/'?'/index.html':name));if(path.relative(ROOT,p).startsWith('..')||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}res.setHeader('content-type',mime[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);});
let browser,checks=0,writes=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
(async()=>{try{
 fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'});
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();if(['POST','PUT','PATCH','DELETE'].includes(r.request().method()))writes++;return r.abort();});
 await context.addInitScript(()=>{
  if(localStorage.getItem('__conditionsFixture'))return;localStorage.setItem('__conditionsFixture','1');localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');localStorage.setItem('usage_disabled','1');localStorage.setItem('lastSeriesId','patch-fixture');
  localStorage.setItem('guest_series',JSON.stringify([{id:'patch-fixture',name:'分析確認',created_at:'2026-09-01T00:00:00Z'}]));
  const b={pokemon:'ピカチュウ',result:'win',match_type:'solo',skill1:'エレキボール',skill2:'ボルテッカー',items:'こだわりメガネ,すりぬけスプーン',battle_item:'だっしゅつボタン',rank:'エキスパート・C1',kills:0,dmg_dealt:1000,series_id:'patch-fixture'};
  const rows=[{...b,id:'before',created_at:'2026-09-03T12:59:59+09:00'},
   {...b,id:'boundary',result:'loss',created_at:'2026-09-03T13:00:00+09:00',kills:10,dmg_dealt:null},
   {...b,id:'bot',is_bot:true,created_at:'2026-09-04T13:00:00+09:00',kills:30,dmg_dealt:3000},
   {...b,id:'excluded',created_at:'2026-09-05T13:00:00+09:00',kills:99,dmg_dealt:9000,exclude_from_avg_stats:true},
   {...b,id:'other',items:'ものしりメガネ',result:'loss',created_at:'2026-09-06T13:00:00+09:00',kills:20,dmg_dealt:2000},
   {...b,id:'unknown',created_at:null}];localStorage.setItem('guest_battles_patch-fixture',JSON.stringify(rows));
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>typeof CalcConditions!=='undefined'&&battles.length===6);
 const original=await page.evaluate(()=>localStorage.getItem('guest_battles_patch-fixture'));
 await page.evaluate(()=>{showPage('lab');switchLab('dmg');});eq(await page.locator('#lcEditor').getAttribute('open'),null,'editing initially collapsed');await page.locator('#lcEdit').click();
 await page.selectOption('#dcAtkPoke','フシギバナ');await page.selectOption('#dcDefPoke','カビゴン');
 for(const [prefix,level,names] of [['dcAtk',15,['ちからのハチマキ','きあいのハチマキ','おおきなねっこ']],['dcDef',13,['ちからのハチマキ','きあいのハチマキ','いやしのかんむり']]]){
  await page.locator('#'+prefix+'Lv').fill(String(level));await page.locator('#'+prefix+'Lv').dispatchEvent('input');
  for(let i=0;i<3;i++){await page.selectOption('#'+prefix+'Item'+(i+1),names[i]);await page.locator('#'+prefix+'Grade'+(i+1)).fill(String([10,20,40][i]));await page.locator('#'+prefix+'Grade'+(i+1)).dispatchEvent('input');}
  for(const name of names)if(name!=='おおきなねっこ')await page.locator('#'+prefix+'Effects input[value="'+name+'"]').check();
 }
 await page.evaluate(()=>{labMedalPresets[0]={name:'秘密のメダル名',slots:['ピジョン',...Array(9).fill(null)],rarities:Array(10).fill('silver')};dcRefreshMedalSelect();});await page.selectOption('#dcAtkMedal','0');
 for(const [id,v] of [['dcAtkProcTargetPct','67.5'],['dcAtkProcSelfPct','12'],['dcDefProcTargetPct','33'],['dcDefProcSelfPct','18'],['dcDefProcHPDamage','210']]){await page.locator('#'+id).fill(v);await page.locator('#'+id).dispatchEvent('change');}
 await page.selectOption('#dcAtkHealTarget','ally');await page.getByRole('button',{name:'計算する',exact:true}).click();await page.selectOption('#dcSkill1Sel','ギガドレイン');
 const upgs=await page.locator('#dcSkill1Upg option').evaluateAll(es=>es.map(o=>o.value));if(await page.locator('#dcSkill1Upg').isVisible())await page.selectOption('#dcSkill1Upg',upgs.at(-1));
 await page.locator('#lrComparison button',{hasText:'現在の構成をAにする'}).click();await page.locator('#dcAtkGrade3').fill('10');await page.locator('#dcAtkGrade3').dispatchEvent('input');
 const expected=await page.evaluate(()=>CalcConditions.capture()),stats=await page.evaluate(()=>[dcAtkStats,dcDefStats]);
 eq(expected.baseline.items[2].grade,40,'A keeps original grade');eq(expected.attack.items[2].grade,10,'B grade changed');eq(expected.defense.proc.HPDamage,210,'defender proc input captured');
 await page.locator('#lcSave').click();await page.locator('#lcName').fill('秘密の保存名');await page.locator('#lcNote').fill('秘密の個人メモ');await page.locator('#lcSaveForm button[type=submit]').click();
 eq(await page.locator('#lcSavedCount').innerText(),'1件','saved list');
 const savedRaw=await page.evaluate(()=>localStorage.getItem('unite_calc_conditions_v1_guest'));
 await page.locator('#lcSave').click();await page.locator('#lcName').fill('保存失敗の確認');
 await page.evaluate(()=>{window.originalConditionSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('unite_calc_conditions_v1_'))throw Error('保存できませんでした。');return window.originalConditionSetItem.call(this,k,v);};});
 await page.locator('#lcSaveForm button[type=submit]').click();eq(await page.evaluate(()=>localStorage.getItem('unite_calc_conditions_v1_guest')),savedRaw,'failed save leaves stored conditions intact');
 await page.evaluate(()=>Storage.prototype.setItem=window.originalConditionSetItem);await page.locator('[data-close="lcSaveDialog"]').click();
 await page.locator('#dcAtkProcTargetPct').fill('101');await page.locator('#lcSave').click();eq(await page.locator('#lcSaveDialog').getAttribute('open'),null,'invalid numeric input not silently saved as missing');await page.locator('#dcAtkProcTargetPct').fill('67.5');await page.locator('#dcAtkProcTargetPct').dispatchEvent('change');
 await page.evaluate(()=>{localStorage.setItem('unite_calc_conditions_v1_guest','invalid');CalcConditions.renderSaved();});eq((await page.locator('#lcSavedList').innerText()).includes('保存内容は変更していません'),true,'corrupt storage explained without deleting it');eq(await page.evaluate(()=>localStorage.getItem('unite_calc_conditions_v1_guest')),'invalid','corrupt storage left intact');await page.evaluate(raw=>{localStorage.setItem('unite_calc_conditions_v1_guest',raw);CalcConditions.renderSaved();},savedRaw);
 await page.locator('#lcShare').click();const url=await page.locator('#lcShareUrl').inputValue();await page.locator('[data-close="lcShareDialog"]').click();
 eq(await page.evaluate(url=>{const c=CalcConditionCodec.decode(new URL(url).hash.slice(12));return [Object.keys(c).sort(),JSON.stringify(c).includes('秘密'),c.medal.label,c.attack.items.map(i=>i.grade)];},url),[Object.keys(expected).sort(),false,undefined,[10,20,10]],'shared payload contains only calculation data');
 await page.reload();await page.waitForFunction(()=>typeof CalcConditions!=='undefined'&&battles.length===6);await page.evaluate(()=>{showPage('lab');switchLab('dmg');labMedalPresets[0]={name:'変更後',slots:Array(10).fill('ポッポ'),rarities:Array(10).fill('gold')};});
 eq(await page.locator('#lcSavedCount').innerText(),'1件','saved conditions survive reload');
 await page.locator('#lcSavedList [data-action="load"]').click();eq(await page.locator('#dcAtkPoke').inputValue(),'','preview does not change inputs');await page.locator('#lcApply').click();await page.waitForFunction(()=>!document.getElementById('lcImportDialog').open);
 eq(await page.evaluate(()=>CalcConditions.capture()),expected,'restore complete attacker, defender, skills, medals, proc and A/B');eq(await page.evaluate(()=>[dcAtkStats,dcDefStats]),stats,'restored calculation matches despite changed medal preset');eq(await page.locator('#lcEditor').getAttribute('open'),null,'restored conditions show summary rather than full inputs');
 eq(await page.locator('#dcAtkGLbl1').textContent(),'G10','grade display matches restored value');eq(await page.locator('#dcDefGLbl3').textContent(),'G40','defender grade display restored');
 const recipient=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await recipient.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await recipient.addInitScript(()=>{localStorage.setItem('usage_disabled','1');});
 const received=await recipient.newPage();await received.goto(url);await received.waitForFunction(()=>document.getElementById('lcImportDialog')?.open);
 eq(await received.locator('#dcAtkPoke').inputValue(),'','shared link waits for confirmation');await received.locator('#lcApply').click();
 eq(await received.evaluate(()=>CalcConditions.capture()),expected,'shared link reproduces conditions in fresh browser');eq(await received.locator('#lcSavedCount').innerText(),'0件','shared condition not auto-saved');eq(await received.evaluate(()=>isGuest()),true,'recipient can explicitly load as guest');
 eq(await received.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'shared mobile no overflow');await recipient.close();
 await page.evaluate(async()=>{const c=CalcConditions.capture();c.dataVersion='old-data';await CalcConditions.preview(c);});eq((await page.locator('#lcImportSummary').innerText()).includes('現在のデータで再計算'),true,'version mismatch explained');await page.locator('[data-close="lcImportDialog"]').click();
 await page.evaluate(async()=>{const c=CalcConditions.capture();c.attacker='未収録のポケモン';await CalcConditions.preview(c);});eq(await page.locator('#lcApply').isDisabled(),true,'unsupported data not silently replaced');await page.locator('[data-close="lcImportDialog"]').click();eq(await page.evaluate(()=>CalcConditions.capture()),expected,'unsupported preview does not change current conditions');
 await page.evaluate(()=>{localStorage.removeItem('guestMode');labSessionOwner='account-A';LabReview.clearSession();switchLab('dmg');});eq(await page.locator('#lcSavedCount').innerText(),'0件','account cannot see guest conditions');
 await page.evaluate(async c=>{await CalcConditions.apply(c);},expected);await page.locator('#lcSave').click();await page.locator('#lcName').fill('アカウントA専用');await page.locator('#lcSaveForm button[type=submit]').click();
 await page.evaluate(()=>{labSessionOwner='account-B';LabReview.clearSession();switchLab('dmg');});eq(await page.locator('#lcSavedCount').innerText(),'0件','other account list isolated');
 await page.evaluate(()=>{localStorage.setItem('guestMode','1');labSessionOwner='guest';LabReview.clearSession();switchLab('dmg');});eq(await page.locator('#lcSavedCount').innerText(),'1件','guest saved conditions retained after owner changes');
 await page.setViewportSize({width:390,height:844});await page.locator('#lcLibrary').screenshot({path:path.join(OUT,'conditions-mobile.png')});eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'library mobile no overflow');
 await page.evaluate(()=>LabReview.openHub('ピカチュウ'));await page.waitForFunction(()=>document.getElementById('pokeHubHeader').textContent.includes('ピカチュウ'));await page.locator('[data-hub-tab="patch"]').click();
 await page.selectOption('#paPatch','20260903');await page.selectOption('#paDays','7');
 eq(await page.evaluate(()=>allSeriesRawData[0].battles.some(b=>b.id==='bot')),true,'raw analysis retains BOT records');
 eq(await page.locator('#paOutput .pa-metric p').allTextContents(),['1試合 ／ 1勝 0敗','2試合 ／ 1勝 1敗'],'exact boundary after and same build counts');
 await page.locator('#paSame').uncheck();eq(await page.locator('#paOutput .pa-metric p').allTextContents(),['1試合 ／ 1勝 0敗','3試合 ／ 1勝 2敗'],'all build counts');
 const ko=await page.locator('#paOutput .lr-table tbody tr').first().innerText();eq(ko.includes('15')&&ko.includes('対象 2試合'),true,'KO average excludes flagged record and counts denominator');
 const damage=await page.locator('#paOutput .lr-table tbody tr').nth(2).innerText();eq(damage.includes('2,000')&&damage.includes('対象 1試合'),true,'damage excludes missing values, not zero');
 eq((await page.locator('#paOutput').innerText()).includes('日時不明の除外：1試合'),true,'unknown timestamp visible');
 await page.locator('#paBots').uncheck();eq(await page.locator('#paOutput .pa-metric p').allTextContents(),['1試合 ／ 1勝 0敗','4試合 ／ 2勝 2敗'],'BOT toggle works even if global analysis excludes BOT');
 await page.selectOption('#paRank','レジェンド');eq((await page.locator('#paOutput').innerText()).includes('前後の比較はできません'),true,'empty side explicitly not comparable');await page.selectOption('#paRank','');
 await page.getByText('わざ・もちものなどで個別に絞る',{exact:true}).click();await page.selectOption('#paItem','ものしりメガネ');eq(await page.locator('#paOutput .pa-metric p').allTextContents(),['0試合 ／ 0勝 0敗','1試合 ／ 0勝 1敗'],'individual item filter');await page.selectOption('#paItem','');
 await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+09:00'));
 await page.selectOption('#paPatch','20261013');eq((await page.locator('#paOutput').innerText()).includes('指定期間はまだ終わっていません'),true,'recent post period incomplete warning');
 await page.clock.setFixedTime(new Date('2026-10-22T12:00:00+09:00'));
 await page.selectOption('#paPatch','20261013');eq((await page.locator('#paOutput').innerText()).includes('指定期間はまだ終わっていません'),false,'completed post period clears warning');
 await page.selectOption('#paPatch','20260903');await page.locator('#pokeHubPatch').screenshot({path:path.join(OUT,'patch-mobile.png')});eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'patch mobile no overflow');
 eq(await page.evaluate(()=>localStorage.getItem('guest_battles_patch-fixture')),original,'records never changed');eq(errors,[],'no page errors');eq(writes,0,'no external writes');
 await page.evaluate(()=>{showPage('lab');switchLab('dmg');});page.once('dialog',d=>d.accept());await page.locator('#lcSavedList [data-action="delete"]').click();eq(await page.locator('#lcSavedCount').innerText(),'0件','delete removes only saved calculation condition');eq(await page.evaluate(()=>localStorage.getItem('guest_battles_patch-fixture')),original,'delete does not change battle records');
 console.log('ALL PASS — '+checks+' conditions/patch browser checks; real DB writes: 0');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{if(browser)await browser.close();server.close();}})();
