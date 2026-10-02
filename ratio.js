// 読み取り専用のレシオ一覧。計算画面と同じデータ・アップグレード補完を使用する。
let ratioPokemon='';
let ratioType='all';
function openRecordRatio(){
  // ラボデータ読み込み前：ラボを開いて「読み込み中」を表示し、完了後にもう一度実行する
  if(!libReady('lab')){showPage('lab');whenLibReady('lab').then(openRecordRatio).catch(()=>{});return;}
  ratioPokemon=Object.hasOwn(LAB_SKILLS,selectedPoke)?selectedPoke:'';
  ratioType='all';
  document.getElementById('ratioSearch').value='';
  document.getElementById('ratioResult').replaceChildren();
  showPage('lab');
  switchLab('ratio');
  if(ratioPokemon) ratioRender();
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
  if(r.coeff==null) return r.description||'レシオ未収録';
  if(r.coeff!==0&&!r.stat) return '参照ステータス未収録';
  const fmt=v=>String(Math.round(v*multiplier*10000)/10000);
  const parts=[];
  if(r.coeff) parts.push(r.stat+' × '+fmt(r.coeff)+'％');
  if(r.lvScale) parts.push(fmt(r.lvScale)+' ×（Lv − 1）');
  if(r.fixed) parts.push(fmt(r.fixed));
  return parts.join(' ＋ ')||'0';
}
function ratioRow(r,poke){
  const hits=Number(r.hits)||1;
  const label=ratioLabel(poke,r),note=ratioComponentNote(poke,r);
  return `<div class="ratio-row"><div class="ratio-label">${escapeHtml(label)}</div>
    ${hits>1?'<div class="ratio-meta">1回分の式</div>':''}
    <div class="ratio-formula">${escapeHtml(ratioFormula(r))}</div>
    ${hits>1&&r.coeff!=null?`<div class="ratio-meta">${r.hitsVar?'最大':''}${hits}回分${note?'（表示式の部分のみ）':''}：${escapeHtml(ratioFormula(r,hits))}</div>`:''}
    ${note?`<div class="ratio-meta">${escapeHtml(note)}</div>`:''}</div>`;
}
function ratioSameFormulas(poke,rows,baseRows){
  // 未収録・部分式は「同じ」と断定しない。条件、回数、説明も含めて比較する。
  if(!rows.length||rows.some(r=>r.coeff==null||ratioComponentNote(poke,r))||baseRows.some(r=>r.coeff==null||ratioComponentNote(poke,r))) return false;
  const signature=rs=>rs.map(r=>JSON.stringify([ratioLabel(poke,r),r.stat,r.coeff,r.fixed,r.lvScale,r.hits,r.hitsVar,r.description||''])).sort();
  return JSON.stringify(signature(rows))===JSON.stringify(signature(baseRows));
}
function ratioRender(){
  const poke=ratioPokemon,all=LAB_SKILLS[poke]||[];
  const role=Object.values(POKEMON_DATA).find(d=>d.pokemon.includes(poke))?.label||'';
  const dmg=LAB_STATUS[poke]?.dmg;
  let html=`<div class="card"><h2>${iconImg(poke,'',36)} ${escapeHtml(poke)}</h2><div>${escapeHtml(role)} ${dmg==='Special'?'特攻':dmg==='Physical'?'攻撃':''}</div>
    <nav class="ratio-jumps" aria-label="わざの種類">${ratioSlots.map((s,i)=>`<button type="button" onclick="document.getElementById('ratioSlot${i}').scrollIntoView()">${s}</button>`).join('')}</nav></div>`;
  ratioSlots.forEach((slot,i)=>{
    const rows=all.filter(r=>r.slot===slot);
    const bases=[...new Set(rows.map(r=>ratioMoveName(poke,r).replace(/[+＋]$/,'')))];
    html+=`<section id="ratioSlot${i}" class="ratio-section"><h3>${slot}</h3>`;
    if(!rows.length) html+='<div class="card ratio-note">レシオ未収録</div>';
    for(const base of bases){
      html+='<div class="card">';
      const names=[...new Set(rows.map(r=>ratioMoveName(poke,r)).filter(n=>n.replace(/[+＋]$/,'')===base))].sort((a,b)=>Number(/[+＋]$/.test(a))-Number(/[+＋]$/.test(b)));
      for(const name of names){
        const namedRows=rows.filter(r=>ratioMoveName(poke,r)===name);
        const levels=[...new Set(namedRows.map(r=>r.upg))];
        for(const level of levels){
          const originalName=namedRows.find(r=>r.upg===level).name;
          let components=labUpgradeRows(poke,originalName,level).filter(r=>r.slot===slot&&ratioMoveName(poke,r).replace(/[+＋]$/,'')===base);
          if(!components.length) components=namedRows.filter(r=>r.upg===level);
          const title=name;
          if(title!==slot||level) html+=`<h4>${escapeHtml(title)}${level?` <span class="ratio-meta">Lv${escapeHtml(String(level))}</span>`:''}</h4>`;
          const cds=[...new Set(components.map(r=>r.cd).filter(v=>v!=null))];
          if(cds.length===1) html+=`<div class="ratio-meta">待ち時間：${escapeHtml(String(cds[0]))}秒</div>`;
          const baseRows=rows.filter(r=>r.name===originalName.replace(/[+＋]$/,'')&&ratioMoveName(poke,r)===base);
          if(/[+＋]$/.test(name)&&cds.length<=1&&ratioSameFormulas(poke,components,baseRows))
            html+='<div class="ratio-row ratio-same">表示している式と回数は通常版と同じです。</div>';
          else html+=components.map(r=>ratioRow(r,poke)+(cds.length>1&&r.cd!=null?`<div class="ratio-meta">待ち時間：${escapeHtml(String(r.cd))}秒</div>`:'')).join('');
        }
      }
      html+='</div>';
    }
    html+='</section>';
  });
  document.getElementById('ratioResult').innerHTML=html;
}
