// 公式の日時・対象・出典を確認した調整だけを掲載する。計算式の更新とは別管理。
const UNITE_PATCHES=[
  {id:'20261013',name:'星雷のヴォルテックス',at:'2026-10-13T16:00:00+09:00',source:'https://www.pokemonunite.jp/ja/topics/battle/20261013-2/',checked:'2026-10-15',pokemon:['ソルガレオ','ヤドラン','ホウオウ','インテレオン','ミライドン','モルペコ','エースバーン','ドラパルト','ラティオス','ラティアス'],summary:'ソルガレオのわざの使い勝手、ヤドランの耐久・妨害などを強化。モルペコの火力・シールドや、一部ポケモンの回復・妨害などを調整。'},
  {id:'20260903',name:'決め手の躍動',at:'2026-09-03T13:00:00+09:00',source:'https://www.pokemonunite.jp/ja/topics/battle/20260902-1/',checked:'2026-10-15',pokemon:['イワパレス','マッシブーン','ミュウツーY','ドードリオ','フリーザー','ファイヤー','アローラキュウコン','レシラム','イベルタル','オーダイル','ヨクバリス','キュワワー','ガブリアス','ジュラルドン'],summary:'イワパレスの妨害、マッシブーンの攻撃などを強化。レシラム・イベルタル・オーダイルなどの火力や耐久・妨害を調整。'}
];
const PatchAnalysis=(()=>{
  const el=id=>document.getElementById(id),esc=escapeHtml,core=PatchAnalysisCore;
  let current=null,settings=null,builds=[];
  const tiers=['ビギナー','スーパー','ハイパー','エリート','エキスパート','マスター','レジェンド'];
  const modeNames={all:'全モード',solo:'ソロ',duo:'デュオ／トリオ',full:'フルパ'};
  const date=t=>new Date(t).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  function rows(){return allSeriesRawData.flatMap(s=>s.battles||[]);}
  function playedMap(){const map=new Map();allSeriesRawData.forEach(s=>buildPlayedTierMap(s.battles.filter(b=>typeof b.created_at==='string'&&Number.isFinite(Date.parse(b.created_at)))).forEach((v,k)=>map.set(k,v)));return map;}
  function buildLabel(b){return [b.skill1||'わざ1未記録',b.skill2||'わざ2未記録',(b.items||'もちもの未記録'),b.battle_item||'バトルアイテム未記録',parseMedalSet(b.medal_set)?.label||'メダル未記録'].join(' ／ ');}
  const options=(entries,first='すべて')=>'<option value="">'+first+'</option>'+entries.map(([v,label])=>`<option value="${esc(v)}">${esc(label)}</option>`).join('');
  function field(id,label,entries,first){return `<label>${label}<select class="lab-select" id="${id}">${options(entries,first)}</select></label>`;}
  function unique(records,key){return [...new Set(records.map(b=>b[key]).filter(Boolean))].sort().map(v=>[v,v]).concat([['__missing','未記録']]);}
  function render(pokemon){
    const box=el('pokeHubPatch');if(!box)return;
    const records=rows().filter(b=>b.pokemon===pokemon);
    if(current!==pokemon){current=pokemon;settings={patch:UNITE_PATCHES[0].id,days:14,mode:detailMode,rank:'',same:true,build:'',skill1:'',skill2:'',item:'',battleItem:'',medal:'',excludeBots:!statIncludeBot};}
    builds=LabReview.groupBuilds(records);
    if(settings.build&&!builds.some(g=>core.buildKey(g.record)===settings.build))settings.build='';
    if(!settings.build&&builds.length)settings.build=core.buildKey(builds[0].record);
    const items=[...new Set(records.flatMap(b=>(b.items||'').split(',').filter(Boolean)))].sort().map(v=>[v,v]).concat([['__missing','もちもの未記録']]);
    const medalMap=new Map();records.forEach(b=>{const k=medalSetKey(b.medal_set);if(k&&!medalMap.has(k))medalMap.set(k,parseMedalSet(b.medal_set)?.label||'記録したメダル');});
    const medalEntries=[...medalMap].map(([k,label],i)=>[k,label+'（中身 '+(i+1)+'）']).concat([['__missing','未記録']]);
    box.innerHTML=`<section class="pa-controls"><h2 class="lr-section-title">調整前後の分析</h2><p class="lr-caption">全シリーズの記録を、公式の更新日時の前後で比較します。区分には記録日時を使用します。後から入力した試合は、実際の調整前後と一致しないことがあります。</p><div class="pa-filters"><label>比較する調整<select class="lab-select" id="paPatch">${UNITE_PATCHES.map(p=>`<option value="${p.id}">${date(p.at)} ／ ${esc(p.name)}</option>`).join('')}</select></label>${field('paMode','対戦形式',Object.entries(modeNames).filter(([k])=>k!=='all'),'全モード')}<label>比較期間<select class="lab-select" id="paDays">${[7,14,28].map(n=>`<option value="${n}">前後${n}日間</option>`).join('')}</select></label>${field('paRank','実際にプレイしたランク',tiers.map(v=>[v,v]).concat([['__missing','未記録']]))}</div><p id="paSource" class="lr-caption"></p><div class="pa-checks"><label><input id="paBots" type="checkbox"> BOT戦を除く</label><label><input id="paSame" type="checkbox"> 同じ構成だけで比較する</label></div><label>比較する構成（全記録から選択）<select class="lab-select" id="paBuild">${builds.map((g,i)=>`<option value="${esc(core.buildKey(g.record))}">構成 ${i+1}（全記録 ${g.count}試合） ${esc(buildLabel(g.record))}</option>`).join('')||'<option value="">構成の記録なし</option>'}</select></label><p id="paBuildNote" class="lr-caption"></p><details class="lr-caption"><summary>わざ・もちものなどで個別に絞る</summary><div class="pa-filters">${field('paSkill1','わざ1',unique(records,'skill1'))}${field('paSkill2','わざ2',unique(records,'skill2'))}${field('paItem','もちものを含む',items)}${field('paBattleItem','バトルアイテム',unique(records,'battle_item'))}${field('paMedal','メダルの中身',medalEntries)}</div></details><p id="paWindow" class="lr-caption"></p></section><div id="paOutput"></div>`;
    const mapping={paPatch:'patch',paMode:'mode',paDays:'days',paRank:'rank',paBuild:'build',paSkill1:'skill1',paSkill2:'skill2',paItem:'item',paBattleItem:'battleItem',paMedal:'medal'};
    for(const [id,key] of Object.entries(mapping)){el(id).value=key==='mode'&&settings[key]==='all'?'':settings[key];el(id).onchange=()=>{settings[key]=key==='days'?Number(el(id).value):key==='mode'?(el(id).value||'all'):el(id).value;update();};}
    el('paBots').checked=settings.excludeBots;el('paSame').checked=settings.same;
    el('paBots').onchange=()=>{settings.excludeBots=el('paBots').checked;update();};el('paSame').onchange=()=>{settings.same=el('paSame').checked;update();};update();
  }
  function update(){
    if(!current||!el('paOutput'))return;
    const patch=UNITE_PATCHES.find(p=>p.id===settings.patch)||UNITE_PATCHES[0];
    el('paSource').innerHTML=`対象：${esc(patch.pokemon.join('・'))}<br>${esc(patch.summary)}<br><a href="${patch.source}" target="_blank" rel="noopener">公式の調整内容</a>（確認日：${patch.checked}）${patch.pokemon.includes(current)?'':'<br>選択中のポケモンは、この調整の直接の対象には含まれていません。相手や環境の変化も成績に影響します。'}<br>現在は確認済みの調整2件を収録しています。`;
    el('paBuild').disabled=!settings.same;
    for(const id of ['paSkill1','paSkill2','paItem','paBattleItem','paMedal'])el(id).disabled=settings.same;
    el('paBuildNote').textContent=settings.same?(settings.build?'わざ・もちもの（順不同）・バトルアイテム・メダルの中身を固定します。未記録も別条件として扱います。':'同じ構成の記録がないため比較できません。'):'全構成を比較します。構成を変えた影響も前後の差に含まれます。個別の条件でも絞れます。';
    const result=core.analyze(rows(),{...settings,pokemon:current,boundary:patch.at,build:settings.same?(settings.build||'__no_build'):'',skill1:settings.same?'':settings.skill1,skill2:settings.same?'':settings.skill2,item:settings.same?'':settings.item,battleItem:settings.same?'':settings.battleItem,medal:settings.same?'':settings.medal},playedMap());
    el('paWindow').textContent='前：'+date(result.from)+' ～ '+date(result.boundary)+'未満 ／ 後：'+date(result.boundary)+' ～ '+date(result.to)+'未満（JST）。区切り時刻の記録は「後」です。';
    const metric=(title,m)=>`<article class="pa-metric"><h3>${title}</h3><strong>${m.rate===null?'—':m.rate.toFixed(1)+'％'}</strong><p>${m.n}試合 ／ ${m.wins}勝 ${m.losses}敗</p></article>`;
    const fmt=(n)=>n===null?'—':n.toLocaleString('ja-JP',{maximumFractionDigits:1});
    const diff=(a,b,suffix='')=>a===null||b===null?'—':(b>a?'＋':b<a?'−':'±')+fmt(Math.abs(b-a))+suffix;
    const stats=result.a.stats.rows.map((a,i)=>{const b=result.b.stats.rows[i];return `<tr><th>${esc(a.label)}</th><td>${fmt(a.all)}<small>対象 ${a.allN}試合</small></td><td>${fmt(b.all)}<small>対象 ${b.allN}試合</small></td><td>${diff(a.all,b.all)}</td></tr>`;}).join('');
    const groupNames=new Map(builds.map((g,i)=>[core.buildKey(g.record),'構成 '+(i+1)+'：'+buildLabel(g.record)]));
    function mixTable(title,groups,names){
      const visible=groups.slice(0,10),rest=groups.slice(10);if(rest.length)visible.push({key:'その他（'+rest.length+'種類）',before:rest.reduce((s,r)=>s+r.before,0),after:rest.reduce((s,r)=>s+r.after,0)});
      return `<details class="lr-caption"><summary>${title}</summary><div class="lr-table-scroll"><table class="lr-table"><thead><tr><th>条件</th><th>前</th><th>後</th></tr></thead><tbody>${visible.map(g=>`<tr><th>${esc(names[g.key]||g.key)}</th><td>${g.before}試合</td><td>${g.after}試合</td></tr>`).join('')||'<tr><td colspan="3">記録なし</td></tr>'}</tbody></table></div></details>`;
    }
    el('paOutput').innerHTML=`${result.incomplete?'<p class="lr-warning">調整後の指定期間はまだ終わっていません。現在までの記録を表示しているため、前後の記録量に差があります。</p>':''}<div class="pa-metrics">${metric('調整前',result.a)}${metric('調整後',result.b)}</div><p class="pa-difference">勝率差：${diff(result.a.rate,result.b.rate,'ポイント')}</p><p class="lr-caption">${result.difference===null?'片側または両側に記録がないため、前後の比較はできません。':result.a.n<10||result.b.n<10?'少数の記録です。勝率差だけで良し悪しを判断できません。':''}前後の差だけでは調整の効果と断定できません。相手・ランク・習熟・組み合わせの変化や、期間内の別の更新も影響します。</p><h3 class="lr-section-title">平均スタッツ</h3><div class="lr-table-scroll"><table class="lr-table"><thead><tr><th>項目</th><th>前</th><th>後</th><th>差</th></tr></thead><tbody>${stats}</tbody></table></div><p class="lr-caption">平均対象外：前 ${result.a.stats.excludedN}試合／後 ${result.b.stats.excludedN}試合。スタッツ未記録：前 ${result.a.stats.missingN}試合／後 ${result.b.stats.missingN}試合。勝率・試合数には平均対象外の記録も含めます。未記録は0として扱いません。</p><h3 class="lr-section-title">比較条件の違い</h3>${mixTable('実際にプレイしたランク',result.ranks,{})}${mixTable('構成の内訳',result.builds,Object.fromEntries(groupNames))}${mixTable('対戦形式',result.modes,modeNames)}<p class="lr-caption">日時不明の除外：${result.unknown}試合。未来日時の除外：${result.future}試合。いずれも現在の絞り込み条件に合う記録の件数です。</p>`;
  }
  function clear(){current=null;settings=null;builds=[];if(el('pokeHubPatch'))el('pokeHubPatch').innerHTML='';}
  return {render,update,clear};
})();
