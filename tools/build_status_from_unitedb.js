// Unite-DBのLv1-15ステータスCSVを正本として LAB_STATUS を更新する。
// 既定はドライラン。書き込みは --apply。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

function parseCSV(text){
  const rows=[]; let i=0,f='',row=[],q=false;
  for(;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(f);f='';} else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';} else if(c!=='\r')f+=c; }
  }
  if(f.length||row.length){row.push(f);rows.push(row);}
  return rows;
}

const num=v=>{ const n=parseFloat(String(v??'').replace(/,/g,'')); return Number.isFinite(n)?n:null; };
const EN2JP={
  'Absol':'アブソル','Aegislash':'ギルガルド','Alcremie':'マホイップ','Armarouge':'グレンアルマ',
  'Articuno':'フリーザー','Azumarill':'マリルリ','Blastoise':'カメックス','Blaziken':'バシャーモ',
  'Blissey':'ハピナス','Buzzwole':'マッシブーン','Ceruledge':'ソウブレイズ','Chandelure':'シャンデラ',
  'Charizard':'リザードン','Cinderace':'エースバーン','Clefable':'ピクシー','Comfey':'キュワワー',
  'Cramorant':'ウッウ','Crustle':'イワパレス','Darkrai':'ダークライ','Decidueye':'ジュナイパー',
  'Delphox':'マフォクシー','Dhelmise':'ダダリン','Dodrio':'ドードリオ','Dragapult':'ドラパルト',
  'Dragonite':'カイリュー','Duraludon':'ジュラルドン','Eldegoss':'ワタシラガ','Empoleon':'エンペルト',
  'Espeon':'エーフィ','Falinks':'タイレーツ','Feraligatr':'オーダイル','Garchomp':'ガブリアス',
  'Gardevoir':'サーナイト','Gengar':'ゲンガー','Glaceon':'グレイシア','Goodra':'ヌメルゴン',
  'Greedent':'ヨクバリス','Greninja':'ゲッコウガ','Gyarados':'ギャラドス','Ho-Oh':'ホウオウ',
  'Hoopa':'フーパ','Inteleon':'インテレオン','Lapras':'ラプラス','Latias':'ラティアス',
  'Latios':'ラティオス','Leafeon':'リーフィア','Lucario':'ルカリオ','Machamp':'カイリキー',
  'Mamoswine':'マンムー','Mega-Charizard-X':'メガリザードンX','Mega-Charizard-Y':'メガリザードンY',
  'Mega-Gyarados':'メガギャラドス','Mega-Lucario':'メガルカリオ','MewtwoX':'ミュウツーX',
  'MewtwoY':'ミュウツーY','Meganium':'メガニウム','Meowscarada':'マスカーニャ','Meowth':'ニャース',
  'Metagross':'メタグロス','Mew':'ミュウ','Mimikyu':'ミミッキュ','Miraidon':'ミライドン',
  'Moltres':'ファイヤー','Mr.Mime':'バリヤード','Ninetales':'アローラキュウコン','Palkia':'パルキア','Pawmot':'パーモット',
  'Pikachu':'ピカチュウ','Psyduck':'コダック','Raichu':'アローラライチュウ','Rapidash':'ガラルギャロップ',
  'Reshiram':'レシラム','Sableye':'ヤミラミ','Scizor':'ハッサム','Scyther':'ストライク','Sirfetchd':'ネギガナイト',
  'Skeledirge':'ラウドボーン','Slowbro':'ヤドラン','Snorlax':'カビゴン','Suicune':'スイクン',
  'Sylveon':'ニンフィア','Talonflame':'ファイアロー','Tinkaton':'デカヌチャン','Trevenant':'オーロット',
  'Tsareena':'アマージョ','Typhlosion':'バクフーン','Tyranitar':'バンギラス','Umbreon':'ブラッキー',
  'Urshifu':'ウーラオス','Vaporeon':'シャワーズ','Venusaur':'フシギバナ','Wigglytuff':'プクリン',
  'Zacian':'ザシアン','Zapdos':'サンダー','Zeraora':'ゼラオラ','Zoroark':'ゾロアーク',
  'Quaquaval':'ウェーニバル','Yveltal':'イベルタル'
};

const rows=parseCSV(fs.readFileSync(path.join(ROOT,'data','unitedb_stats.csv'),'utf8'));
const head=rows[0]; const col={}; head.forEach((h,i)=>col[h]=i);
const required=['pokemon_name','level','hp','attack','defense','sp_attack','sp_defense','move_speed','role','damage_type'];
const missingHeaders=required.filter(h=>col[h]==null);
if(missingHeaders.length){ console.error('ABORT: ステータスCSVの必須列不足: '+missingHeaders.join(',')); process.exit(1); }

const grouped={};
for(let i=1;i<rows.length;i++){
  const row=rows[i], en=row[col.pokemon_name]; if(!en)continue;
  (grouped[en]=grouped[en]||[]).push(row);
}
const unmapped=Object.keys(grouped).filter(en=>!EN2JP[en]);
if(unmapped.length){ console.error('ABORT: 日本語名対応なし: '+unmapped.join(',')); process.exit(1); }

const canonical={};
for(const [en,sourceRows] of Object.entries(grouped)){
  const byLevel=new Map();
  for(const row of sourceRows){ const level=num(row[col.level]); if(level!=null)byLevel.set(level,row); }
  if(byLevel.size!==15 || [...Array(15)].some((_,i)=>!byLevel.has(i+1))){
    console.error(`ABORT: ${en} のLv1-15が不完全 (${byLevel.size}/15)`); process.exit(1);
  }
  const jp=EN2JP[en], ordered=[...Array(15)].map((_,i)=>byLevel.get(i+1));
  const values=key=>ordered.map(row=>num(row[col[key]]));
  const entry={
    role:ordered[0][col.role], dmg:ordered[0][col.damage_type],
    hp:values('hp'), atk:values('attack'), def:values('defense'),
    spatk:values('sp_attack'), spdef:values('sp_defense'), ms:values('move_speed')
  };
  if(Object.values(entry).some(v=>Array.isArray(v)&&v.some(n=>n==null))){
    console.error(`ABORT: ${en} に数値欠損`); process.exit(1);
  }
  canonical[jp]=entry;
}
if(Object.keys(canonical).length!==98){ console.error('ABORT: 正本ポケモン数が98ではない: '+Object.keys(canonical).length); process.exit(1); }

const labPath=path.join(ROOT,'lab_data.js');
const labSrc=fs.readFileSync(labPath,'utf8');
const ctx={};(function(){const globalThis=ctx;eval(labSrc.replace(/const LAB_/g,'globalThis.LAB_'));})();
const current=ctx.LAB_STATUS;
const changed=Object.keys(canonical).filter(p=>JSON.stringify(current[p])!==JSON.stringify(canonical[p]));
console.log(`=== ステータス正本比較 ===`);
console.log(`正本: ${Object.keys(canonical).length}匹 / 現行差分: ${changed.length}匹`);
if(changed.length)console.log('差分: '+changed.join('、'));
if(!APPLY){ console.log('\n(ドライラン。--apply で lab_data.js に書き込み)'); process.exit(changed.length===0?0:1); }

const decl='const LAB_STATUS='; const start=labSrc.indexOf(decl);
if(start<0){ console.error('ABORT: LAB_STATUS宣言が見つからない'); process.exit(1); }
let i=labSrc.indexOf('{',start),depth=0,quote=null,end=-1;
for(;i<labSrc.length;i++){ const c=labSrc[i]; if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;} if(c==='"'||c==="'"||c==='`'){quote=c;continue;} if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0){end=i+1;break;}} }
if(end<0){ console.error('ABORT: LAB_STATUS範囲特定失敗'); process.exit(1); }
const updated=labSrc.slice(0,labSrc.indexOf('{',start))+JSON.stringify(canonical)+labSrc.slice(end);
fs.writeFileSync(labPath,updated);
console.log(`OK 適用完了: ${Object.keys(canonical).length}匹（差分 ${changed.length}匹）`);
