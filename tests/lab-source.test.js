// 出典成分キーを使った追加データ照合。生成器の行順マッピングは使わない。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
function csv(file){
  const text=fs.readFileSync(path.join(ROOT,file),'utf8');let quoted=false,field='',row=[],rows=[];
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(field);field='';if(c==='\n'){rows.push(row);row=[];}}
    else if(c!=='\r')field+=c;}
  if(field||row.length){row.push(field);rows.push(row);}const h=rows.shift();return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));
}
const {S,K}=new Function(fs.readFileSync(path.join(ROOT,'lab_data.js'),'utf8')+';return {S:LAB_STATUS,K:LAB_SKILLS}')();
const source=csv('data/unitedb_ratios.csv'),stats=csv('data/unitedb_stats.csv');
const num=v=>Number(String(v||0).replaceAll(',',''));
const key=r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|');
let checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
let linked=0;
for(const [p,rows] of Object.entries(K))for(const r of rows.filter(r=>r.sourceKey)){
  const found=source.filter(s=>key(s)===r.sourceKey&&['ratio_percent','base_value','level_scaling'].some(k=>s[k]!==''));
  eq(found.length,1,p+'/'+r.name+' unique source');const s=found[0];
  eq([r.coeff,r.fixed,r.lvScale],[num(s.ratio_percent),num(s.base_value),num(s.level_scaling)],r.sourceKey);
  eq(r.stat,s.stat_type==='SpAtk'?'特攻':'攻撃','scaling stat');linked++;
}
eq(linked,31,'27 source components plus 4 carried upgrade components');
const mor=stats.filter(r=>r.pokemon_name==='Morpeko').sort((a,b)=>num(a.level)-num(b.level));
eq(mor.map(r=>num(r.level)),Array.from({length:15},(_,i)=>i+1),'complete Morpeko levels');
for(const [dest,src] of Object.entries({hp:'hp',atk:'attack',def:'defense',spatk:'sp_attack',spdef:'sp_defense',ms:'move_speed'}))eq(S['モルペコ'][dest],mor.map(r=>num(r[src])),dest);
eq(S['モルペコ'].dmg,'Physical','user-approved damage type');
eq(mor.every(r=>r.damage_type===''),true,'source blank preserved');
eq(K['モルペコ'].length,15,'Morpeko complete lab structure');
for(const [name,lv] of Object.entries({'スパーク':'5','スパーク+':'11','ダメおし':'7','ダメおし+':'13','ハラペコ超電ホイール':'9'}))eq(K['モルペコ'].filter(r=>r.name===name).map(r=>r.upg),[lv,lv],name+' user levels');
eq(K['ピクシー'].filter(r=>r.sourceKey?.includes('|Unite Move|')).map(r=>r.hits),[1,3,1,7,7,1],'Clefable per-hit counts');
eq(K['フーパ'].filter(r=>r.sourceKey?.includes('|Unite Move|')).map(r=>r.hits),[1,7,1],'Hoopa per-hit counts');
const cds={'マッシブーン':{'ばかぢから':7.5},'キュワワー':{'てんしのキッス':7},'イワパレス':{'ユナイトわざ':123},'ドードリオ':{'とびげり':6,'ユナイトわざ':123},'ジュラルドン':{'ラスターカノン':6,'ユナイトわざ':123},'オーダイル':{'たきのぼり':7.5},'ガブリアス':{'ドラゴンダイブ':6,'ドラゴンクロー':5},'ヨクバリス':{'ユナイトわざ':112}};
for(const [p,moves] of Object.entries(cds))for(const [name,cd] of Object.entries(moves)){
  const rows=K[p].filter(r=>r.slot===name||r.name.replace(/[+＋]$/,'')===name);eq(rows.length>0,true,p+name+' exists');eq(rows.every(r=>r.cd===cd),true,p+name+' cooldown');
}
console.log('ALL PASS — '+checks+' source checks');
