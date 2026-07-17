#!/usr/bin/env node
// 全CSVをJavaScript定数に変換するスクリプト
const fs = require('fs');
const path = require('path');

const TMP = 'C:/Users/ishgo/AppData/Local/Temp';

function readCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const rows = [];
  let cells = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      cells.push(cur); cur = '';
    } else if ((c === '\r' || c === '\n') && !inQ) {
      cells.push(cur); cur = '';
      if (cells.length > 1 || cells[0] !== '') rows.push([...cells]);
      cells = [];
      if (c === '\r' && text[i+1] === '\n') i++;
    } else cur += c;
  }
  if (cur || cells.length) { cells.push(cur); rows.push(cells); }
  return rows;
}

// シートの数値エクスポートが「1,040.」形式(カンマ区切り+末尾ドット)になることがあるためカンマを除去してから解釈
function toNum(s) {
  if (!s || !s.trim()) return null;
  const v = parseFloat(s.trim().replace(/,/g, '').replace(/%$/, ''));
  return isNaN(v) ? null : v;
}

function parseStatStr(s) {
  const res = {};
  if (!s || !s.trim()) return res;
  s.replace(/,/g, '').split('/').forEach(part => {
    const m = part.trim().match(/^(.+?)([+-]\d*\.?\d+)(%?)$/);
    if (m) res[m[1].trim()] = parseFloat(m[2]);
  });
  return res;
}

// ========================
// sheet2: もちもの
// ========================
const itemRows = readCSV(`${TMP}/sheet2_items.csv`);
const LAB_ITEMS = {};
for (let i = 1; i < itemRows.length; i++) {
  const row = itemRows[i];
  if (!row || !row[0] || !row[0].trim()) continue;
  const name = row[0].trim();
  const grades = [];
  for (let g = 1; g <= 40; g++) {
    const col = 5 + g;
    grades.push(parseStatStr(row[col] || ''));
  }
  LAB_ITEMS[name] = grades;
}
console.error(`もちもの: ${Object.keys(LAB_ITEMS).length}個`);

// ========================
// sheet3: スキル
// ========================
const skillRows = readCSV(`${TMP}/sheet3_skills.csv`);
const LAB_SKILLS = {};
for (let i = 1; i < skillRows.length; i++) {
  const row = skillRows[i];
  if (!row || !row[0] || !row[0].trim()) continue;
  const poke = row[0].trim();
  // 列: 0=ポケモン名 1=スロット 2=わざ名 3=ダメージ種別 4=アップグレードLv
  //      5=ステータス種別 6=係数 7=固定値 8=lvScale 9=ヒット数 10=ヒット数_可変 11=CD
  const entry = {
    slot:    (row[1]||'').trim(),
    name:    (row[2]||'').trim(),
    dmgType: (row[3]||'').trim(),
    upg:     (row[4]||'').trim(),
    stat:    (row[5]||'').trim(),
    coeff:   toNum(row[6]),
    fixed:   toNum(row[7]) ?? 0,
    lvScale: toNum(row[8]) ?? 0,
    hits:    toNum(row[9]) ?? 1,
    hitsVar: (row[10]||'').trim().toUpperCase() === 'TRUE',
    cd:      toNum(row[11]),
  };
  if (!LAB_SKILLS[poke]) LAB_SKILLS[poke] = [];
  LAB_SKILLS[poke].push(entry);
}
console.error(`スキルポケモン: ${Object.keys(LAB_SKILLS).length}匹`);

// ========================
// sheet4: ステータス
// ========================
const statRows = readCSV(`${TMP}/sheet4_status.csv`);
const hdr4 = statRows[0].map(h => h.trim());
const statusByPoke = {};
for (let i = 1; i < statRows.length; i++) {
  const row = statRows[i];
  if (!row || !row[0] || !row[0].trim()) continue;
  const poke = row[0].trim();
  const obj = {};
  hdr4.forEach((h, idx) => { obj[h] = (row[idx] || '').trim(); });
  if (!statusByPoke[poke]) statusByPoke[poke] = [];
  statusByPoke[poke].push(obj);
}

const LAB_STATUS = {};
for (const [poke, rows] of Object.entries(statusByPoke)) {
  rows.sort((a, b) => parseInt(a.level||0) - parseInt(b.level||0));
  const hp=[], atk=[], def=[], spatk=[], spdef=[], ms=[];
  const role = rows[0]?.role || '';
  const dmg  = rows[0]?.damage_type || '';
  for (const r of rows) {
    hp.push(toNum(r.hp) ?? 0);
    atk.push(toNum(r.attack) ?? 0);
    def.push(toNum(r.defense) ?? 0);
    spatk.push(toNum(r.sp_attack) ?? 0);
    spdef.push(toNum(r.sp_defense) ?? 0);
    ms.push(toNum(r.move_speed) ?? 0);
  }
  LAB_STATUS[poke] = { role, dmg, hp, atk, def, spatk, spdef, ms };
}
console.error(`ステータスポケモン: ${Object.keys(LAB_STATUS).length}匹`);

// ========================
// sheet1: メダル
// ========================
const medalRows = readCSV(`${TMP}/sheet1_medal.csv`);

// セット効果: 行1-11
const LAB_MEDAL_SETS = {};
for (let i = 1; i <= 11 && i < medalRows.length; i++) {
  const row = medalRows[i];
  if (!row || !row[0] || !row[0].trim()) continue;
  const color = row[0].trim();
  const target = (row[1]||'').trim();
  if (!color || !target) continue;
  const tiers = [];
  for (let t = 0; t < 3; t++) {
    const cnt = toNum(row[2 + t*2]);
    const eff = (row[3 + t*2]||'').trim();
    if (cnt !== null && eff) {
      const isPct = eff.endsWith('%');
      const val = toNum(eff);
      tiers.push({ count: Math.round(cnt), target, val, isPct });
    }
  }
  if (tiers.length) LAB_MEDAL_SETS[color] = tiers;
}
console.error(`メダルセット: ${Object.keys(LAB_MEDAL_SETS).length}色`);

// メダルデータ
const MEDAL_HDR = 'メダル名';
// スキップ対象：色セット名・ヘッダー類・注釈行
const SKIP_NAMES = new Set([...Object.keys(LAB_MEDAL_SETS), '', '色', '効果対象']);
const LAB_MEDALS = [];
for (const row of medalRows) {
  if (!row || !row[0] || !row[0].trim()) continue;
  const name = row[0].trim();
  if (name === MEDAL_HDR) continue;
  if (SKIP_NAMES.has(name)) continue;
  if (name.includes('同じポケモン') || name.includes('レアリティ')) continue;
  // 色1列が「色」のセット効果ヘッダー行をスキップ
  if ((row[1]||'').trim() === '効果対象') continue;
  if (row.length < 7) continue;
  const color1 = (row[1]||'').trim();
  if (!name || !color1) continue;
  LAB_MEDALS.push({
    name,
    c1: color1,
    c2: (row[2]||'').trim() || null,
    upStat: (row[3]||'').trim(),
    bUp: toNum(row[4]),
    sUp: toNum(row[5]),
    gUp: toNum(row[6]),
    dnStat: (row[7]||'').trim(),
    bDn: toNum(row[8]),
    sDn: toNum(row[9]),
    gDn: toNum(row[10]),
    note: (row[11]||'').trim() || null
  });
}
console.error(`メダル: ${LAB_MEDALS.length}枚`);

// ========================
// JS出力
// ========================
const out = [
  '// ===== ラボデータ（スプレッドシートより自動生成）=====',
  `const LAB_MEDAL_SETS=${JSON.stringify(LAB_MEDAL_SETS)};`,
  `const LAB_MEDALS=${JSON.stringify(LAB_MEDALS)};`,
  `const LAB_ITEMS=${JSON.stringify(LAB_ITEMS)};`,
  `const LAB_SKILLS=${JSON.stringify(LAB_SKILLS)};`,
  `const LAB_STATUS=${JSON.stringify(LAB_STATUS)};`,
].join('\n');

const outPath = 'C:/Users/ishgo/Downloads/pokemon-unite-tracker/lab_data_generated.js';
const prodPath = 'C:/Users/ishgo/Downloads/pokemon-unite-tracker/lab_data.js';
fs.writeFileSync(outPath, out, 'utf-8');
fs.writeFileSync(prodPath, out, 'utf-8');
console.error(`生成完了: ${out.length} bytes → ${prodPath}`);

// ========================
// 案A: unite-db レシオでスキル数値(coeff/fixed/lvScale)を正本化
// data/unitedb_ratios.csv があれば、スプレッドシート由来の誤り(多段わざのlvScale等)を
// unite-db 準拠に上書きして確定する。詳細は tools/REGEN.md。
// ========================
const ROOT_DIR = 'C:/Users/ishgo/Downloads/pokemon-unite-tracker';
const ratiosCsv = `${ROOT_DIR}/data/unitedb_ratios.csv`;
if (fs.existsSync(ratiosCsv)) {
  try {
    require('child_process').execSync('node tools/build_skills_from_unitedb.js --apply',
      { cwd: ROOT_DIR, stdio: 'inherit' });
    console.error('unite-db レシオでスキル数値を正本化しました');
  } catch (e) {
    console.error('警告: unite-db 正本化に失敗（lab_data.js は生成済み）:', e.message);
  }
} else {
  console.error('警告: data/unitedb_ratios.csv が無いため unite-db 正本化をスキップ（多段わざのlvScaleが誤る可能性）');
}
