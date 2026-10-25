// 読み取り専用のレシオ一覧。計算画面と同じデータ・アップグレード補完を使用する。
let ratioPokemon='';
let ratioType='all';
function openRecordRatio(usageTicket=usageIntent('trackerPage')){
  // ラボデータ読み込み前：ラボを開いて「読み込み中」を表示し、完了後にもう一度実行する
  if(!libReady('lab')){showPage('lab');const requestedNav=navId;whenLibReady('lab').then(()=>{if(navId===requestedNav)openRecordRatio(usageTicket);}).catch(()=>{});return;}
  ratioPokemon=Object.hasOwn(LAB_SKILLS,selectedPoke)?selectedPoke:'';
  ratioType='all';
  document.getElementById('ratioSearch').value='';
  document.getElementById('ratioResult').replaceChildren();
  showPage('lab');
  switchLab('ratio');
  if(ratioPokemon) ratioRender(usageTicket);
}
function ratioRenderTypes(){
  const el=document.getElementById('ratioTypes');el.replaceChildren();
  for(const [key,label] of [['all','すべて'],...Object.entries(POKEMON_DATA).map(([k,v])=>[k,v.label])]){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.className='type-tab '+key+(ratioType===key?' active':'');
    b.setAttribute('aria-pressed',String(ratioType===key));
    b.onclick=()=>{ratioType=key;ratioRenderTypes();ratioSearch();};el.appendChild(b);
  }
}
const ratioSlots=['通常攻撃','わざ1','わざ2','ユナイトわざ','特性'];
function ratioNormalize(s){return s.normalize('NFKC').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60));}
function ratioInit(){
  ratioRenderTypes();
  ratioSearch();
  if(!ratioPokemon) document.getElementById('ratioResult').textContent='ポケモンを選ぶと、全わざのレシオを表示します。';
}
function ratioSearch(){
  if(!libReady('lab'))return;
  const q=ratioNormalize(document.getElementById('ratioSearch').value.trim());
  const names=Object.keys(LAB_SKILLS).sort((a,b)=>a.localeCompare(b,'ja')).filter(n=>ratioNormalize(n).includes(q)&&(ratioType==='all'||POKEMON_DATA[ratioType]?.pokemon.includes(n)));
  const el=document.getElementById('ratioChoices');el.replaceChildren();
  for(const n of names){
    const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(n===ratioPokemon));
    b.innerHTML=iconImg(n,'',24)+escapeHtml(n);b.onclick=()=>{ratioPokemon=n;ratioSearch();ratioRender();};el.appendChild(b);
  }
  if(!names.length) el.textContent='該当するポケモンがいません。';
}
function ratioFormula(r,multiplier=1){
  if(r.coeff==null) return r.description||'この成分の計算式は未確認です。';
  if(r.coeff!==0&&!r.stat) return '参照ステータス未収録';
  const fmt=v=>String(Math.round(v*multiplier*10000)/10000);
  const parts=[];
  if(r.coeff) parts.push(r.stat+' × '+fmt(r.coeff)+'％');
  if(r.lvScale) parts.push(fmt(r.lvScale)+' ×（Lv − 1）');
  if(r.fixed) parts.push(fmt(r.fixed));
  const formula=parts.join(' ＋ ')||'0';
  return labEffectUnit(r)?'（'+formula+'）％':formula;
}
function ratioRow(r,poke){
  if(labEffectDescriptionKnown(poke,r))return labDescribedEffectHtml();
  const hits=Number(r.hits)||1;
  const label=ratioLabel(poke,r),note=ratioComponentNote(poke,r);
  return `<div class="ratio-row"><div class="ratio-label">${escapeHtml(label)}</div>
    ${hits>1?'<div class="ratio-meta">1回分の式</div>':''}
    <div class="ratio-formula${r.descriptionEntry||r.formulaText?' ratio-effect-description':''}">${escapeHtml(ratioFormula(r))}</div>
    ${hits>1&&r.coeff!=null?`<div class="ratio-meta">${r.hitsVar?'最大':''}${hits}回分${note?'（表示式の部分のみ）':''}：${escapeHtml(ratioFormula(r,hits))}</div>`:''}
    ${note?`<div class="ratio-meta">${escapeHtml(note)}</div>`:''}${r.calculationNotice?`<div class="ratio-meta">${escapeHtml(r.calculationNotice)}</div>`:''}${r.slot==='特性'&&r.description&&!r.formulaText?labDetailsHtml(poke,r.name,'passives'):''}</div>`;
}
function labDetailsHtml(poke,name,kind='moves'){
  const rows=labDescriptionDetails(poke,name,kind);if(!rows.length)return '';
  return `<div class="lab-effect-description">${rows.map(r=>`<p><strong>${escapeHtml(r.label)}</strong><br>${escapeHtml(r.text)}</p>`).join('')}</div>`;
}
function labCombatNotesHtml(poke){
  const c=typeof LAB_DESCRIPTIONS==='undefined'?null:LAB_DESCRIPTIONS.pokemon[poke]?.combat;if(!c)return '';
  return `<details class="lab-effect-description lab-combat-notes"><summary>急所・HP吸収などの仕様</summary><p>${escapeHtml(c.critical)}</p>${c.additional.map(text=>`<p>${escapeHtml(text)}</p>`).join('')}<p class="ratio-meta">急所の発生や、特性・わざによる能力変化は計算へ自動適用しません。各成分の式・注記と合わせて確認してください。</p></details>`;
}
function ratioSameFormulas(poke,rows,baseRows){
  // 未収録・部分式は「同じ」と断定しない。条件、回数、説明も含めて比較する。
  if(!rows.length||rows.some(r=>r.coeff==null||ratioComponentNote(poke,r))||baseRows.some(r=>r.coeff==null||ratioComponentNote(poke,r))) return false;
  const signature=rs=>rs.map(r=>JSON.stringify([ratioLabel(poke,r),r.stat,r.coeff,r.fixed,r.lvScale,r.hits,r.hitsVar,r.description||''])).sort();
  return JSON.stringify(signature(rows))===JSON.stringify(signature(baseRows));
}
function labUniteInfoHtml(poke){
  const list=typeof LAB_DESCRIPTIONS==='undefined'?[]:LAB_DESCRIPTIONS.pokemon[poke]?.unite||[];
  if(!list.length)return '';
  const condition=LAB_DESCRIPTIONS.pokemon[poke]?.uniteCondition;
  return `<div class="lab-effect-description"><strong>ユナイトわざ使用後の共通強化</strong>${condition?`<p><strong>${escapeHtml(condition)}</strong></p>`:''}${list.map(m=>`<p>${list.length>1?escapeHtml(m.name)+'：':''}${escapeHtml(m.text)}${m.duration!=null?'（'+escapeHtml(String(m.duration))+'秒）':''}${m.energy!=null?`<br><span class="ratio-meta">必要エナジー：${escapeHtml(Number(m.energy).toLocaleString())}（待ち時間の秒数とは別の値）</span>`:'<br><span class="ratio-meta">必要エナジー：未確認</span>'}</p>`).join('')}<p class="ratio-meta">わざ固有の強化とは別の情報です。能力変化や発動中の効果は計算へ自動適用しません。</p></div>`;
}
function ratioRender(usageTicket=usageIntent('labRatioPanel')){
  const poke=ratioPokemon,all=LAB_SKILLS[poke]||[];
  const role=Object.values(POKEMON_DATA).find(d=>d.pokemon.includes(poke))?.label||'';
  const dmg=LAB_STATUS[poke]?.dmg;
  const range=LAB_STATUS[poke]?.range==='Melee'?'近接':LAB_STATUS[poke]?.range==='Ranged'?'遠隔':'';
  const reference=typeof LAB_DESCRIPTIONS==='undefined'?null:LAB_DESCRIPTIONS.pokemon[poke]?.reference;
  const updatedAt=typeof LAB_DESCRIPTIONS==='undefined'?null:[reference?.checkedAt,LAB_DESCRIPTIONS.meta.checkedAt,LAB_DESCRIPTIONS.meta.detailsCheckedAt].filter(Boolean).sort().at(-1);
  let html=`<div class="card"><h2>${iconImg(poke,'',36)} ${escapeHtml(poke)}</h2><div>${escapeHtml(role)} ${dmg==='Special'?'特攻':dmg==='Physical'?'攻撃':''}${range?' ／ '+range:''}</div>
    ${updatedAt?`<p class="ratio-meta">最終更新日：${escapeHtml(updatedAt)}</p>`:''}
    ${labCombatNotesHtml(poke)}
    <nav class="ratio-jumps" aria-label="わざの種類">${ratioSlots.map((s,i)=>`<button type="button" onclick="document.getElementById('ratioSlot${i}').scrollIntoView()">${s}</button>`).join('')}</nav></div>`;
  ratioSlots.forEach((slot,i)=>{
    const rows=slot==='特性'?labPassiveRows(poke):all.filter(r=>r.slot===slot);
    const bases=[...new Set(rows.map(r=>ratioMoveName(poke,r).replace(/[+＋]$/,'')))];
    html+=`<section id="ratioSlot${i}" class="ratio-section"><h3>${slot}</h3>`;
    if(slot==='ユナイトわざ')html+='<div class="card">'+labUniteInfoHtml(poke)+'</div>';
    if(!rows.length) html+='<div class="card ratio-note">レシオ未収録</div>';
    for(const base of bases){
      html+='<div class="card">';
      const names=[...new Set(rows.map(r=>ratioMoveName(poke,r)).filter(n=>n.replace(/[+＋]$/,'')===base))].sort((a,b)=>Number(/[+＋]$/.test(a))-Number(/[+＋]$/.test(b)));
      for(const name of names){
        const namedRows=rows.filter(r=>ratioMoveName(poke,r)===name);
        const levels=[...new Set(namedRows.map(r=>r.upg))];
        for(const level of levels){
          const originalName=namedRows.find(r=>r.upg===level).name;
          let components=slot==='特性'?namedRows.filter(r=>r.upg===level):labUpgradeRows(poke,originalName,level).filter(r=>r.slot===slot&&ratioMoveName(poke,r).replace(/[+＋]$/,'')===base);
          if(!components.length) components=namedRows.filter(r=>r.upg===level);
          const title=name;
          if(title!==slot||level) html+=`<h4>${escapeHtml(title)}${level?` <span class="ratio-meta">Lv${escapeHtml(String(level))}</span>`:''}</h4>`;
          const description=slot==='特性'?'':slot==='通常攻撃'?labBasicDescription(poke):labMoveDescription(poke,name);
          if(description)html+=`<p class="lab-effect-description ratio-description">${/[+＋]$/.test(name)?'強化後の変更点：':''}${escapeHtml(description)}</p>`;
          else if(slot!=='特性'&&/[+＋]$/.test(name))html+='<p class="lab-effect-description ratio-description">強化後の説明は未収録です。</p>';
          if(slot!=='特性')html+=labDetailsHtml(poke,name,slot==='通常攻撃'?'basics':'moves');
          const unknownCD=/[+＋]$/.test(name)&&components.some(r=>r.cdStatus==='unconfirmed');
          const cds=[...new Set(components.map(r=>r.cd).filter(v=>v!=null))];
          if(unknownCD){const normal=components.find(r=>r.normalCD!=null)?.normalCD;html+=`<div class="ratio-meta">＋版の待ち時間：未確認${normal!=null?`（通常版は${escapeHtml(String(normal))}秒）`:''}</div>`;}
          else if(cds.length===1) html+=`<div class="ratio-meta">待ち時間：${escapeHtml(String(cds[0]))}秒</div>`;
          const baseRows=rows.filter(r=>r.name===originalName.replace(/[+＋]$/,'')&&ratioMoveName(poke,r)===base);
          if(/[+＋]$/.test(name)&&cds.length<=1&&ratioSameFormulas(poke,components,baseRows))
            html+='<div class="ratio-row ratio-same">この欄の計算式は通常版と同じです。</div>';
          else html+=components.map(r=>ratioRow(r,poke)+(cds.length>1&&r.cd!=null?`<div class="ratio-meta">待ち時間：${escapeHtml(String(r.cd))}秒</div>`:'')).join('');
        }
      }
      html+='</div>';
    }
    html+='</section>';
  });
  if(typeof LAB_DESCRIPTIONS!=='undefined')html+=`<p class="ratio-meta">説明は主な効果の要約です。能力の変化や発動条件は計算へ自動適用しません。未確認の値は0として補っていません。（原文確認：${escapeHtml(LAB_DESCRIPTIONS.meta.checkedAt)}／全項目の対象ゲーム版は未確認）</p>`;
  document.getElementById('ratioResult').innerHTML=html;
  if(all.length&&document.getElementById('labPage').style.display==='block')usageUsed(usageTicket);
}
