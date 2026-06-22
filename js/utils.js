// ===== 純粋ユーティリティ関数 =====
// index.html から分離（Phase 2）。DOMに触らない関数のみ（js/constants.js に依存）。

// ユーザー入力（シリーズ名・メモ・検索語など）をHTMLに埋め込む際のエスケープ
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// rank 文字列: "エキスパート・C1"（ティア・クラス）/ "レート 1530"（マスター以上）/ 旧データはティア名のみ
function rankTier(r){
  if(!r) return null;
  if(r.startsWith('レート ')){ const n=parseInt(r.slice(3))||0; return n>=1000?'レジェンド':'マスター'; }
  const i=r.indexOf('・'); return i>=0?r.slice(0,i):r;
}
function rankRate(r){ return (r&&r.startsWith('レート '))?(parseInt(r.slice(3))||0):null; }
function rankLabel(r){
  if(!r) return '';
  if(r.startsWith('レート ')){ const n=parseInt(r.slice(3))||0; return (n>=1000?'レジェンド':'マスター')+' '+n.toLocaleString(); }
  const i=r.indexOf('・C'); if(i>=0) return r.slice(0,i)+' クラス'+r.slice(i+2);
  return r;
}
function rankBadge(rank){
  if(!rank) return '';
  const s=RANK_STYLE[rankTier(rank)]||{color:'var(--text2)',bg:'var(--bg3)'};
  return `<span class="badge" style="background:${s.bg};color:${s.color};">${rankLabel(rank)}</span>`;
}

function getIconUrl(n){ const id=ICON_ID[n]; return id?`${SPRITE}${id}.png`:null; }
function iconImg(n,cls,sz=28){
  const u=getIconUrl(n);
  return u?`<img src="${u}" class="${cls}" width="${sz}" height="${sz}" alt="${n}" loading="lazy" />`:`<span style="width:${sz}px;height:${sz}px;display:inline-flex;align-items:center;justify-content:center;font-size:${sz*.55}px;">🎮</span>`;
}

function getItemImgSrc(name){ return name ? `${ITEM_IMG_PATH}${name}.png` : ''; }

// もちものグレード → 効果ティア（0/1/2）。Lv10・Lv20 で段階が上がる。
function gradeTier(grade){ return grade>=20?2:grade>=10?1:0; }

// 旧表記のポケモン名をラボ準拠の現行表記に正規化する。
// 保存済みデータ（Supabase / ゲストlocalStorage）の読み込み境界で適用し、
// 編集・保存されたレコードから自然に新表記へ移行していく。
const POKE_NAME_ALIASES = { 'ミュウツー(X)':'ミュウツーX', 'ミュウツー(Y)':'ミュウツーY' };
function normPokeName(p){ return POKE_NAME_ALIASES[p] || p; }
function normBattles(arr){
  for(const b of arr || []){ if(b && b.pokemon) b.pokemon = normPokeName(b.pokemon); }
  return arr || [];
}
