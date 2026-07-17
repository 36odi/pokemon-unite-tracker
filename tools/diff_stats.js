// unite-db CSV と ツール lab_data.js のステータス差分照合（一回限りの検証ツール）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- 英語(unite-db) -> 日本語(ツール) 名称対応 ----
const EN2JP = {
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
  'Mamoswine':'マンムー','Mega Charizard X':'メガリザードンX','Mega Charizard Y':'メガリザードンY',
  'Mega Gyarados':'メガギャラドス','Mega Lucario':'メガルカリオ','Mega Mewtwo X':'ミュウツーX',
  'Mega Mewtwo Y':'ミュウツーY','Meganium':'メガニウム','Meowscarada':'マスカーニャ','Meowth':'ニャース',
  'Metagross':'メタグロス','Mew':'ミュウ','Mimikyu':'ミミッキュ','Miraidon':'ミライドン',
  'Moltres':'ファイヤー','Mr. Mime':'バリヤード','Ninetales':'アローラキュウコン','Pawmot':'パーモット',
  'Pikachu':'ピカチュウ','Psyduck':'コダック','Raichu':'アローラライチュウ','Rapidash':'ガラルギャロップ',
  'Sableye':'ヤミラミ','Scizor':'ハッサム','Scyther':'ストライク',"Sirfetch'd":'ネギガナイト',
  'Skeledirge':'ラウドボーン','Slowbro':'ヤドラン','Snorlax':'カビゴン','Suicune':'スイクン',
  'Sylveon':'ニンフィア','Talonflame':'ファイアロー','Tinkaton':'デカヌチャン','Trevenant':'オーロット',
  'Tsareena':'アマージョ','Typhlosion':'バクフーン','Tyranitar':'バンギラス','Umbreon':'ブラッキー',
  'Urshifu':'ウーラオス','Vaporeon':'シャワーズ','Venusaur':'フシギバナ','Wigglytuff':'プクリン',
  'Zacian':'ザシアン','Zapdos':'サンダー','Zeraora':'ゼラオラ','Zoroark':'ゾロアーク',
  'Quaquaval':'ウェーニバル','Yveltal':'イベルタル'
};

// ---- CSV パース（クォート対応）----
function parseCSV(text){
  const rows=[]; let i=0,f='',row=[],q=false;
  for(;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(f);f='';} else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';} else if(c==='\r'){} else f+=c; }
  }
  if(f.length||row.length){row.push(f);rows.push(row);}
  return rows;
}

const csvText=fs.readFileSync(path.join(ROOT,'data','unitedb_stats.csv'),'utf8');
const rows=parseCSV(csvText).filter(r=>r.length>=14 && r[0]!=='pokemon_id');
// csv[en][level] = {hp,atk,def,spatk,spdef,ms}
const csv={};
const lastUpd={};
// シートの数値エクスポートが「3,000.」形式(カンマ区切り+末尾ドット)になることがあるためカンマを除去してから解釈
const num=v=>{ const n=parseFloat(String(v??'').replace(/,/g,'')); return isNaN(n)?0:n; };
for(const r of rows){
  const en=r[2], lv=num(r[3]);
  if(!csv[en])csv[en]={};
  csv[en][lv]={hp:num(r[4]),atk:num(r[5]),def:num(r[6]),spatk:num(r[7]),spdef:num(r[8]),ms:num(r[13])};
  lastUpd[en]=r[21];
}

// ---- ツール lab_data ----
const lab=fs.readFileSync(path.join(ROOT,'lab_data.js'),'utf8').replace(/const LAB_/g,'globalThis.LAB_');
eval(lab);

const STAT=['hp','atk','def','spatk','spdef','ms'];
const results=[]; const unmatched=[]; const mismatchSummary=[];

for(const en of Object.keys(csv)){
  const jp=EN2JP[en];
  if(!jp || !LAB_STATUS[jp]){ unmatched.push(en+(jp?(' -> '+jp+'(ツールに無し)'):' (対応表に無し)')); continue; }
  const t=LAB_STATUS[jp];
  let diffs=[]; let bigDiff=false;
  for(let lv=1;lv<=15;lv++){
    const c=csv[en][lv]; if(!c)continue;
    for(const s of STAT){
      const tv=t[s][lv-1], cv=c[s];
      if(tv!==cv){
        diffs.push({lv,s,tool:tv,db:cv});
        if(Math.abs(tv-cv) > Math.max(50, cv*0.15)) bigDiff=true;
      }
    }
  }
  if(diffs.length){
    mismatchSummary.push({en,jp,n:diffs.length,bigDiff,diffs});
  }
  results.push({en,jp,ok:diffs.length===0});
}

// ---- 出力 ----
const matched=results.length;
const clean=results.filter(r=>r.ok).length;
console.log('照合できたポケモン: '+matched+' / 一致(差分ゼロ): '+clean+' / 差分あり: '+(matched-clean));
console.log('対応できなかった項目: '+unmatched.length+(unmatched.length?(' -> '+unmatched.join(' , ')):''));
console.log('');

// 大差（対応ミス候補）と 小差（実データ差分）を分離
const big=mismatchSummary.filter(m=>m.bigDiff);
const small=mismatchSummary.filter(m=>!m.bigDiff);

if(big.length){
  console.log('=== 【大差】対応ミス or 重大不一致の候補 ('+big.length+') ===');
  for(const m of big){
    const ex=m.diffs.slice(0,3).map(d=>`Lv${d.lv}.${d.s} tool=${d.tool}/db=${d.db}`).join(' , ');
    console.log(`  ${m.en} (${m.jp}): ${m.n}箇所差分 例: ${ex}`);
  }
  console.log('');
}

if(small.length){
  console.log('=== 【小差】ツールとunite-dbの実データ差分 ('+small.length+') ===');
  for(const m of small){
    console.log(`\n■ ${m.en} (${m.jp}) — ${m.n}箇所 [unite-db更新:${lastUpd[m.en]}]`);
    // ステータス別に集約表示
    const byStat={};
    for(const d of m.diffs){ (byStat[d.s]=byStat[d.s]||[]).push(d); }
    for(const s of Object.keys(byStat)){
      const arr=byStat[s];
      const lvs=arr.map(d=>`Lv${d.lv}:${d.tool}->${d.db}`).join(', ');
      console.log(`    ${s}: ${lvs}`);
    }
  }
} else {
  console.log('小差（実データ差分）はありませんでした。');
}
