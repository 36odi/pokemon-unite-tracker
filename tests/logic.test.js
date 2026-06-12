#!/usr/bin/env node
/*
 * 軽量テスト（依存なし）: node tests/logic.test.js
 *
 * 本番ファイル(index.html / lab_data.js)は変更しません。
 * index.html から「純粋ロジック関数」をソース抽出して評価し、
 * lab_data.js のデータ整合性も検証します。
 * 壊れたら非ゼロ終了します（CI / push前チェックに利用可）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const labSrc = fs.readFileSync(path.join(ROOT, 'lab_data.js'), 'utf8');

// ---- アサーション ----
let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`  FAIL: ${msg}\n    expected ${e}\n    got      ${a}`); }
}
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log(`  FAIL: ${msg}`); } }
function section(name) { console.log(`\n# ${name}`); }

// ---- index.html から関数ソースを抽出（波括弧バランス） ----
function extractFn(src, name) {
  const sig = `function ${name}(`;
  const i = src.indexOf(sig);
  if (i < 0) throw new Error(`function not found: ${name}`);
  // 引数リストの '(' から ')' までをパレンバランスでスキップ（分割代入引数 {…} 対策）
  let p = i + sig.length - 1; // '(' の位置
  let pd = 0, k = p;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === '(') pd++;
    else if (c === ')') { pd--; if (pd === 0) { k++; break; } }
  }
  // ')' の後の最初の '{' が本体開始
  const open = src.indexOf('{', k);
  let depth = 0, j = open;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(i, j);
}

// 分離済みファイル（js/constants.js, js/utils.js）はそのまま読み込んで評価。
// ラボ系（dcCalcActual, computeStats）はまだ index.html 内なのでソース抽出（Phase 3 で分離予定）。
const constantsSrc = fs.readFileSync(path.join(ROOT, 'js', 'constants.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
const labFnSrc = ['dcCalcActual', 'computeStats'].map(n => extractFn(indexSrc, n)).join('\n');

// computeStats が参照する可能性のあるグローバルのスタブ + lab_data
// （items空・medal無しの呼び出しでは中身は実行されないが、参照安全のため定義）
// lab_data.js に無い定数(LAB_STAT_MAP等)のみ空で補完。new Function で隔離評価。
const body = `
  ${labSrc}
  const LAB_STAT_MAP = {};
  const LAB_PCT_ITEMS = {};
  const LAB_STACK_ITEMS = {};
  const LAB_GOAL_ITEMS = {};
  const LAB_DMG_STACK_ITEMS = {};
  function labCalcMedalBonus(){ return {}; }
  ${constantsSrc}
  ${utilsSrc}
  ${labFnSrc}
  return {escapeHtml, rankTier, rankRate, rankLabel, dcCalcActual, computeStats, LAB_STATUS, LAB_SKILLS,
          POKEMON_DATA, SKILLS, GENERAL_ITEMS, DEDICATED_ITEMS, RANK_STYLE, RANKS};
`;
const F = new Function(body)();

// ---- escapeHtml ----
section('escapeHtml');
eq(F.escapeHtml('<img onerror=x>'), '&lt;img onerror=x&gt;', 'escapes < >');
eq(F.escapeHtml('A & "B" \'C\''), 'A &amp; &quot;B&quot; &#39;C&#39;', 'escapes & " \'');
eq(F.escapeHtml(null), '', 'null -> empty');
eq(F.escapeHtml('普通の名前'), '普通の名前', 'plain text unchanged');

// ---- rankTier / rankRate / rankLabel ----
section('rank helpers');
eq(F.rankTier('エキスパート・C1'), 'エキスパート', 'tier from class');
eq(F.rankTier('レート 980'), 'マスター', 'rate <1000 -> master');
eq(F.rankTier('レート 1000'), 'レジェンド', 'rate 1000 -> legend');
eq(F.rankTier('レート 1530'), 'レジェンド', 'rate >1000 -> legend');
eq(F.rankTier('マスター'), 'マスター', 'legacy plain tier');
eq(F.rankTier(null), null, 'null tier');
eq(F.rankRate('レート 1530'), 1530, 'rate parse');
eq(F.rankRate('エキスパート・C1'), null, 'non-rate -> null');
eq(F.rankLabel('エキスパート・C1'), 'エキスパート クラス1', 'label class');
eq(F.rankLabel('レート 1530'), 'レジェンド 1,530', 'label legend rate');
eq(F.rankLabel('レート 320'), 'マスター 320', 'label master rate');

// ---- dcCalcActual（実ダメージ式） ----
section('dcCalcActual');
// 防御600で半減（floor）
eq(F.dcCalcActual(1000, 600), 500, '600 def halves');
eq(F.dcCalcActual(1000, 0), 1000, '0 def no reduction');
// 最低1保証
eq(F.dcCalcActual(0, 0), 1, 'min 1');
// 割合無視: 防御を直接削減
eq(F.dcCalcActual(1000, 600, 0, 0.5), F.dcCalcActual(1000, 300), 'pctIgnore halves effective def');
// 固定貫通
eq(F.dcCalcActual(1000, 600, 200), F.dcCalcActual(1000, 400), 'flat pen reduces def');
// 被軽減（最終に掛け算）
ok(F.dcCalcActual(1000, 600, 0, 0, 0.5) === Math.floor(500 * 0.5), 'dmgReduce multiplies final');

// ---- computeStats（基礎ステータス） ----
section('computeStats (base stats)');
const mega15 = F.computeStats({ poke: 'メガニウム', lv: 15, items: [] });
ok(!!mega15, 'meganium computeStats returns');
eq(mega15 && mega15['特攻'], 580, 'meganium lv15 SpAtk = 580');
eq(mega15 && mega15['HP'], 9600, 'meganium lv15 HP = 9600');
const pika1 = F.computeStats({ poke: 'ピカチュウ', lv: 1, items: [] });
eq(pika1 && pika1['攻撃'], 134, 'pikachu lv1 Atk = 134');

// ---- lab_data 整合性 ----
section('lab_data integrity');
const S = F.LAB_STATUS, K = F.LAB_SKILLS;
const statKeys = ['hp', 'atk', 'def', 'spatk', 'spdef', 'ms'];
let badStat = [];
for (const [name, s] of Object.entries(S)) {
  for (const k of statKeys) {
    if (!Array.isArray(s[k]) || s[k].length !== 15 || s[k].some(v => typeof v !== 'number')) {
      badStat.push(`${name}.${k}`);
    }
  }
}
ok(badStat.length === 0, `all stat arrays length 15 & numeric (bad: ${badStat.slice(0, 5).join(', ')})`);

const validSlots = new Set(['通常攻撃', 'わざ1', 'わざ2', 'ユナイトわざ']);
let badSkill = [];
for (const [name, rows] of Object.entries(K)) {
  if (!Array.isArray(rows)) { badSkill.push(`${name}:notArray`); continue; }
  for (const r of rows) {
    if (!validSlots.has(r.slot)) badSkill.push(`${name}:slot(${r.slot})`);
    if (typeof r.name !== 'string' || !r.name) badSkill.push(`${name}:name`);
    // coeff/fixed はダメージ無しのわざで null になり得る（数値 or null を許容、文字列等は不正）
    if (!(r.coeff == null || typeof r.coeff === 'number')) badSkill.push(`${name}:coeff(${r.coeff})`);
    if (!(r.fixed == null || typeof r.fixed === 'number')) badSkill.push(`${name}:fixed(${r.fixed})`);
  }
}
ok(badSkill.length === 0, `all skill rows valid (bad: ${badSkill.slice(0, 5).join(', ')})`);

// STATUS と SKILLS のポケモン集合が概ね一致（SKILLSはSTATUSに含まれるべき）
const missing = Object.keys(K).filter(p => !S[p]);
ok(missing.length === 0, `every SKILLS pokemon has STATUS (missing: ${missing.slice(0, 5).join(', ')})`);

// ---- 定数データの整合性（js/constants.js） ----
section('constants integrity');
const allPoke = Object.values(F.POKEMON_DATA).flatMap(t => t.pokemon);
ok(allPoke.length === new Set(allPoke).size, 'POKEMON_DATA has no duplicates');
eq(Object.keys(F.RANK_STYLE).sort(), F.RANKS.slice().sort(), 'RANK_STYLE keys match RANKS');
const dedicatedUnknown = Object.keys(F.DEDICATED_ITEMS).filter(p => !allPoke.includes(p));
ok(dedicatedUnknown.length === 0, `DEDICATED_ITEMS pokemon all in POKEMON_DATA (bad: ${dedicatedUnknown.join(', ')})`);
const skillsUnknown = Object.keys(F.SKILLS).filter(p => !allPoke.includes(p));
ok(skillsUnknown.length === 0, `SKILLS pokemon all in POKEMON_DATA (bad: ${skillsUnknown.slice(0, 5).join(', ')})`);

// ---- アプリシェル資産の整合性（ファイル分割後の参照切れ検知） ----
section('app shell assets');
const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
// index.html が参照するローカル資産（js/css/json）が実在し、SW のプリキャッシュにも載っていること
const localRefs = [...indexSrc.matchAll(/(?:src|href)="(?!https?:|\/\/|data:|#)([^"]+)"/g)]
  .map(m => m[1])
  .filter(p => /\.(js|css|json)$/.test(p));
ok(localRefs.length >= 4, `found local asset refs (got: ${localRefs.length})`);
const missingFiles = localRefs.filter(p => !fs.existsSync(path.join(ROOT, p)));
ok(missingFiles.length === 0, `all local asset refs exist (missing: ${missingFiles.join(', ')})`);
const notCached = localRefs.filter(p => !swSrc.includes(p));
ok(notCached.length === 0, `all local assets precached in sw.js (not cached: ${notCached.join(', ')})`);
// CSS が抽出済みで index.html に巨大 <style> ブロックが残っていないこと
ok(fs.existsSync(path.join(ROOT, 'styles.css')) && fs.statSync(path.join(ROOT, 'styles.css')).size > 10000, 'styles.css exists and non-trivial');
ok(!/^<style>$/m.test(indexSrc), 'no extracted <style> block left in index.html');

// ---- SWキャッシュ版数の上げ忘れ検知（git がある場合のみ） ----
// ローカル資産が origin/main から変わっているのに sw.js の CACHE 版数が同じだと、
// 配信後に既存ユーザーの端末で新旧ファイルが混在し得る。プッシュ前に機械的に検知する。
section('sw cache version');
try {
  const { execSync } = require('child_process');
  const opt = { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
  const changed = execSync('git diff origin/main --name-only', opt).split('\n').filter(Boolean);
  const assetChanged = changed.filter(f =>
    f === 'index.html' || f === 'styles.css' || f === 'lab_data.js' || f === 'manifest.json' ||
    f.startsWith('js/') || f.startsWith('vendor/'));
  if (assetChanged.length === 0) {
    ok(true, 'no asset changes vs origin/main — version bump not required');
  } else {
    const curVer = (swSrc.match(/CACHE\s*=\s*'([^']+)'/) || [])[1];
    const mainSw = execSync('git show origin/main:sw.js', opt);
    const mainVer = (mainSw.match(/CACHE\s*=\s*'([^']+)'/) || [])[1];
    ok(curVer && curVer !== mainVer,
      `assets changed (${assetChanged.length} files) -> sw.js CACHE must be bumped (origin/main: ${mainVer}, local: ${curVer})`);
  }
} catch (e) {
  ok(true, 'git unavailable — sw version check skipped');
}

// ---- 結果 ----
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
