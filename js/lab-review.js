// 記録→ラボ・ポケモン別の入口・もちもの比較。元の対戦記録とプリセットへは書き込まない。
const LabReview=(()=>{
  const clone=v=>JSON.parse(JSON.stringify(v));
  const el=id=>document.getElementById(id);
  const esc=v=>escapeHtml(String(v??''));
  const number=v=>Number(v).toLocaleString('ja-JP',{maximumFractionDigits:2});
  let recordedMedal=null,returnTo=null,baseline=null,hubTab='overview',groups=[];
  let opening=0;
  const supported=p=>typeof LAB_STATUS!=='undefined'&&!!LAB_STATUS[p];
  const button=(text,handler,attrs='',primary=false)=>`<button class="lr-button ${primary?'lr-primary':''}" onclick="${handler}" ${attrs}>${text}</button>`;
  const modeLabel=()=>({all:'全モード',solo:'ソロ',duo:'デュオ／トリオ',full:'フルパ'})[detailMode]||'全モード';
  function allRecords(){return [...battles,...allSeriesData.flatMap(s=>s.battles||[])];}
  function clearHub(){
    ['pokeHubHeader','pokeHubBuilds','pokeHubData'].forEach(id=>{if(el(id))el(id).innerHTML='';});
    if(el('pokeDetailContent'))el('pokeDetailContent').hidden=false;
  }
  function clearSession(){
    opening++;returnTo=null;groups=[];hubTab='overview';
    if(el('lrRecordNotice')){el('lrRecordNotice').hidden=true;el('lrRecordNotice').innerHTML='';}
    if(el('lrComparison'))resetCalculator();
    clearHub();
    if(el('detailPokeSelect'))el('detailPokeSelect').value='';
    if(el('pokeDetailContent'))el('pokeDetailContent').innerHTML='<div class="empty">ポケモンを選択してください</div>';
    allSeriesData=[];analysisLoaded=false;analysisNeedsRefresh=true;
  }
  function setHubTab(tab){
    hubTab=tab;
    [['pokeDetailContent','overview'],['pokeHubBuilds','builds'],['pokeHubData','data']].forEach(([id,key])=>{if(el(id))el(id).hidden=key!==tab;});
    document.querySelectorAll('[data-hub-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.hubTab===tab);b.setAttribute('aria-pressed',String(b.dataset.hubTab===tab));});
  }
  function groupBuilds(records){
    const map=new Map();
    for(const record of records){
      const items=(record.items||'').split(',').filter(Boolean).sort((a,b)=>a.localeCompare(b,'ja'));
      const key=JSON.stringify([record.pokemon,record.skill1||null,record.skill2||null,items,record.battle_item||null,medalSetKey(record.medal_set)||null]);
      let g=map.get(key);
      if(!g){g={record:clone(record),count:0,wins:0};map.set(key,g);}
      g.count++;if(record.result==='win')g.wins++;
      if(new Date(record.created_at)>new Date(g.record.created_at))g.record=clone(record);
    }
    return [...map.values()].sort((a,b)=>b.count-a.count||new Date(b.record.created_at)-new Date(a.record.created_at));
  }
  function renderHub(pokemon,records){
    if(!el('pokeHubHeader'))return;
    groups=groupBuilds(records);
    const role=Object.values(POKEMON_DATA).find(x=>x.pokemon.includes(pokemon))?.label||'';
    el('pokeHubHeader').innerHTML=`<div class="lr-hub-title"><img src="${esc(getIconUrl(pokemon)||'')}" alt="" width="64" height="64"><div><strong>${esc(pokemon)}</strong><p>${esc(role)} · ${records.length}試合の記録</p></div></div>
      <p class="lr-caption">集計対象：全シリーズ ／ ${esc(modeLabel())}。BOT戦は分析画面の設定に従います。</p>
      <div class="lr-tabs" aria-label="ポケモン別の表示">${[['overview','成績'],['builds','使用構成'],['data','データ・計算']].map(([key,label])=>button(label,`LabReview.setHubTab('${key}')`,`data-hub-tab="${key}"`)).join('')}</div>`;
    const buildBox=el('pokeHubBuilds');
    buildBox.innerHTML=`<p class="lr-caption">わざ・もちもの・バトルアイテム・メダルの中身が同じ記録を集計しています。回数順で表示し、未記録の項目は区別します。</p>`+
      (groups.length?groups.map((g,i)=>{
        const r=g.record,ms=parseMedalSet(r.medal_set),items=(r.items||'').split(',').filter(Boolean);
        return `<article class="lr-build"><div class="lr-build-heading"><strong>構成 ${i+1}</strong><span class="lr-sample">${g.count}試合</span></div>
          <div class="lr-build-stats"><b>${g.wins}勝 ${g.count-g.wins}敗</b><strong>${(100*g.wins/g.count).toFixed(1)}<small>％</small></strong><span>勝率${g.count<10?'（少数の記録）':''}</span></div>
          <p class="lr-build-skills">${esc(r.skill1||'わざ1：未記録')} ＋ ${esc(r.skill2||'わざ2：未記録')}</p>
          <div class="lr-item-chips">${items.map(n=>`<span><img src="${esc(getItemImgSrc(n))}" alt="" width="24" height="24">${esc(n)}</span>`).join('')||'<span>もちもの：未記録</span>'}</div>
          <p class="lr-caption">バトルアイテム：${esc(r.battle_item||'未記録')}<br>メダル：${esc(ms?.label||'未記録')}</p>
          ${ms?`<details class="lr-caption"><summary>記録したメダルの中身</summary><p>${esc(medalSetDetail(ms))}</p></details>`:''}
          <div class="lr-actions">${button('この構成で計算',`LabReview.openGroup(${i})`,'',true)}</div></article>`;
      }).join(''):'<div class="empty">この条件の構成の記録がありません。データ・計算は利用できます。</div>');
    el('pokeHubData').innerHTML=`<p class="lr-caption">選択中の${esc(pokemon)}を引き継いで開きます。各画面には、収録済みのデータと対応範囲を表示します。</p>
      <div class="lr-tool-grid">${[['ratio','レシオ一覧','わざ・特性の計算式や条件を確認'],['calc','ステータス計算','レベル・もちもの・メダルを指定'],['dmg','ダメージ計算','相手を指定してダメージや構成を比較']].map(([key,label,desc])=>`<button class="lr-tool" data-pokemon="${esc(pokemon)}" onclick="LabReview.openPokemonTool(this.dataset.pokemon,'${key}')"><strong>${label} <span aria-hidden="true">↗</span></strong><span>${desc}</span></button>`).join('')}</div>
      ${!supported(pokemon)?'<p class="lr-caption">計算用データが未収録の場合は、移動先で対応状況を案内します。</p>':''}`;
    setHubTab(hubTab);
  }
  async function openHub(pokemon){
    const token=++opening;
    showPage('analysis');const nav=navId;
    try{await whenLibReady('chart');}catch{return;}
    if(token!==opening||navId!==nav)return;
    await loadAnalysis();if(token!==opening||navId!==nav)return;
    switchAnalysis('pokedetail');initPokeDetailSelect();
    const sel=el('detailPokeSelect');
    if(![...sel.options].some(o=>o.value===pokemon))sel.add(new Option(pokemon,pokemon));
    sel.value=pokemon;hubTab='overview';renderPokeDetail();
  }
  function captureReturn(){
    return {page:el('analysisPage').style.display!=='none'?'analysis':'tracker',scroll:window.scrollY,pokemon:el('detailPokeSelect')?.value,hubTab,detailMode,historyPage};
  }
  async function back(){
    const dest=returnTo;if(!dest)return;
    if(dest.page==='analysis'){
      await openHub(dest.pokemon);switchDetailMode(dest.detailMode);setHubTab(dest.hubTab);
    }else{showPage('tracker');historyPage=dest.historyPage;renderHistory();}
    requestAnimationFrame(()=>window.scrollTo({top:dest.scroll,behavior:'instant'}));
  }
  async function readyLab(tab){
    const token=++opening;
    showPage('lab');const nav=navId;
    try{await whenLibReady('lab');}catch{notice('計算データを読み込めませんでした。再読み込みしてお試しください。');return false;}
    if(token!==opening||navId!==nav)return false;
    loadLabData();switchLab(tab);return true;
  }
  function setValue(id,value){const node=el(id);if(node)node.value=value;}
  function resetCalculator(){
    baseline=null;recordedMedal=null;
    ['dcAtk','dcDef'].forEach(prefix=>{
      setValue(prefix+'Poke','');setValue(prefix+'Lv',9);if(el(prefix+'LvLabel'))el(prefix+'LvLabel').textContent='9';
      [1,2,3].forEach(i=>{setValue(prefix+'Item'+i,'');setValue(prefix+'Grade'+i,30);if(el(prefix+'GradeLabel'+i))el(prefix+'GradeLabel'+i).textContent='G30';});
      if(el(prefix+'Effects'))el(prefix+'Effects').remove();
    });
    ['dcGoalSlider','dcStackSlider','dcDmgStackSlider'].forEach(id=>setValue(id,0));
    dcRefreshMedalSelect();setValue('dcAtkMedal','');dcCurAtkPoke=null;dcAtkStats=null;dcDefStats=null;
    el('dcResultCard').style.display='none';dcUpdateSpecialRows();
    el('lrComparisonOutput').innerHTML='';el('lrCalcStatus').textContent='';el('lrComparisonLabel').textContent='Aは未設定';
    el('lrClearA').hidden=true;
  }
  function notice(message){el('lrCalcStatus').textContent=message;}
  function selectRecordedSkill(pokemon,slot,name){
    const select=el('dcSkill'+slot+'Sel');
    const found=[...select.options].find(o=>o.value===name);
    select.value=found?found.value:'';
    dcSkillChanged(slot);
    return !name||!!found;
  }
  async function openLoadout(record,source){
    const origin=captureReturn();
    if(!await readyLab('dmg'))return;
    returnTo=origin;resetCalculator();
    const r=clone(record),warnings=[];
    setValue('dcAtkPoke',r.pokemon||'');
    if(!supported(r.pokemon))warnings.push(`${r.pokemon||'このポケモン'}の計算用データは未収録です。対応済みのポケモンを選択すると計算できます。`);
    const items=(r.items||'').split(',').filter(Boolean);
    [1,2,3].forEach(i=>{
      const n=items[i-1]||'',select=el('dcAtkItem'+i);
      if(n&&![...select.options].some(o=>o.value===n))select.add(new Option(n+'（計算未対応）',n));
      select.value=n;
    });
    recordedMedal=parseMedalSet(r.medal_set);if(recordedMedal)recordedMedal=clone(recordedMedal);
    dcRefreshMedalSelect();setValue('dcAtkMedal',recordedMedal?'record':'');
    if(supported(r.pokemon)){
      dcCurAtkPoke=r.pokemon;dcUpdateSkillSelects(r.pokemon);
      [1,2].forEach(slot=>{if(!selectRecordedSkill(r.pokemon,slot,r['skill'+slot]))warnings.push(`記録の「${r['skill'+slot]}」はラボの候補と一致しません。わざ${slot}を選び直してください。`);});
    }
    dcUpdateSpecialRows();labRefreshItemEffects('dcAtk');labRefreshItemEffects('dcDef');
    el('lrRecordNotice').hidden=false;
    el('lrRecordNotice').innerHTML=`<div class="lr-source-top"><strong>${esc(source)}</strong>${button(origin.page==='analysis'?'ポケモン詳細に戻る':'履歴に戻る','LabReview.back()')}</div>
      <p>わざ・もちものと、記録がある場合は試合時点のメダルを読み込みました。</p>
      <div class="lr-import-meta"><span>レベル：初期値 Lv9</span><span>もちもの：仮設定 G30</span><span>相手：記録なし</span></div>
      <p class="lr-caption">レベル・G・相手・発動条件は記録にありません。今回の計算条件を指定してください。わざの＋段階も選択できます。元の対戦記録は変更されません。</p>
      <p class="lr-caption">ラボに収録している計算データを使用します。試合当時のバージョンを再現する機能ではありません。</p>
      <p class="lr-caption">バトルアイテム：${esc(r.battle_item||'未記録')}（参照表示のみ）<br>メダル：${esc(recordedMedal?.label||'未記録（計算では補正なしの仮条件）')}${recordedMedal?'／試合時点の中身を使用':''}<br>もちもの：${items.length}個の記録。空欄は計算では補正なしの仮条件です。</p>
      ${warnings.length?`<p class="lr-warning">${warnings.map(esc).join('<br>')}</p>`:''}`;
  }
  async function openRecord(id){
    const record=allRecords().find(r=>String(r.id)===String(id));if(!record)return;
    const d=new Date(record.created_at);
    await openLoadout(record,`${d.toLocaleDateString('ja-JP')} の対戦記録から読み込み`);
  }
  async function openGroup(index){const g=groups[index];if(g)await openLoadout(g.record,`構成 ${index+1} の記録から読み込み`);}
  async function openPokemonTool(pokemon,tab){
    if(tab==='dmg'){await openLoadout({pokemon},`${pokemon}の計算条件を設定`);return;}
    const origin=captureReturn();
    if(!await readyLab(tab))return;
    if(tab==='ratio'){ratioPokemon=pokemon;ratioRender();return;}
    const select=el('labPokeSelect');
    if(!supported(pokemon)){switchLab('dmg');resetCalculator();returnTo=origin;el('lrRecordNotice').hidden=false;el('lrRecordNotice').innerHTML=`<p>${esc(pokemon)}は計算用データが未収録です。</p>${button('ポケモン詳細に戻る','LabReview.back()')}`;return;}
    select.value=pokemon;labOnPokeChange();
  }
  function appendRecordedMedal(select,cur){
    if(recordedMedal)select.add(new Option('試合時点：'+(recordedMedal.label||'記録したメダル'),'record'));
    if(cur==='record'&&recordedMedal)select.value='record';
  }
  function recordMedalDeps(value){
    return value==='record'&&recordedMedal?{...LAB_STATS_DEPS,medalBonus:(_i,base)=>labCalcMedalBonus(null,base,recordedMedal)}:LAB_STATS_DEPS;
  }
  function canCalculate(){
    if(!el('lrCalcStatus'))return true;
    const unknown=['dcAtk','dcDef'].flatMap(p=>labReadItems(p)).filter(x=>x.name&&!LAB_ITEMS[x.name]);
    const invalidMedal=el('dcAtkMedal')?.value==='record'&&recordedMedal?.slots.filter(n=>n&&!LAB_MEDALS.some(m=>m.name===n));
    if(unknown.length||(invalidMedal&&invalidMedal.length)){
      el('dcResultCard').style.display='none';
      el('lrComparisonOutput').textContent='未対応のデータがあるため、条件を変更すると比較できます。';
      notice('計算未対応のデータがあります：'+[...unknown.map(x=>x.name),...(invalidMedal||[])].join('、')+'。対応済みの条件へ変更してください。');return false;
    }
    notice('');return true;
  }
  function captureEquipment(){
    return {items:clone(labReadItems('dcAtk')),activeEffects:labReadEffects('dcAtk'),goalCount:Number(el('dcGoalSlider').value),koStack:Number(el('dcStackSlider').value),dmgStack:Number(el('dcDmgStackSlider').value),healTarget:labHealTarget('dcAtk'),proc:Object.fromEntries(['TargetPct','SelfPct','HPDamage'].map(k=>[k,labProcInput('dcAtk',k)]))};
  }
  function equipmentSummary(config){
    return config.items.filter(x=>x.name).map(x=>`${x.name} G${x.grade}`).join(' ／ ')||'もちものなし';
  }
  function captureA(){
    if(!el('dcAtkPoke').value||!el('dcDefPoke').value){notice('攻撃側と防御側のポケモンを選択してからAを設定してください。');return;}
    if(!canCalculate())return;
    calcDmgCalcMain(false);
    if(!dcAtkStats||!dcDefStats)return;
    baseline={pokemon:el('dcAtkPoke').value,...captureEquipment()};renderComparison();
    el('lrComparison').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function clearA(){baseline=null;renderComparison();}
  function statsFor(config){
    const medal=el('dcAtkMedal').value;
    return computeStats({poke:el('dcAtkPoke').value,lv:Number(el('dcAtkLv').value),...config,medalPresetIdx:medal==='record'?0:medal!==''?Number(medal):null},recordMedalDeps(medal));
  }
  function componentRows(){
    const pokemon=el('dcAtkPoke').value,skills=LAB_SKILLS[pokemon]||[],rows=[];
    [1,2].forEach(slot=>{
      const name=el('dcSkill'+slot+'Sel').value,upg=el('dcSkill'+slot+'Upg').value;
      if(!name)return;
      let selected=labUpgradeRows(pokemon,name,upg).filter(r=>r.slot==='わざ'+slot);
      if(!selected.length)selected=skills.filter(r=>r.slot==='わざ'+slot&&r.name===name);
      rows.push(...selected);
    });
    return [...rows,...skills.filter(r=>['通常攻撃','特性','ユナイトわざ'].includes(r.slot))].filter(r=>r.coeff!=null);
  }
  function difference(a,b,unit=''){
    if(a==null||b==null)return '—';
    const diff=Math.round((b-a)*1e8)/1e8;
    const sign=diff>0?'＋':diff<0?'−':'±';
    return `${sign}${number(Math.abs(diff))}${unit}${a===0?(b===0?'':'（Aが0のため比率なし）'):` ／ ${diff>0?'＋':''}${(100*diff/Math.abs(a)).toFixed(1)}％`}`;
  }
  function compareRows(configA,configB){
    const a=statsFor(configA),b=statsFor(configB),lv=Number(el('dcAtkLv').value);
    const options=c=>({items:c.items,activeEffects:c.activeEffects,healTarget:c.healTarget,spdefPen:dcGetSpDefPenPct(c.items)});
    return {a,b,rows:componentRows().map(r=>({row:r,a:labEvaluateComponent(r,a,dcDefStats,lv,options(configA)),b:labEvaluateComponent(r,b,dcDefStats,lv,options(configB))}))};
  }
  function procFor(config,stats){
    return labItemProcValues({items:config.items,activeEffects:config.activeEffects,stats,lv:Number(el('dcAtkLv').value),targetStats:dcDefStats,targetHP:config.proc.TargetPct===null?null:dcDefStats.HP*config.proc.TargetPct/100,selfHP:config.proc.SelfPct===null?null:stats.HP*config.proc.SelfPct/100,hpDamage:config.proc.HPDamage});
  }
  function renderComparison(){
    if(!el('lrComparison'))return;
    if(baseline&&baseline.pokemon!==el('dcAtkPoke').value)baseline=null;
    const label=el('lrComparisonLabel'),output=el('lrComparisonOutput');
    label.textContent=baseline?'A：'+equipmentSummary(baseline):'Aは未設定';
    el('lrClearA').hidden=!baseline;
    if(!baseline){output.innerHTML='<p class="lr-caption">現在の構成をAに設定し、上の攻撃側のもちものを変更すると、変更後のBと比較できます。</p>';return;}
    if(!el('dcDefPoke').value||!dcAtkStats||!dcDefStats||!canCalculate()){output.innerHTML='<p class="lr-caption">攻撃側・防御側の条件を指定して計算してください。</p>';return;}
    const configB=captureEquipment(),result=compareRows(baseline,configB);
    const tableRows=result.rows.map(({row,a,b})=>`<tr><th scope="row">${esc(row.name&&row.name!==row.slot?row.slot+'：'+row.name:row.slot)}${row.upg?`<small>Lv${esc(row.upg)}の成分</small>`:''}<br>${labEffectLabelHtml(baseline.pokemon,row)}${a.hits>1?`<small>${row.hitsVar?'最大':''}${a.hits}ヒット合計</small>`:''}</th><td>${number(a.value)}${a.unit}</td><td>${number(b.value)}${b.unit}</td><td>${difference(a.value,b.value,a.unit)}</td></tr>`).join('');
    const pa=procFor(baseline,result.a),pb=procFor(configB,result.b),pnames=[...new Set([...pa,...pb].map(x=>x.name))];
    const procValue=r=>!r?'対象なし／OFF':r.message?esc(r.message):r.kind==='damage'?`${number(r.actual)}（${esc(r.damageType)}）`:`${number(r.value)}${r.ally!==undefined?` ／ 味方 ${number(r.ally)}`:''}`;
    output.innerHTML=`<p class="lr-caption">B：${esc(equipmentSummary(configB))}</p><p class="lr-common"><b>共通条件</b> ${esc(baseline.pokemon)} Lv${el('dcAtkLv').value} → ${esc(el('dcDefPoke').value)} Lv${el('dcDefLv').value}<br>メダル・相手・選択わざは共通。変更するとA・Bの両方を再計算します。</p>
      <details class="lr-caption"><summary>A・Bの発動条件を確認</summary><p>A：${esc(baseline.activeEffects.join('、')||'効果OFF')} ／ ゴール${baseline.goalCount}回・KO${baseline.koStack}・被ダメージ${baseline.dmgStack}スタック<br>B：${esc(configB.activeEffects.join('、')||'効果OFF')} ／ ゴール${configB.goalCount}回・KO${configB.koStack}・被ダメージ${configB.dmgStack}スタック</p></details>
      <h3 class="lr-section-title">わざ・通常攻撃などの成分別比較</h3><div class="lr-table-scroll"><table class="lr-table"><thead><tr><th>計算する成分</th><th>A</th><th>B</th><th>B − A</th></tr></thead><tbody>${tableRows||'<tr><td colspan="4">わざを選択してください。</td></tr>'}</tbody></table></div>
      <details class="lr-caption lr-stat-details"><summary>ステータスの差も見る</summary><div class="lr-table-scroll"><table class="lr-table"><thead><tr><th>能力</th><th>A</th><th>B</th><th>B − A</th></tr></thead><tbody>${['HP','攻撃','特攻','防御','特防','急所率','通常攻撃の速さ'].filter(k=>k in result.a||k in result.b).map(k=>`<tr><th>${k}</th><td>${number(result.a[k]||0)}</td><td>${number(result.b[k]||0)}</td><td>${difference(result.a[k]||0,result.b[k]||0)}</td></tr>`).join('')}</tbody></table></div></details>
      ${pnames.length?`<h3 class="lr-section-title">もちもの自身の発動1回分（わざとは別）</h3><div class="lr-table-scroll"><table class="lr-table lr-proc-table"><thead><tr><th>効果</th><th>A</th><th>B</th></tr></thead><tbody>${pnames.map(n=>`<tr><th>${esc(n)}<small>${esc(LAB_PROC_ITEM_EFFECTS[n].label)}</small></th><td>${procValue(pa.find(x=>x.name===n))}</td><td>${procValue(pb.find(x=>x.name===n))}</td></tr>`).join('')}</tbody></table></div>`:''}
      <p class="lr-caption lr-limit">同時に使えない条件や強化前後も個別に表示します。成分同士を足したコンボ合計ではありません。急所の発生確率・攻撃間隔・待ち時間を含む総合的な強さは判定しません。追加ダメージ・回復・シールドは、わざに自動加算しません。全効果を再現するものではありません。</p>`;
  }
  function mount(){
    const panel=el('labDmgCalcPanel');if(!panel)return;
    const source=document.createElement('div');source.id='lrRecordNotice';source.className='card lr-source';source.hidden=true;panel.prepend(source);
    const status=document.createElement('p');status.id='lrCalcStatus';status.className='lr-warning';status.setAttribute('role','status');panel.prepend(status);
    const compare=document.createElement('section');compare.id='lrComparison';compare.className='card lr-comparison';
    compare.innerHTML=`<div class="lr-source-top"><div><div class="lr-eyebrow">同じ相手・同じレベルで検討</div><h2 class="lr-section-title">もちもの2構成比較</h2></div>${button('現在の構成をAにする','LabReview.captureA()','',true)}</div><p class="lr-caption">Bは上の「攻撃側」の設定です。Aを設定してから、もちもの・G・発動条件を変えて比べます。</p><p id="lrComparisonLabel" class="lr-baseline">Aは未設定</p><button id="lrClearA" class="lr-button" onclick="LabReview.clearA()" hidden>Aを解除</button><div id="lrComparisonOutput" aria-live="polite"></div>`;
    el('dcResultCard').before(compare);renderComparison();
  }
  mount();
  return {clearHub,clearSession,setHubTab,renderHub,groupBuilds,openHub,openGroup,openRecord,openPokemonTool,back,appendRecordedMedal,recordMedalDeps,canCalculate,captureA,clearA,renderComparison,compareRows,captureEquipment};
})();
