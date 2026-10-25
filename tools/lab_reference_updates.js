// 数値・条件・習得時点を出典キーで同期。未提供の＋CDを通常値で確定しない。
const metadata=require('../data/lab-reference-metadata.json');
const {key,num,norm,pokemon}=require('./lab-data-utils');
const slots={'Basic':'通常攻撃','Passive':'特性','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ'};
const plusMissing={'メガニウム':['くさむすび'],'ミュウ':['エレキボール','コーチング'],'パルキア':['はどうだん','ドラゴンクロー'],'ウェーニバル':['アクアブレイク'],'ラウドボーン':['バークアウト'],'イベルタル':['あくのはどう']};
function sync(SK,source,{additions=false}={}){
 const byKey=new Map(source.map(s=>[key(s),s]));let updated=0;
 for(const [p,rows]of Object.entries(SK))for(const r of rows){
  const s=r.sourceKey?byKey.get(r.sourceKey):null;
  if(r.sourceKey&&!s)throw Error('出典成分の削除を確認してください: '+r.sourceKey);
  if(s&&r.coeff!=null){const stat=s.stat_type.trim();r.stat=stat==='SpAtk'?'特攻':stat==='Atk'?'攻撃':stat;r.coeff=num(s.ratio_percent);r.lvScale=num(s.level_scaling);r.fixed=num(s.base_value);updated++;}
  const slot=s?.skill_slot||Object.keys(slots).find(k=>slots[k]===r.slot);
  const m=metadata.pokemon[p]?.moves.find(m=>m.slot===slot&&(s?m.sourceName===s.move_en:norm(m.name)===norm(r.name)));
  if(m){
   if(/[+＋]$/.test(r.name)){
    if(m.plusLevel!==null&&!(p==='ソルガレオ'&&['アイアンヘッド','サイコショック'].includes(norm(r.name))))r.upg=String(m.plusLevel);
    if(m.plusCD!==null){r.cd=m.plusCD;delete r.cdStatus;delete r.normalCD;}
    else{r.cd=null;r.cdStatus='unconfirmed';r.normalCD=m.cd;}
   }else{
    if(p==='ブラッキー'&&m.sourceName==='Fake Tears')r.upg='';
    else if(m.level!==null&&!(p==='ソルガレオ'&&r.slot==='ユナイトわざ'))r.upg=String(m.level);
    if(m.cd!==null)r.cd=m.cd;
   }
  }
  if(s){
   if(/Overheal Shield/.test(s.effect_label)){r.effectKind='shield';r.calculationStatus='conditional';r.calculationNotice='回復が最大HPを超えた分から発生するシールドです。表示式だけで実際の付与量を確定できないため、自動計算しません。';}
   if(['Absol|Move 1|Feint|rsb|base','Ceruledge|Move 2|Phantom Force|rsb|base','Ceruledge|Move 2|Phantom Force|rsb|enhanced'].includes(r.sourceKey)){
    r.defenseMode='ignore';r.componentNote='相手の防御とシールドを無視する攻撃です。防御によるダメージ軽減を適用しません。';
   }
   if(p==='ゼラオラ'&&s.move_en==='Discharge'&&s.ratio_component==='add2'){r.dmgType='追加ダメージ（まひした相手の引き寄せ）';r.componentNote='ほうでん終了時、まひした相手を引き寄せたときの追加1回分です。';}
  }
  if(p==='ピカチュウ'&&r.name==='かみなり+'){r.hits=7;r.hitsVar=true;}
  if(p==='フリーザー'&&r.name==='ふぶき+'&&r.coeff!=null)r.hits=8;
 }
 if(additions){
  for(const [p,names]of Object.entries(plusMissing))for(const name of names){
   if(SK[p].some(r=>r.name===name+'+'))continue;
   const m=metadata.pokemon[p].moves.find(m=>m.name===name);if(!m?.plusLevel)throw Error('＋版の習得根拠なし: '+p+'/'+name);
   for(const r of SK[p].filter(r=>r.name===name))SK[p].push({...r,name:name+'+',upg:String(m.plusLevel),cd:m.plusCD,cdStatus:m.plusCD===null?'unconfirmed':'known',normalCD:m.cd,supplement:'reference-variant'});
  }
  const block=source.find(s=>s.pokemon_en==='Clefable'&&s.move_en==='Block'&&s.ratio_component==='base');
  const splash=source.find(s=>s.pokemon_en==='Clefable'&&s.move_en==='Splash'&&s.ratio_component==='base');
  if(!block||!splash)throw Error('ピクシーの派生出典なし');
  if(!SK['ピクシー'].some(r=>r.name==='はねる'))SK['ピクシー'].push({slot:'ユナイトわざ',name:'はねる',dmgType:'効果',upg:'9',coeff:null,stat:'',fixed:0,lvScale:0,hits:1,hitsVar:false,cd:null,description:'はねますが、直接の攻撃効果はありません。使用後、ユナイトわざゲージが90%返却されます。',formulaText:true,sourceKey:key(splash),supplement:'reference-variant'});
  if(!SK['ピクシー'].some(r=>r.name==='とおせんぼう'))SK['ピクシー'].push({slot:'ユナイトわざ',name:'とおせんぼう',dmgType:'シールド',upg:'9',coeff:20,stat:'HP',fixed:500,lvScale:0,hits:1,hitsVar:false,cd:null,narrativeKey:key(block).replace(/base$/,'add1')+'|とおせんぼう',descriptionSources:[key(block),key(block).replace(/base$/,'add1')],componentNote:'4秒間、妨害無効になり、受けるダメージを25%減らします。壁に触れた相手を押し出し、0.8秒間行動不能にします。ゆびにねがいをから出る追加わざです。',supplement:'reference-variant'});
  require('./lab_narrative_updates')(SK,source);
  require('./lab_described_effects')(SK,source);
 }
 return {updated};
}
module.exports=sync;
