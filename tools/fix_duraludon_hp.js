// ジュラルドンのHPを unite-db/wikiwiki 準拠の現行値に修正（一回限り）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const file = path.join(ROOT, 'lab_data.js');
let src = fs.readFileSync(file, 'utf8');

const oldStr = 'ジュラルドン":{"role":"Attacker","dmg":"Physical","hp":[3000,3085,3179,3282,3395,3520,3657,3808,3975,4159,4362,4585,4830,5100,5397]';
const newHp = [3200,3300,3410,3531,3664,3811,3972,4149,4344,4559,4795,5054,5340,5654,6000];
const newStr = 'ジュラルドン":{"role":"Attacker","dmg":"Physical","hp":[' + newHp.join(',') + ']';

const count = src.split(oldStr).length - 1;
if (count !== 1) { console.error('ABORT: 一意特定できず (出現回数=' + count + ')'); process.exit(1); }

const updated = src.replace(oldStr, newStr);

// 検証: eval して値を確認
eval(updated.replace(/const LAB_/g, 'globalThis.LAB_'));
const hp = globalThis.LAB_STATUS['ジュラルドン'].hp;
if (JSON.stringify(hp) !== JSON.stringify(newHp)) { console.error('ABORT: 反映後の値が不一致', hp); process.exit(1); }
// 他ポケ数が変わっていないこと
const n = Object.keys(globalThis.LAB_STATUS).length;
if (n !== 94) { console.error('ABORT: ポケモン数が変化 ' + n); process.exit(1); }

fs.writeFileSync(file, updated);
console.log('OK ジュラルドンHP更新: ' + JSON.stringify(hp) + ' / ポケ数=' + n);
