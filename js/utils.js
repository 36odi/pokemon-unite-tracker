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
  return `<span class="badge" style="background:${s.bg};color:${s.color};">${escapeHtml(rankLabel(rank))}</span>`;
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

// ===== ゲーム日（AM9:00を1日の境目とする） =====
// 深夜帯のプレイを前日扱いにするため、対戦時刻を9時間前へ補正した Date を返す。
// 日別/週間/曜日別など複数の集計で共通利用し、同一基準を保証する。
const GAME_DAY_OFFSET_MS = 9*60*60*1000;
function gameDayDate(ts){ return new Date(new Date(ts).getTime() - GAME_DAY_OFFSET_MS); }
// ゲーム日のキー "YYYY-MM-DD"（ゼロ埋め）
function gameDayKey(ts){
  const d = gameDayDate(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ===== 勝敗集計の共通ヘルパー =====
// battle配列の勝ち数。`.filter(b=>b.result==='win').length` の共通化。
function winCount(arr){ return arr.filter(b=>b.result==='win').length; }
// 勝率の%文字列（小数1桁）。t==0 は '—'。calcWR(index.html)の「+'%'」版。
function wrPct(w,t){ return t>0 ? ((w/t)*100).toFixed(1)+'%' : '—'; }

// ===== 勝率の勝敗色 =====
// 引数は百分率（数値 0..100 か "50%"/"50.0" 文字列）。比率(0..1)を渡すときは *100 して百分率で渡すこと。
// データ無し（null/''/'—'/NaN）は noneColor（既定 var(--text3)）。50%以上=勝色、未満=負色。
function wrColor(pct, noneColor){
  const none = noneColor || 'var(--text3)';
  if(pct==null || pct==='' || pct==='—') return none;
  const n = typeof pct==='string' ? parseFloat(pct) : pct;
  if(!isFinite(n)) return none;
  return n>=50 ? 'var(--win)' : 'var(--loss)';
}

// ===== プレイ時のランク帯（ランク別成績の集計用） =====
// 記録されるレートは「試合後の結果値」なので、試合後レートで帯分けすると昇格/降格をまたいだ試合が
// 実際にプレイした帯と1つずれる（例: 990→勝→1010 はマスターの試合だがレジェンド扱いになる）。
// そこで各レート試合を「直前に記録したレート試合のレート」で帯分けする（＝その試合をプレイしていた帯）。
// レートはシリーズ内でのみ連続するため、seriesBattles は同一シリーズの全 battle を渡すこと。
// シリーズ最初のレート試合は直前が無いため自身のレートで判定する。
// 戻り値: Map<battle, 'マスター'|'レジェンド'>（レート記録のある試合のみ格納。非レート記録は含めない）。
function buildPlayedTierMap(seriesBattles){
  const map = new Map();
  const rated = (seriesBattles || []).filter(b => rankRate(b.rank) != null)
    .slice().sort((a, c) => new Date(a.created_at) - new Date(c.created_at));
  rated.forEach((b, i) => {
    const baseRate = i > 0 ? rankRate(rated[i-1].rank) : rankRate(b.rank);
    map.set(b, rankTier('レート ' + baseRate));
  });
  return map;
}
// 集計時のランク帯。レート試合は playedMap（buildPlayedTierMap）優先、
// 非レート記録（クラス等）や map 不在の場合は記録どおりの rankTier。
function aggRankTier(b, playedMap){
  return (playedMap && playedMap.has(b)) ? playedMap.get(b) : rankTier(b.rank);
}
