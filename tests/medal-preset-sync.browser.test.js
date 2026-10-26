// Real application UI, mocked Supabase boundary. External writes are blocked.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'work/lab-improvement-implementation-20261026');
const server=http.createServer((req,res)=>{
  const file=path.resolve(ROOT,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname)));
  if(path.relative(ROOT,file).startsWith('..')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
let browser,checks=0,externalWrites=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
(async()=>{try{
  fs.mkdirSync(OUT,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const width of [390,1100]){
    const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
    await context.route('**/*',route=>{
      if(new URL(route.request().url()).origin===origin)return route.continue();
      if(['POST','PUT','PATCH','DELETE'].includes(route.request().method()))externalWrites++;
      return route.abort();
    });
    await context.addInitScript(()=>{localStorage.setItem('guestMode','1');localStorage.setItem('guestHideRegPrompt','1');});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
    await page.evaluate(()=>showPage('lab'));await page.waitForFunction(()=>labDataReady);
    await page.evaluate(async()=>{switchLab('medal');labAddMedalToSlot('ポッポ');await labSaveMedalPreset(0);});
    eq(await page.locator('#medalPresetStatus').innerText(),'この端末に保存しています。',width+': guest saved status');
    await page.reload();await page.evaluate(()=>showPage('lab'));await page.waitForFunction(()=>labDataReady);await page.evaluate(()=>switchLab('medal'));
    eq(await page.evaluate(()=>labMedalPresets[0].slots[0]),'ポッポ',width+': guest preset survives reload');
    // Mock only the database client methods the sync adapter uses. No request reaches a real DB.
    await page.evaluate(async()=>{
      localStorage.removeItem('guestMode');labSessionOwner='fixture-A';
      window.__presetMock={owner:'fixture-A',row:null,reads:0,writes:0,fail:false,counter:0,filters:[],loseRace:false};
      db.auth.getUser=async()=>({data:{user:{id:__presetMock.owner}},error:null});
      db.from=table=>{
        if(table!=='medal_presets')throw Error('unexpected table '+table);
        let op='read',body,filters=[];
        const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},is(k,v){filters.push([k,v]);return query;},
          update(v){op='update';body=v;return query;},insert(v){op='insert';body=v;return query;},
          async maybeSingle(){
            if(op==='read'){__presetMock.reads++;return {data:structuredClone(__presetMock.row),error:null};}
            __presetMock.writes++;__presetMock.filters=filters;
            if(__presetMock.fail)return {data:null,error:{message:'offline'}};
            if(__presetMock.loseRace){
              __presetMock.loseRace=false;const data=Array(8).fill(null);data[0]={name:'別端末',slots:['ピカチュウ'],rarities:['gold']};
              __presetMock.row={data,updated_at:'2026-10-26T00:01:00.000Z'};return {data:null,error:null};
            }
            if(op==='insert'&&__presetMock.row)return {data:null,error:{code:'23505'}};
            if(op==='update'&&filters.some(([k,v])=>k==='updated_at'&&v!==__presetMock.row?.updated_at))return {data:null,error:null};
            __presetMock.row=structuredClone(body);return {data:{updated_at:body.updated_at},error:null};
          }};return query;
      };
      await labPresetSelectOwner('fixture-A');await _loadPresetsFromSupabase();
    });
    eq(await page.evaluate(()=>labMedalPresets[0]),null,width+': guest content not imported into account');
    await page.evaluate(async()=>{labAddMedalToSlot('フシギダネ');await labSaveMedalPreset(0);await labPresetStore.save();});
    eq((await page.locator('#medalPresetStatus').innerText()).includes('アカウントに保存済み'),true,width+': cloud success shown');
    await page.evaluate(async()=>{__presetMock.fail=true;await labPresetStore.edit(0,{name:'端末で編集中',slots:['ポッポ'],rarities:['silver']});await _savePresetsToSupabase();});
    eq((await page.locator('#medalPresetStatus').innerText()).includes('通信できませんでした'),true,width+': resolved database error shown');
    eq(await page.locator('#medalPresetRetry').isVisible(),true,width+': retry action visible');
    await page.evaluate(()=>{__presetMock.fail=false;});await page.locator('#medalPresetRetry').click();
    await page.waitForFunction(()=>labPresetStore.snapshot().status==='synced');
    eq(await page.evaluate(()=>__presetMock.row.data[0].name),'端末で編集中',width+': retry writes local content');
    eq(await page.evaluate(()=>__presetMock.filters.some(([k])=>k==='updated_at')),true,width+': update uses revision guard');
    await page.evaluate(async()=>{
      await labPresetStore.edit(0,{name:'この端末',slots:['フシギダネ'],rarities:['gold']});
      __presetMock.loseRace=true;await _savePresetsToSupabase();
    });
    eq(await page.locator('#medalPresetConflicts fieldset').count(),1,width+': racing save preserves both versions');
    eq((await page.locator('#medalPresetConflicts').innerText()).includes('この端末'),true,width+': local choice shown');
    eq((await page.locator('#medalPresetConflicts').innerText()).includes('別端末'),true,width+': remote choice shown');
    for(const theme of ['dark','light']){
      await page.evaluate(t=>document.documentElement.classList.toggle('light-mode',t==='light'),theme);
      await page.locator('#medalPresetSync').scrollIntoViewIfNeeded();
      eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,width+': '+theme+' no horizontal overflow');
      const metrics=await page.locator('#medalPresetSync').evaluate(el=>{
        const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
        const lum=s=>rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
        const status=el.querySelector('p'),fg=lum(getComputedStyle(status).color);let bg=el;
        while(bg&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;
        const b=lum(getComputedStyle(bg).backgroundColor);
        return {contrast:(Math.max(fg,b)+.05)/(Math.min(fg,b)+.05),buttons:[...el.querySelectorAll('button')].filter(b=>!b.hidden).map(b=>b.getBoundingClientRect().height)};
      });
      eq(metrics.contrast>=4.5,true,width+': '+theme+' text contrast >=4.5');eq(metrics.buttons.every(h=>h>=44),true,width+': '+theme+' touch targets >=44');
      await page.screenshot({path:path.join(OUT,`preset-conflict-${width}-${theme}.png`),fullPage:false});
    }
    const choose=page.getByRole('button',{name:'この内容を残す',exact:true});await choose.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>labPresetStore.snapshot().conflicts.length===0);
    eq(await page.evaluate(()=>labMedalPresets[0].name),'別端末',width+': keyboard resolves conflict');
    await page.evaluate(async()=>{labSessionOwner='fixture-B';__presetMock.owner='fixture-B';await labPresetSelectOwner('fixture-B');});
    eq(await page.evaluate(()=>labMedalPresets.some(Boolean)),false,width+': account switch clears prior account presets');
    eq(await page.evaluate(()=>labMedalSlots.some(Boolean)),false,width+': account switch clears editor');
    eq(errors,[],width+': no page errors');await context.close();
  }
  eq(externalWrites,0,'external writes');
  fs.writeFileSync(path.join(OUT,'preset-browser-verification.json'),JSON.stringify({passed:true,checks,externalWrites,widths:[390,1100],themes:['dark','light'],engine:'Microsoft Edge',physicalDeviceTested:false},null,2));
  console.log(`ALL PASS — ${checks} preset sync browser checks; real DB writes: ${externalWrites}`);
}catch(e){console.error(e.stack);process.exitCode=1;}finally{if(browser)await browser.close();server.close();}})();
