// 名前付き保存は利用者ごとのブラウザー内だけ。共有リンクは入力条件のみ。
const CalcConditions=(()=>{
  const el=id=>document.getElementById(id),esc=escapeHtml,clone=CalcConditionCodec.clone;
  let pending=null,saveOwner=null,cachedVersion=null,previewSerial=0;
  const owner=()=>isGuest()?'guest':labSessionOwner&&labSessionOwner!=='guest'?labSessionOwner:null;
  const key=()=>owner()?'unite_calc_conditions_v1_'+encodeURIComponent(owner()):null;
  function version(){return cachedVersion||(cachedVersion=CalcConditionCodec.fingerprint([LAB_STATUS,LAB_SKILLS,LAB_ITEMS,LAB_MEDALS,LAB_TEMP_ITEM_EFFECTS,LAB_PROC_ITEM_EFFECTS]));}
  function side(prefix){
    if(prefix==='dcAtk')return LabReview.captureEquipment();
    return {items:labReadItems(prefix),activeEffects:labReadEffects(prefix),goalCount:0,koStack:0,dmgStack:0,healTarget:'self',proc:Object.fromEntries(['TargetPct','SelfPct','HPDamage'].map(k=>[k,labProcInput(prefix,k)]))};
  }
  function capture(){
    for(const prefix of ['dcAtk','dcDef'])for(const k of ['TargetPct','SelfPct','HPDamage']){const input=el(prefix+'Proc'+k);if(input&&input.value!==''&&!input.validity.valid)throw Error('追加効果の数値を、入力欄の範囲内で指定してください。');}
    if(!el('dcAtkPoke').value||!el('dcDefPoke').value)throw Error('「条件を編集」で攻撃側と相手を選択してください。');
    const state=LabReview.exportState(),value=el('dcAtkMedal').value;
    const medal=value==='record'?state.medal:value!==''?_presetToObj(labMedalPresets[Number(value)]):null;
    return CalcConditionCodec.sanitize({schema:1,dataVersion:version(),attacker:el('dcAtkPoke').value,defender:el('dcDefPoke').value,attackLevel:Number(el('dcAtkLv').value),defendLevel:Number(el('dcDefLv').value),skills:[1,2].map(i=>({name:el('dcSkill'+i+'Sel').value,upgrade:el('dcSkill'+i+'Upg').value})),medal:medal?{slots:medal.slots,rarities:medal.rarities}:null,attack:side('dcAtk'),defense:side('dcDef'),baseline:state.baseline});
  }
  function supported(c){
    const errors=[];
    for(const name of [c.attacker,c.defender])if(!Object.hasOwn(LAB_STATUS,name))errors.push(name+'：計算データ未収録');
    for(const e of [c.attack,c.defense,c.baseline].filter(Boolean)){
      for(const i of e.items)if(i.name&&!Object.hasOwn(LAB_ITEMS,i.name))errors.push(i.name+'：計算未対応');
      for(const n of e.activeEffects)if(!e.items.some(i=>i.name===n)||(!Object.hasOwn(LAB_TEMP_ITEM_EFFECTS,n)&&!Object.hasOwn(LAB_PROC_ITEM_EFFECTS,n)))errors.push(n+'：発動条件未対応');
    }
    c.skills.forEach((s,i)=>{
      const rows=(Object.hasOwn(LAB_SKILLS,c.attacker)?LAB_SKILLS[c.attacker]:[]).filter(r=>r.slot==='わざ'+(i+1)&&r.name===s.name&&(r.coeff!=null||r.description));
      const upgrades=[...new Set(rows.map(r=>String(r.upg||'')))];
      if(s.name&&(!rows.length||(upgrades.length>1?!upgrades.includes(s.upgrade):s.upgrade!=='')))errors.push(s.name+'：わざ・強化段階未対応');
      if(!s.name&&s.upgrade)errors.push('未選択のわざに強化段階があります。');
    });
    for(const n of c.medal?.slots||[])if(n&&!LAB_MEDALS.some(m=>m.name===n))errors.push(n+'：メダル未対応');
    return [...new Set(errors)];
  }
  function summary(c){
    const items=e=>e.items.filter(i=>i.name).map(i=>i.name+' G'+i.grade).join('・')||'もちものなし';
    const changes=c.baseline?c.attack.items.map((item,i)=>{const a=c.baseline.items[i];return item.name!==a.name||item.grade!==a.grade?(a.name?a.name+' G'+a.grade:'なし')+' → '+(item.name?item.name+' G'+item.grade:'なし'):'';}).filter(Boolean).join(' ／ ')||'もちものは同じ（発動条件などを比較）':'比較Aなし';
    return `<p class="lc-main">${esc(c.attacker)} Lv${c.attackLevel} → ${esc(c.defender)} Lv${c.defendLevel}</p><p class="lr-caption">${c.skills.map(s=>esc(s.name||'わざ：未選択')+(s.upgrade?'＋':'')).join(' ＋ ')}<br>${esc(changes)}</p><details class="lr-caption"><summary>条件の詳細</summary><p>攻撃側：${esc(items(c.attack))}<br>相手：${esc(items(c.defense))}${c.baseline?'<br>A：'+esc(items(c.baseline)):''}</p><p>メダル：${esc(c.medal?.slots.filter(Boolean).join('・')||'なし')}</p>${[c.baseline?['A',c.baseline]:null,['攻撃側／B',c.attack],['相手',c.defense]].filter(Boolean).map(([label,e])=>`<p>${label}の発動：${esc(e.activeEffects.join('・')||'OFF')}<br>ゴール${e.goalCount}回・KO${e.koStack}・被ダメージ${e.dmgStack}スタック ／ 回復対象：${e.healTarget==='ally'?'味方':'自分'}<br>相手HP ${e.proc.TargetPct??'未指定'}％・自分HP ${e.proc.SelfPct??'未指定'}％・通常攻撃のHPダメージ ${e.proc.HPDamage??'未指定'}</p>`).join('')}</details>`;
  }
  function updateSummary(){
    if(!el('lcCurrent'))return;
    try{el('lcCurrent').innerHTML=summary(capture());}catch{el('lcCurrent').innerHTML='<p class="lr-caption">「条件を編集」から攻撃側と相手を選択してください。</p>';}
  }
  function read(){
    const k=key();if(!k)return [];
    let value;try{value=JSON.parse(localStorage.getItem(k)||'[]');}catch{throw Error('保存一覧を読み込めませんでした。保存内容は変更していません。');}
    if(!Array.isArray(value)||value.length>200||!value.every(r=>r&&typeof r.id==='string'&&typeof r.name==='string'&&r.name.length<=70&&typeof r.note==='string'&&r.note.length<=500&&typeof r.created==='string'))throw Error('保存一覧を読み込めませんでした。保存内容は書き換えていません。');
    return value;
  }
  function renderSaved(){
    const list=el('lcSavedList');if(!list)return;
    try{
      const saved=read(),q=el('lcSearch').value.trim();
      el('lcSavedCount').textContent=saved.length+'件';
      list.innerHTML=saved.filter(r=>[r.name,r.condition?.attacker,r.condition?.defender].some(v=>String(v||'').includes(q))).map(r=>{
        let content;try{content=summary(CalcConditionCodec.sanitize(r.condition));}catch{content='<p class="lr-warning">この条件は未対応・破損しています。読み込むことはできません。</p>';}
        return `<article class="lr-build"><strong>${esc(r.name)}</strong>${content}${r.note?'<details class="lr-caption"><summary>自分用メモ</summary><p>'+esc(r.note)+'</p></details>':''}<div class="lr-actions"><button class="lr-button lr-primary" data-condition="${esc(r.id)}" data-action="load">読み込む</button><button class="lr-button" data-condition="${esc(r.id)}" data-action="share">共有</button><button class="lr-button" data-condition="${esc(r.id)}" data-action="delete">削除</button></div></article>`;
      }).join('')||'<p class="lr-caption">保存した条件はありません。</p>';
    }catch(e){list.textContent=e.message;}
  }
  function write(list){const k=key();if(!k)throw Error('ログインまたはゲスト利用を開始してください。');localStorage.setItem(k,JSON.stringify(list));renderSaved();}
  function error(e){showToast(e.message||'条件を処理できませんでした。','warn');}
  function openSave(){try{capture();saveOwner=owner();el('lcName').value=el('dcAtkPoke').value+'／'+el('dcDefPoke').value;el('lcNote').value='';el('lcSaveDialog').showModal();}catch(e){error(e);}}
  function save(event){
    event.preventDefault();try{
      if(owner()!==saveOwner)throw Error('利用者が変わりました。保存画面を開き直してください。');
      const name=el('lcName').value.trim();if(!name||name.length>70)throw Error('保存名を入力してください。');
      const saved=read();if(saved.length>=200)throw Error('保存できる条件は200件までです。不要な条件を削除してください。');
      write([{id:crypto.randomUUID(),name,note:el('lcNote').value.trim().slice(0,500),created:new Date().toISOString(),condition:capture()},...saved]);el('lcSaveDialog').close();showToast('このブラウザーに計算条件を保存しました。','success');
    }catch(e){error(e);}
  }
  function share(c){
    try{const clean=CalcConditionCodec.sanitize(c),url=new URL(location.pathname,location.origin);url.hash='conditions='+CalcConditionCodec.encode(clean);el('lcShareSummary').innerHTML=summary(clean);el('lcShareUrl').value=url.href;el('lcShareDialog').showModal();}catch(e){error(e);}
  }
  async function preview(c){
    const clean=CalcConditionCodec.sanitize(c),serial=++previewSerial,scope=owner();try{await whenLibReady('lab');}catch{throw Error('計算データを読み込めませんでした。再読み込みしてください。');}
    if(serial!==previewSerial||scope!==owner())return;
    pending=clean;const errors=supported(clean);
    el('lcImportSummary').innerHTML=summary(clean)+(clean.dataVersion!==version()?'<p class="lr-warning">保存時から計算データが変わっています。現在のデータで再計算します。過去の計算式の再現ではありません。</p>':'')+(errors.length?'<p class="lr-warning">'+errors.map(esc).join('<br>')+'</p>':'');
    el('lcApply').disabled=!!errors.length;el('lcImportDialog').showModal();
  }
  function setValue(id,v){const n=el(id);if(n)n.value=v??'';}
  function restoreSide(prefix,e){
    e.items.forEach((i,j)=>{setValue(prefix+'Item'+(j+1),i.name);setValue(prefix+'Grade'+(j+1),i.grade);el(prefix+'GLbl'+(j+1)).textContent='G'+i.grade;});
    labRefreshItemEffects(prefix);
    el(prefix+'Effects').querySelectorAll('input[type="checkbox"]').forEach(n=>n.checked=e.activeEffects.includes(n.value));labRefreshItemEffects(prefix);
    setValue(prefix+'HealTarget',e.healTarget);
    for(const [k,v] of Object.entries(e.proc))setValue(prefix+'Proc'+k,v);
  }
  async function apply(c){
    c=CalcConditionCodec.sanitize(c);const unsupported=supported(c);if(unsupported.length)throw Error(unsupported.join('、'));
    if(!owner())loginAsGuest();
    const session=owner();if(!await LabReview.readyLab('dmg')||owner()!==session)return;
    LabReview.resetCalculator();LabReview.restoreState({medal:c.medal?{label:'保存した計算条件のメダル',...c.medal}:null,baseline:c.baseline?{pokemon:c.attacker,...c.baseline}:null});
    setValue('dcAtkPoke',c.attacker);setValue('dcDefPoke',c.defender);
    for(const [prefix,level] of [['dcAtk',c.attackLevel],['dcDef',c.defendLevel]]){setValue(prefix+'Lv',level);el(prefix+'LvLabel').textContent=level;}
    restoreSide('dcAtk',c.attack);restoreSide('dcDef',c.defense);dcUpdateSpecialRows();
    for(const [id,label,key,suffix] of [['dcGoalSlider','dcGoalLabel','goalCount','ゴール'],['dcStackSlider','dcStackLabel','koStack','スタック'],['dcDmgStackSlider','dcDmgStackLabel','dmgStack','スタック']]){setValue(id,c.attack[key]);el(label).textContent=c.attack[key]+suffix;}
    dcRefreshMedalSelect();setValue('dcAtkMedal',c.medal?'record':'');
    dcCurAtkPoke=c.attacker;dcUpdateSkillSelects(c.attacker);
    c.skills.forEach((s,i)=>{setValue('dcSkill'+(i+1)+'Sel',s.name);dcSkillChanged(i+1);setValue('dcSkill'+(i+1)+'Upg',s.upgrade);});
    calcDmgCalcMain(false);updateSummary();renderSaved();el('lcEditor').open=false;
    el('lcVersionNote').textContent=c.dataVersion!==version()?'保存時から計算データが変わっています。現在のデータで再計算しています。':'';
  }
  async function importPending(){try{if(!pending)return;const c=pending;await apply(c);pending=null;el('lcImportDialog').close();history.replaceState(null,'',location.pathname+location.search);showToast('計算条件を読み込みました。','success');}catch(e){error(e);}}
  async function handleShared(){if(!location.hash.startsWith('#conditions='))return;try{await preview(CalcConditionCodec.decode(location.hash.slice(12)));}catch{error(Error('共有リンクを読み込めませんでした。'));}}
  function sessionChanged(){saveOwner=null;pending=null;previewSerial++;for(const id of ['lcSaveDialog','lcShareDialog','lcImportDialog'])if(el(id)?.open)el(id).close();for(const id of ['lcShareUrl','lcName','lcNote'])if(el(id))el(id).value='';if(el('lcVersionNote'))el('lcVersionNote').textContent='';queueMicrotask(()=>{renderSaved();updateSummary();handleShared();});}
  function mount(){
    const panel=el('labDmgCalcPanel'),editor=document.createElement('details');editor.id='lcEditor';editor.className='card lc-editor';editor.innerHTML='<summary>条件を編集</summary>';
    for(const n of [...panel.children])if(!['lrRecordNotice','lrCalcStatus','lrComparison','dcResultCard'].includes(n.id))editor.appendChild(n);
    panel.insertBefore(editor,el('lrComparison'));
    const library=document.createElement('section');library.id='lcLibrary';library.className='card';library.innerHTML='<div class="lr-source-top"><h2 class="lr-section-title">計算条件の保存・共有</h2><button class="lr-button" id="lcEdit">条件を編集</button></div><div id="lcCurrent"></div><p id="lcVersionNote" class="lr-warning"></p><div class="lr-actions"><button class="lr-button lr-primary" id="lcSave">この条件を保存</button><button class="lr-button" id="lcShare">共有</button></div><details class="lc-library-list" open><summary>保存一覧 <span id="lcSavedCount"></span></summary><label for="lcSearch">名前・ポケモンで検索</label><input class="lab-select" id="lcSearch" type="search"><div id="lcSavedList"></div></details><p class="lr-caption">保存先はこのブラウザーです。ゲストとアカウントごとに保存一覧を分けます。端末をまたぐ同期はありません。共有するのは計算条件だけで、対戦記録・アカウント・保存名・メモは含めません。</p>';
    panel.prepend(library);
    const dialogs=document.createElement('div');dialogs.innerHTML=`<dialog class="lc-dialog" id="lcSaveDialog"><form id="lcSaveForm"><h2>計算条件を保存</h2><label>名前<input class="lab-select" id="lcName" maxlength="70" required></label><label>自分用のメモ<textarea class="lab-select" id="lcNote" maxlength="500"></textarea></label><p class="lr-caption">現在の条件を新しい保存として追加します。メダルは保存時の中身を保持します。</p><div class="lr-actions"><button class="lr-button lr-primary" type="submit">保存する</button><button class="lr-button" type="button" data-close="lcSaveDialog">キャンセル</button></div></form></dialog><dialog class="lc-dialog" id="lcShareDialog"><h2>計算条件を共有</h2><div id="lcShareSummary"></div><label>共有リンク<textarea class="lab-select" id="lcShareUrl" readonly rows="4"></textarea></label><p class="lr-caption">保存名・メモ・メダルセットの名前・対戦記録・アカウント情報は含めません。</p><div class="lr-actions"><button class="lr-button lr-primary" id="lcCopy">リンクをコピー</button><button class="lr-button" data-close="lcShareDialog">閉じる</button></div></dialog><dialog class="lc-dialog" id="lcImportDialog"><h2>読み込む計算条件</h2><div id="lcImportSummary"></div><p class="lr-caption">内容を確認して読み込むと、現在の計算条件を置き換えます。保存一覧には自動追加しません。未ログインの場合はゲストとして開きます。</p><div class="lr-actions"><button class="lr-button lr-primary" id="lcApply">この条件を読み込む</button><button class="lr-button" data-close="lcImportDialog">キャンセル</button></div></dialog>`;document.body.append(dialogs);
    el('lcSave').onclick=openSave;el('lcSaveForm').onsubmit=save;el('lcEdit').onclick=()=>{editor.open=true;editor.scrollIntoView({behavior:'smooth'});};el('lcShare').onclick=()=>{try{share(capture());}catch(e){error(e);}};
    el('lcCopy').onclick=async()=>{try{await navigator.clipboard.writeText(el('lcShareUrl').value);showToast('共有リンクをコピーしました。','success');}catch{el('lcShareUrl').select();showToast('リンクを選択しました。コピーしてください。','warn');}};
    el('lcSearch').oninput=renderSaved;el('lcApply').onclick=importPending;
    dialogs.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>el(b.dataset.close).close());
    el('lcSavedList').onclick=async event=>{const b=event.target.closest('[data-condition]');if(!b)return;try{const rows=read(),r=rows.find(x=>x.id===b.dataset.condition);if(!r)return;if(b.dataset.action==='delete'){if(!confirm('「'+r.name+'」を保存一覧から削除しますか？'))return;write(rows.filter(x=>x.id!==r.id));}else if(b.dataset.action==='share')share(r.condition);else await preview(r.condition);}catch(e){error(e);}};
    for(const type of ['input','change'])panel.addEventListener(type,()=>queueMicrotask(updateSummary));
    window.addEventListener('hashchange',handleShared);window.addEventListener('storage',e=>{if(e.key===key())renderSaved();});
    updateSummary();renderSaved();handleShared();
  }
  mount();return {capture,apply,preview,share,version,sessionChanged,updateSummary,renderSaved};
})();
