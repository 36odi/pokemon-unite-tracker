// Phase 2 抽出スクリプト（一回限りの移行ツール）
// index.html から定数・純粋関数を js/constants.js, js/utils.js へ移設する。
// 文字走査ではなく行ベース：このコードベースはトップレベル宣言の閉じ括弧が
// 必ず行頭（'}' / '};' / '];'）にある整形なので、正規表現リテラル等に惑わされない。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const lines = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\n');

const ranges = []; // {start,end} 0-indexed inclusive — 後でまとめて除去

function findLine(re) {
  const i = lines.findIndex(l => re.test(l));
  if (i < 0) throw new Error('not found: ' + re);
  return i;
}

// 1行宣言を切り出す
function cutOne(re) {
  const i = findLine(re);
  ranges.push({ start: i, end: i });
  return lines[i].trim();
}

// 複数行ブロック（終端 = 行頭の closer 行）を切り出す
function cutBlock(re, closers) {
  const i = findLine(re);
  let j = i + 1;
  for (; j < lines.length; j++) {
    const t = lines[j].replace(/\r$/, '');
    if (closers.includes(t)) break;
  }
  if (j >= lines.length) throw new Error('closer not found for: ' + re);
  ranges.push({ start: i, end: j });
  return lines.slice(i, j + 1).join('\n');
}

const C = [], U = [];
// ---- constants.js（データのみ）----
C.push('// ===== アプリ定数（ポケモン・わざ・もちもの・ランク）=====');
C.push('// index.html から分離（Phase 2）。DOM・Supabase に依存しないデータのみ。');
C.push('');
C.push(cutOne(/^const SPRITE = /));
C.push(cutBlock(/^const ICON_ID = \{/, ['};']));
C.push('');
C.push(cutBlock(/^const POKEMON_DATA = \{/, ['};']));
C.push('');
C.push('// ===== 技・もちもの・バトルアイテムデータ =====');
C.push(cutBlock(/^const SKILLS = \{/, ['};']));
C.push('');
C.push(cutBlock(/^const DEDICATED_ITEMS = \{/, ['};']));
C.push('');
C.push(cutBlock(/^const GENERAL_ITEMS = \[/, ['];']));
C.push('');
C.push(cutOne(/^const BATTLE_ITEMS_LIST = \[/));
C.push('');
C.push('// ===== ランク帯 =====');
C.push(cutOne(/^const RANKS = \[/));
C.push('// 色はゲーム内ランクトロフィーのイメージに合わせる');
C.push(cutBlock(/^const RANK_STYLE = \{/, ['};']));
C.push('');
C.push(cutOne(/^const ITEM_IMG_PATH = /));

// ---- utils.js（純粋関数のみ）----
U.push('// ===== 純粋ユーティリティ関数 =====');
U.push('// index.html から分離（Phase 2）。DOMに触らない関数のみ（js/constants.js に依存）。');
U.push('');
U.push('// ユーザー入力（シリーズ名・メモ・検索語など）をHTMLに埋め込む際のエスケープ');
U.push(cutBlock(/^function escapeHtml\(/, ['}']));
U.push('');
U.push('// rank 文字列: "エキスパート・C1"（ティア・クラス）/ "レート 1530"（マスター以上）/ 旧データはティア名のみ');
U.push(cutBlock(/^function rankTier\(/, ['}']));
U.push(cutOne(/^function rankRate\(/));
U.push(cutBlock(/^function rankLabel\(/, ['}']));
U.push(cutBlock(/^function rankBadge\(/, ['}']));
U.push('');
U.push(cutOne(/^function getIconUrl\(/));
U.push(cutBlock(/^function iconImg\(/, ['}']));
U.push('');
U.push(cutOne(/^function getItemImgSrc\(/));

const constantsSrc = C.join('\n') + '\n';
const utilsSrc = U.join('\n') + '\n';

// ---- 検証1: 新ファイルが単体で評価でき、期待どおりの中身か ----
const probe = new Function(constantsSrc + '\n' + utilsSrc + `
  return { nPoke: Object.values(POKEMON_DATA).reduce((a,t)=>a+t.pokemon.length,0),
           nSkills: Object.keys(SKILLS).length,
           nGeneral: GENERAL_ITEMS.length,
           nRankStyle: Object.keys(RANK_STYLE).length,
           esc: escapeHtml('<a>'), tier: rankTier('レート 1000'), icon: typeof getIconUrl('ピカチュウ') };
`)();
if (probe.esc !== '&lt;a&gt;' || probe.tier !== 'レジェンド' || probe.nGeneral < 20 || probe.nRankStyle !== 7) {
  console.error('VALIDATION FAILED', probe);
  process.exit(1);
}

// ---- index.html から削除（後ろから）+ script タグ挿入 ----
ranges.sort((a, b) => b.start - a.start);
for (const r of ranges) lines.splice(r.start, r.end - r.start + 1);
let out = lines.join('\n');
out = out.replace('<script src="lab_data.js"></script>',
  '<script src="lab_data.js"></script>\n<script src="js/constants.js"></script>\n<script src="js/utils.js"></script>');

// ---- 検証2: 抽出した識別子が index.html 側で再宣言されていないこと ----
for (const name of ['SPRITE','ICON_ID','POKEMON_DATA','SKILLS','DEDICATED_ITEMS','GENERAL_ITEMS','BATTLE_ITEMS_LIST','RANKS','RANK_STYLE','ITEM_IMG_PATH']) {
  if (new RegExp('^const ' + name + ' ', 'm').test(out)) { console.error('STILL DECLARED:', name); process.exit(1); }
}
for (const name of ['escapeHtml','rankTier','rankRate','rankLabel','rankBadge','getIconUrl','iconImg','getItemImgSrc']) {
  if (new RegExp('^function ' + name + '\\(', 'm').test(out)) { console.error('STILL DECLARED:', name); process.exit(1); }
}

fs.mkdirSync(path.join(ROOT, 'js'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'js/constants.js'), constantsSrc);
fs.writeFileSync(path.join(ROOT, 'js/utils.js'), utilsSrc);
fs.writeFileSync(path.join(ROOT, 'index.html'), out);
console.log('OK', JSON.stringify(probe));
