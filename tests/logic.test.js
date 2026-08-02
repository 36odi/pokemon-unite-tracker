#!/usr/bin/env node
/*
 * 軽量テスト（依存なし）: node tests/logic.test.js
 *
 * 本番の分離済みロジックファイルを直接評価し、
 * index.html のアプリシェルと lab_data.js のデータ整合性も検証します。
 * 壊れたら非ゼロ終了します（CI / push前チェックに利用可）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const labSrc = fs.readFileSync(path.join(ROOT, 'lab_data.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// ---- アサーション ----
let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`  FAIL: ${msg}\n    expected ${e}\n    got      ${a}`); }
}
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log(`  FAIL: ${msg}`); } }
function section(name) { console.log(`\n# ${name}`); }

// 分離済みファイルをそのまま読み込んで評価。
const constantsSrc = fs.readFileSync(path.join(ROOT, 'js', 'constants.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
const labCoreSrc = fs.readFileSync(path.join(ROOT, 'js', 'lab-core.js'), 'utf8');

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
  ${labCoreSrc}
  return {escapeHtml, rankTier, rankRate, rankLabel, gradeTier, gameDayKey, gameDayDate, wrColor, winCount, wrPct, buildPlayedTierMap, aggRankTier, sbFetchAll, dcCalcActual, computeStats, LAB_STATUS, LAB_SKILLS,
          ICON_ID, POKEMON_DATA, SKILLS, GENERAL_ITEMS, DEDICATED_ITEMS, RANK_STYLE, RANKS};
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

// ---- gradeTier（もちものグレード→効果ティア） ----
section('gradeTier');
eq(F.gradeTier(1), 0, 'grade 1 -> tier 0');
eq(F.gradeTier(9), 0, 'grade 9 -> tier 0');
eq(F.gradeTier(10), 1, 'grade 10 -> tier 1');
eq(F.gradeTier(19), 1, 'grade 19 -> tier 1');
eq(F.gradeTier(20), 2, 'grade 20 -> tier 2');
eq(F.gradeTier(30), 2, 'grade 30 -> tier 2');

// ---- gameDayKey / gameDayDate（AM9:00を1日の境目とするゲーム日） ----
// ローカル時刻で構築・ローカル時刻で読むためタイムゾーン非依存。
section('gameDay (AM9 cutoff)');
const before9 = new Date(2026, 5, 2, 8, 0, 0).getTime(); // 6/2 08:00 ローカル
const after9  = new Date(2026, 5, 2, 9, 0, 0).getTime(); // 6/2 09:00 ローカル
eq(F.gameDayKey(before9), '2026-06-01', '08:00 は前日(ゲーム日)に属する');
eq(F.gameDayKey(after9),  '2026-06-02', '09:00 から新しいゲーム日');
eq(F.gameDayDate(before9).getDay(), new Date(2026, 5, 1).getDay(), '08:00 の曜日は前日扱い');
eq(F.gameDayDate(after9).getDay(),  new Date(2026, 5, 2).getDay(), '09:00 の曜日は当日');

// ---- wrColor（勝率→勝敗色・百分率ベース） ----
section('wrColor');
eq(F.wrColor(50), 'var(--win)', '50 -> win');
eq(F.wrColor(49.9), 'var(--loss)', '49.9 -> loss');
eq(F.wrColor(100), 'var(--win)', '100 -> win');
eq(F.wrColor(0), 'var(--loss)', '0 -> loss');
eq(F.wrColor('50.0%'), 'var(--win)', 'string "50.0%" -> win');
eq(F.wrColor('33.3'), 'var(--loss)', 'string "33.3" -> loss');
eq(F.wrColor(1), 'var(--loss)', '1 は1%扱い(比率ではない) -> loss');
eq(F.wrColor('—'), 'var(--text3)', 'dash -> none(text3)');
eq(F.wrColor(null), 'var(--text3)', 'null -> none(text3)');
eq(F.wrColor('', 'var(--text2)'), 'var(--text2)', 'empty -> 指定noneColor');

// ---- winCount / wrPct（勝敗集計ヘルパー） ----
section('winCount / wrPct');
{
  const arr=[{result:'win'},{result:'loss'},{result:'win'},{result:'loss'},{result:'loss'}];
  eq(F.winCount(arr), 2, 'winCount: 2勝3敗の配列で2');
  eq(F.winCount([]), 0, 'winCount: 空配列は0');
  eq(F.wrPct(1,3), '33.3%', 'wrPct: 1/3 -> 33.3%');
  eq(F.wrPct(1,2), '50.0%', 'wrPct: 1/2 -> 50.0%');
  eq(F.wrPct(0,0), '—', 'wrPct: 分母0 -> —');
  eq(F.wrPct(0,4), '0.0%', 'wrPct: 0勝 -> 0.0%');
}

// ---- buildPlayedTierMap / aggRankTier（プレイ時のランク帯＝直前レートで帯分け） ----
section('playedTier (rank by pre-match rate)');
{
  // 昇格した試合: 990(勝) -> 1010。1010 の試合は直前 990 でプレイ＝マスター扱い。
  const b1={rank:'レート 990', created_at:'2026-06-01T01:00:00Z'};
  const b2={rank:'レート 1010',created_at:'2026-06-01T02:00:00Z'};
  const b3={rank:'レート 1030',created_at:'2026-06-01T03:00:00Z'};
  const m=F.buildPlayedTierMap([b3,b1,b2]); // 順不同で渡しても内部で時系列ソート
  eq(m.get(b1), 'マスター', 'シリーズ最初のレート試合は自身(990)で判定=マスター');
  eq(m.get(b2), 'マスター', '1010だが直前990でプレイ=マスター(昇格試合)');
  eq(m.get(b3), 'レジェンド', '1030は直前1010でプレイ=レジェンド');
  eq(F.aggRankTier(b2, m), 'マスター', 'aggRankTier はmap優先');
  // 降格した試合: 1005(負) -> 995。995 の試合は直前 1005 でプレイ＝レジェンド扱い。
  const d1={rank:'レート 1005',created_at:'2026-06-02T01:00:00Z'};
  const d2={rank:'レート 995', created_at:'2026-06-02T02:00:00Z'};
  const dm=F.buildPlayedTierMap([d1,d2]);
  eq(dm.get(d2), 'レジェンド', '995だが直前1005でプレイ=レジェンド(降格試合)');
  // クラス帯(ビギナー〜エキスパート)も同じルールで補正される
  const c1={rank:'エリート・C1',      created_at:'2026-06-03T01:00:00Z'};
  const c2={rank:'エキスパート・C5',  created_at:'2026-06-03T02:00:00Z'};
  const cm=F.buildPlayedTierMap([c1,c2]);
  eq(cm.get(c1), 'エリート', 'シリーズ最初のクラス記録は自身で判定');
  eq(cm.get(c2), 'エリート', 'エキスパート記録だが直前エリートでプレイ(昇格試合)');
  // クラス帯 → レート帯の昇格(エキスパート→マスター)もまたげる
  const e1={rank:'エキスパート・C1', created_at:'2026-06-04T01:00:00Z'};
  const e2={rank:'レート 0',         created_at:'2026-06-04T02:00:00Z'};
  const e3={rank:'レート 20',        created_at:'2026-06-04T03:00:00Z'};
  const em=F.buildPlayedTierMap([e1,e2,e3]);
  eq(em.get(e2), 'エキスパート', 'マスター記録だが直前エキスパートでプレイ(昇格試合)');
  eq(em.get(e3), 'マスター', '2戦目以降はマスター');
  // 下位帯も同様
  const g1={rank:'ビギナー・C1', created_at:'2026-06-05T01:00:00Z'};
  const g2={rank:'スーパー・C5', created_at:'2026-06-05T02:00:00Z'};
  eq(F.buildPlayedTierMap([g1,g2]).get(g2), 'ビギナー', 'ビギナー→スーパー昇格も補正');
  // ランク未記録は map に載らず、aggRankTier は rankTier(=null)
  const n1={rank:null, created_at:'2026-06-06T01:00:00Z'};
  const nm=F.buildPlayedTierMap([n1]);
  eq(nm.has(n1), false, 'ランク未記録は playedMap に含めない');
  eq(F.aggRankTier(b2, null), 'レジェンド', 'map不在時は記録どおり rankTier(1010=レジェンド)');
}

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
eq(S['パルキア']?.role, 'All-Rounder', 'Palkia lab role is All-Rounder');
eq(S['パルキア']?.dmg, 'Special', 'Palkia lab damage type is Special');
eq([S['パルキア']?.hp[0], S['パルキア']?.hp[14]], [3480, 8300], 'Palkia HP matches source at lv1/lv15');
eq([S['パルキア']?.spatk[0], S['パルキア']?.spatk[14]], [118, 700], 'Palkia SpAtk matches source at lv1/lv15');
const palkiaLab = K['パルキア'] || [];
eq(palkiaLab.length, 12, 'Palkia has 12 lab ratio rows');
const palkiaAura = palkiaLab.find(r => r.name === 'はどうだん' && r.dmgType === 'ダメージ');
eq([palkiaAura?.coeff, palkiaAura?.fixed, palkiaAura?.lvScale], [96, 288, 0], 'Aura Sphere main ratio is present');
eq(palkiaLab.find(r => r.name === 'アクアリング' && r.dmgType === '回復')?.hits, 4, 'Aqua Ring healing uses 4 hits');
eq(palkiaLab.find(r => r.name === 'きりさく')?.hits, 2, 'Slash uses 2 hits');
eq([palkiaLab.find(r => r.dmgType === 'ダメージ - 連続斬り')?.hits, palkiaLab.find(r => r.dmgType === 'ダメージ - 連続斬り')?.hitsVar], [7, true], 'Palkia Unite flurry is variable up to 7 hits');
eq([palkiaLab.find(r => r.dmgType === 'ダメージ - 最終段')?.coeff, palkiaLab.find(r => r.dmgType === 'ダメージ - 最終段')?.fixed], [108, 325], 'Palkia Unite final-hit ratio is present');

// ---- 定数データの整合性（js/constants.js） ----
section('constants integrity');
const allPoke = Object.values(F.POKEMON_DATA).flatMap(t => t.pokemon);
ok(allPoke.length === new Set(allPoke).size, 'POKEMON_DATA has no duplicates');
eq(Object.keys(F.RANK_STYLE).sort(), F.RANKS.slice().sort(), 'RANK_STYLE keys match RANKS');
const dedicatedUnknown = Object.keys(F.DEDICATED_ITEMS).filter(p => !allPoke.includes(p));
ok(dedicatedUnknown.length === 0, `DEDICATED_ITEMS pokemon all in POKEMON_DATA (bad: ${dedicatedUnknown.join(', ')})`);
const skillsUnknown = Object.keys(F.SKILLS).filter(p => !allPoke.includes(p));
ok(skillsUnknown.length === 0, `SKILLS pokemon all in POKEMON_DATA (bad: ${skillsUnknown.slice(0, 5).join(', ')})`);
ok(F.POKEMON_DATA.bal.pokemon.includes('パルキア'), 'Palkia is in the All-Rounder battle roster');
eq(F.ICON_ID['パルキア'], 484, 'Palkia uses National Pokédex icon 484');
eq(F.SKILLS['パルキア'], {s1:['はどうだん'], s2:['ドラゴンクロー']}, 'Palkia battle moves are selectable');

// ---- アプリシェル資産の整合性（ファイル分割後の参照切れ検知） ----
section('app shell assets');
const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const labCoreTag = '<script src="js/lab-core.js"></script>';
ok(indexSrc.includes(labCoreTag) && indexSrc.indexOf(labCoreTag) < indexSrc.indexOf('<script>'),
  'lab-core.js loads before the inline application script');
ok(!/function\s+(?:computeStats|dcCalcActual)\s*\(/.test(indexSrc),
  'lab core functions are not duplicated in index.html');
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
// GitHub Pages の公開ルートへバックアップ HTML が再混入しないこと
const backupHtml = fs.readdirSync(ROOT)
  .filter(name => /\.html$/i.test(name) && /backup|\.bak(?:\.|$)/i.test(name));
ok(backupHtml.length === 0, `no backup HTML in publish root (found: ${backupHtml.join(', ')})`);

// GitHub Pages のプロジェクト配下でも、インストール後の起動先とscopeがアプリ直下を指すこと。
const manifestUrl = 'https://example.test/pokemon-unite-tracker/manifest.json';
eq(new URL(manifest.start_url, manifestUrl).pathname, '/pokemon-unite-tracker/', 'manifest start_url resolves to project root');
eq(new URL(manifest.scope, manifestUrl).pathname, '/pokemon-unite-tracker/', 'manifest scope resolves to project root');
const pngSize = rel => {
  const b = fs.readFileSync(path.join(ROOT, rel));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const iconBySize = Object.fromEntries((manifest.icons || []).map(icon => [icon.sizes, icon.src]));
eq(pngSize(iconBySize['192x192']), [192, 192], 'manifest 192px icon has matching PNG dimensions');
eq(pngSize(iconBySize['512x512']), [512, 512], 'manifest 512px icon has matching PNG dimensions');
ok(swSrc.includes(iconBySize['192x192']) && swSrc.includes(iconBySize['512x512']), 'manifest icons are precached in sw.js');
eq((indexSrc.match(/sbFetchAll\(\(f,t\)=>db\.from\('series'\)/g) || []).length, 3,
  'all three full-series reads use sbFetchAll pagination');

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

// ---- sbFetchAll（Supabase 1000行上限のページング取得）: 非同期のため最後にまとめて実行 ----
(async () => {
  // ---- SW activate（旧キャッシュ削除） ----
  section('sw activate cache cleanup');
  const vm = require('vm');
  const swHandlers = {};
  const deletedCaches = [];
  let clientsClaimed = false;
  const currentCache = (swSrc.match(/CACHE\s*=\s*'([^']+)'/) || [])[1];
  const swContext = {
    self: {
      addEventListener: (type, handler) => { swHandlers[type] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => { clientsClaimed = true; } },
      location: { origin: 'http://127.0.0.1' },
    },
    caches: {
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      keys: async () => ['unite-tracker-v55', currentCache],
      delete: async key => { deletedCaches.push(key); return true; },
      match: async () => undefined,
    },
    fetch: async () => { throw new Error('fetch must not run during activate'); },
    URL,
    Promise,
  };
  vm.runInNewContext(swSrc, swContext, { filename: 'sw.js' });
  let activateWork;
  swHandlers.activate({ waitUntil: promise => { activateWork = promise; } });
  await activateWork;
  ok(currentCache && currentCache !== 'unite-tracker-v55', `SW cache version bumped from v55 (current: ${currentCache})`);
  ok(deletedCaches.includes('unite-tracker-v55'), 'activate deletes unite-tracker-v55');
  ok(!deletedCaches.includes(currentCache), `activate retains current cache (${currentCache})`);
  ok(clientsClaimed, 'activate claims clients after cache cleanup');

  section('sbFetchAll (pagination)');
  // 総数 total 件の行(0..total-1)を返すモック。呼び出し回数も数える。
  const mock = (total) => {
    let calls = 0;
    const q = (from, to) => {
      calls++;
      const end = Math.min(total, to + 1);
      const data = from >= total ? [] : Array.from({length: end - from}, (_, i) => from + i);
      return Promise.resolve({data, error: null});
    };
    return {q, calls: () => calls};
  };
  {
    const m = mock(2500);
    const {data, error} = await F.sbFetchAll(m.q);
    eq(data.length, 2500, '2500行を全件取得（1000上限を跨ぐ）');
    eq(data[2499], 2499, '最終行まで欠落なし');
    eq(m.calls(), 3, '2500行は3ページで取得');
    eq(error, null, 'エラーなし');
  }
  {
    const m = mock(1000);
    const {data} = await F.sbFetchAll(m.q);
    eq(data.length, 1000, 'ちょうど1000行も全件');
    eq(m.calls(), 2, '境界値は2ページ目(空)で終了');
  }
  {
    const m = mock(1001);
    const {data} = await F.sbFetchAll(m.q);
    eq(data.length, 1001, 'series想定の1001行を欠落なく全件取得');
    eq(data[1000], 1000, 'series想定の1001件目を保持');
    eq(m.calls(), 2, '1001行は2ページで取得');
  }
  {
    const m = mock(135);
    const {data} = await F.sbFetchAll(m.q);
    eq(data.length, 135, '1000未満は1ページ');
    eq(m.calls(), 1, '1000未満はクエリ1回');
  }
  {
    // 2ページ目でエラー → error非null・dataは部分集合
    let calls = 0;
    const q = () => { calls++; return Promise.resolve(calls === 1
      ? {data: Array.from({length: 1000}, (_, i) => i), error: null}
      : {data: null, error: {message: 'boom'}}); };
    const {data, error} = await F.sbFetchAll(q);
    eq(!!error, true, '途中ページのエラーを伝播');
    eq(data.length, 1000, 'エラー時のdataはそこまでの部分集合');
  }

  // ---- 結果 ----
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
