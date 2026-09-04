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
  for(const b of arr || []){
    if(!b) continue;
    if(b.pokemon) b.pokemon = normPokeName(b.pokemon);
    b.exclude_from_avg_stats = b.exclude_from_avg_stats === true;
  }
  return arr || [];
}

// 平均スタッツ専用の集計。元の試合一覧や勝率・レート用の集計には影響させない。
const STAT_FIELDS=[['kills','KO','num'],['assists','アシスト','num'],['dmg_dealt','与ダメ','dmg'],['dmg_taken','被ダメ','dmg'],['heal','回復','dmg'],['goals','ゴール','num']];
function battleStatValue(value){
  if(value==null || (typeof value==='string' && value.trim()==='')) return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function hasBattleStats(b){ return STAT_FIELDS.some(([key])=>battleStatValue(b[key])!=null); }
function aggBattleStats(battles){
  const recorded=battles.filter(hasBattleStats);
  const included=recorded.filter(b=>b.exclude_from_avg_stats!==true);
  const excluded=recorded.filter(b=>b.exclude_from_avg_stats===true);
  const wins=included.filter(b=>b.result==='win'), losses=included.filter(b=>b.result==='loss');
  const average=(arr,key)=>{
    const values=arr.map(b=>battleStatValue(b[key])).filter(v=>v!=null);
    return {value:values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null,n:values.length};
  };
  return {
    n:included.length, winN:wins.length, lossN:losses.length,
    excludedN:excluded.length,
    excludedWinN:excluded.filter(b=>b.result==='win').length,
    excludedLossN:excluded.filter(b=>b.result==='loss').length,
    missingN:battles.length-recorded.length,
    rows:STAT_FIELDS.map(([key,label,type])=>{
      const all=average(included,key), win=average(wins,key), loss=average(losses,key);
      return {label,type,all:all.value,win:win.value,loss:loss.value,allN:all.n,winN:win.n,lossN:loss.n};
    })
  };
}

// ===== Supabase ページング取得 =====
// Supabase(PostgREST)は1クエリ最大1000行しか返さず、超過分は黙って切り捨てられる。
// 対戦記録の累計が1000戦を超えた2026-07に分析・CSVの集計欠け(135戦→127戦等)が実際に発生したため、
// 全件が必要なクエリは必ずこのヘルパー経由で range ページングして取得する。
// makeQuery(from,to): .range(from,to) を適用した「新しい」クエリを返す関数。
//   ページ間で行が重複/欠落しないよう、呼び出し側で安定した .order(created_at + id) を必ず付けること。
// 戻り値: {data, error}。途中ページでエラーが出たら error 非null（dataはそこまでの部分集合）。
const SB_PAGE_SIZE = 1000;
async function sbFetchAll(makeQuery){
  const all = [];
  for(let from = 0;; from += SB_PAGE_SIZE){
    const {data, error} = await makeQuery(from, from + SB_PAGE_SIZE - 1);
    if(error) return {data: all, error};
    all.push(...(data || []));
    if(!data || data.length < SB_PAGE_SIZE) return {data: all, error: null};
  }
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

// シリーズ分析の概要モデル。DOM/Chart.jsから切り離し、描画前の集計を同じ基準で返す。
function buildSeriesAnalysisOverview(battles){
  const bs=battles||[];
  const rateBattles=bs.filter(b=>rankRate(b.rank)!=null).slice()
    .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const rateData=rateBattles.map(b=>rankRate(b.rank));
  const pokeMap={};
  bs.filter(b=>b.pokemon).forEach(b=>{
    if(!pokeMap[b.pokemon]) pokeMap[b.pokemon]={w:0,l:0};
    b.result==='win'?pokeMap[b.pokemon].w++:pokeMap[b.pokemon].l++;
  });
  const dayMap={};
  bs.forEach(b=>{
    const day=b.created_at?b.created_at.slice(0,10):null;
    if(!day)return;
    if(!dayMap[day])dayMap[day]={w:0,l:0};
    b.result==='win'?dayMap[day].w++:dayMap[day].l++;
  });
  const wins=winCount(bs);
  return {
    total:bs.length,
    wins,
    winRate:wrPct(wins,bs.length),
    rateBattles,
    rateData,
    rateLabels:rateBattles.map((b,i)=>String(i+1)),
    rateShowLegendLine:rateData.length?Math.max(...rateData)>=900:false,
    pokeList:Object.entries(pokeMap).sort((a,b)=>(b[1].w+b[1].l)-(a[1].w+a[1].l)).slice(0,12),
    dayMap,
    dayKeys:Object.keys(dayMap).sort(),
  };
}

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
// 記録するランクは「試合後の結果」なので、記録どおりに帯分けすると昇格/降格をまたいだ試合が
// 実際にプレイした帯と1つずれる（例: 990→勝→1010 はマスターの試合だがレジェンド扱いになる）。
// そこで各試合を「直前に記録した試合の帯」で分類する（＝その試合をプレイしていた帯）。
// レート帯(マスター/レジェンド)だけでなくクラス帯(ビギナー〜エキスパート)や
// エキスパート→マスターの昇格もまたぐため、レートに限らず全ランク記録を時系列で連ねて判定する。
// ランクはシリーズ内でのみ連続するため、seriesBattles は同一シリーズの全 battle を渡すこと。
// シリーズ最初の記録は直前が無いため自身の帯で判定する。
// 戻り値: Map<battle, 帯名>（ランク記録のある試合のみ格納。ランク未記録は含めない）。
function buildPlayedTierMap(seriesBattles){
  const map = new Map();
  const ranked = (seriesBattles || []).filter(b => rankTier(b.rank) != null)
    .slice().sort((a, c) => new Date(a.created_at) - new Date(c.created_at));
  ranked.forEach((b, i) => {
    map.set(b, i > 0 ? rankTier(ranked[i-1].rank) : rankTier(b.rank));
  });
  return map;
}
// 集計時のランク帯。ランク記録のある試合は playedMap（buildPlayedTierMap）優先、
// ランク未記録や map 不在の場合は記録どおりの rankTier。
function aggRankTier(b, playedMap){
  return (playedMap && playedMap.has(b)) ? playedMap.get(b) : rankTier(b.rank);
}
