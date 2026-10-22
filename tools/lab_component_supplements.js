// 正本の数値成分と、本文で明示された後続倍率を補完する。元CSVを書き換えない。
const rules=require('../data/lab-component-rules.json');
const key=r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|');
const num=v=>Number(String(v||0).replaceAll(',',''));
const numeric=r=>['ratio_percent','base_value','level_scaling'].some(k=>r[k]!=='');
const norm=s=>s.normalize('NFKC').replace(/[+＋]$/,'').replace('大顎クラッシュバイド','大顎クラッシュバイト');
const pokemon=p=>p.replace('ミュウツー(X)','ミュウツーX').replace('ミュウツー(Y)','ミュウツーY');
const stat=r=>r.stat_type==='SpAtk'?'特攻':r.stat_type==='Atk'?'攻撃':r.stat_type;
const tuple=r=>[stat(r),num(r.ratio_percent),num(r.level_scaling),num(r.base_value)];
const equal=(r,s)=>JSON.stringify([r.stat,r.coeff,r.lvScale||0,r.fixed||0])===JSON.stringify(tuple(s));
const slots={'Basic':'通常攻撃','Passive':'特性','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ'};
const basicLabels={
 'Damage - Boosted':'ダメージ（強化攻撃）','Damage - Single Target Bonus':'追加ダメージ（強化攻撃が1体だけに命中）',
 'Damage - Boosted (Sword Stance)':'ダメージ（強化攻撃・ブレードフォルム）',
 'Damage - Boosted/Rapid Spin Boosted (3x)':'ダメージ（強化攻撃・こうそくスピン中も共通）',
 'Damage - Boosted (per Hit - 2 Hits)':'ダメージ（強化攻撃・1ヒットあたり）',
 'Healing - Boosted (per Hit - 2 Hits)':'回復（強化攻撃・1ヒットあたり）',
 'Damage - Boosted (Charcadet)':'ダメージ（強化攻撃・カルボウ）',
 'Damage - Boosted (x2) (Ceruledge)':'ダメージ（強化攻撃・ソウブレイズ）',
 'Damage - Burn (5 Ticks)':'やけどダメージ（強化攻撃・1回あたり）',
 'Damage - Additional to Charizard burned targets (4x)':'追加ダメージ（自分のわざでやけど状態の相手）',
 'Damage - Boosted (3x)':'ダメージ（強化攻撃・1ヒットあたり）',
 'Damage - Boosted (No Gauge)':'ダメージ（強化攻撃・ダッシュゲージが満タンでないとき）',
 'Damage - Boosted (Full Gauge)':'ダメージ（強化攻撃・ダッシュゲージ満タン時）',
 'Damage - Bonus':'追加ダメージ（わたが付いた相手）',
 'Attack Speed - % Increase':'攻撃速度の上昇率（強化攻撃）',
 'Damage - Boosted (Eevee)':'ダメージ（強化攻撃・イーブイ）','Damage - Boosted (Glaceon)':'ダメージ（強化攻撃・グレイシア）',
 'Damage - Boosted (Gyarados)':'ダメージ（強化攻撃・ギャラドス）','Damage - Boosted x3':'ダメージ（強化攻撃・1ヒットあたり）',
 'Additional Damage (Boosted by Chlorophyll)':'追加ダメージ（ようりょくそで強化）',
 'Damage - Boosted (2nd Hit)':'ダメージ（強化攻撃の2段目）','Damage - Boosted (Mega)':'ダメージ（強化攻撃・メガシンカ中）',
 'Damage - Mega':'ダメージ（メガシンカ中）','Damage - Boosted (2x)':'ダメージ（強化攻撃・1ヒットあたり）',
 'Damage - per tick':'ダメージ（強化攻撃・1ヒットあたり）','Damage - Frozen Bonus':'追加ダメージ（こおり状態の相手への強化攻撃）',
 'Damage - Boosted (Kubfu)':'ダメージ（強化攻撃・ダクマ）','Damage - Boosted (Single Strike)':'ダメージ（強化攻撃・いちげきのかた）',
 'Shield (Single Strike)':'シールド（強化攻撃・いちげきのかた）','Damage - Boosted (Rapid Strike, 2x)':'ダメージ（強化攻撃・れんげきのかた）',
};
function entry(r,label){return {slot:slots[r.skill_slot],name:r.move_ja,dmgType:label,upg:'',stat:stat(r),coeff:num(r.ratio_percent),lvScale:num(r.level_scaling),fixed:num(r.base_value),hits:1,hitsVar:false,cd:r.cooldown===''?null:num(r.cooldown),sourceKey:key(r),supplement:'numeric'};}
function apply(SK,source){
 // 追加分は毎回正本から再構築し、複製や古い倍率の残留を防ぐ。
 for(const rows of Object.values(SK))for(let i=rows.length-1;i>=0;i--)if(rows[i].supplement)rows.splice(i,1);
 for(const r of SK['ハッサム']){
  if(norm(r.name)==='ダブルウイング')r.name=r.name.replace('ダブルウイング','バレットパンチ');
  if(r.name==='グリーンスターダイブ')r.name='レッドスターダイブ';
 }
 let addedNumeric=0,derived=0;
 for(const s of source.filter(r=>r.skill_slot==='Basic'&&numeric(r))){
  const p=pokemon(s.pokemon_ja),rows=SK[p];if(!rows)continue;
  if(rows.some(r=>r.slot==='通常攻撃'&&(r.sourceKey===key(s)||equal(r,s))))continue;
  const label=basicLabels[s.effect_label];if(!label)throw Error('通常攻撃ラベル未登録: '+key(s)+' '+s.effect_label);
  const r=entry(s,label),h=s.effect_label.match(/\((\d+)x\)|\(x(\d+)\)|\((\d+) Ticks\)|[ -](\d+) Hits\)| x(\d+)$/);
  r.hits=h?Number(h.slice(1).find(Boolean)):1;
  r.effectKind=/Heal/.test(s.effect_label)?'heal':/Shield/.test(s.effect_label)?'shield':/Attack Speed/.test(s.effect_label)?'stat':'damage';
  if(/Attack Speed/.test(s.effect_label)){r.dmgType='攻撃速度の上昇率（強化攻撃）';r.effectUnit='%';}
  rows.push(r);addedNumeric++;
 }
 const y=source.find(r=>r.pokemon_en==='Yveltal'&&r.move_en==='Oblivion Wing'&&r.ratio_component==='enhanced');
 if(!y||!numeric(y))throw Error('デスウイング＋の正本なし');
 if(!SK['イベルタル'].some(r=>r.name==='デスウイング+'&&equal(r,y))){const yr=entry(y,'ダメージ');yr.name+='+';yr.upg=y.upgrade_level_2;SK['イベルタル'].push(yr);addedNumeric++;}
 for(const rule of rules){
  const ss=source.filter(s=>key(s)===rule.sourceKey&&numeric(s));if(ss.length!==1)throw Error('後続倍率の出典不整合: '+rule.sourceKey);
  const s=ss[0],p=rule.pokemon,rows=SK[p];
  if(!source.some(x=>pokemon(x.pokemon_ja)===p&&norm(x.move_ja)===norm(rule.move)&&[x.true_description,x.notes].some(t=>t?.includes(rule.evidence))))throw Error('後続倍率の説明を要再確認: '+p+'/'+rule.move);
  const plus=/^enhanced/.test(s.ratio_component),baseNames=[...new Set(rows.filter(r=>norm(r.name)===norm(rule.move)&&!r.supplement).map(r=>r.name))];
  const matches=rows.filter(r=>r.name===rule.move+(plus?'+':'')&&equal(r,s)&&!r.supplement);
  const duplicates=source.filter(x=>pokemon(x.pokemon_ja)===p&&x.skill_slot===s.skill_slot&&x.move_en===s.move_en&&numeric(x)&&JSON.stringify(tuple(x))===JSON.stringify(tuple(s))&&/^enhanced/.test(x.ratio_component)===plus);
  const base=matches[Math.max(0,duplicates.findIndex(x=>key(x)===key(s)))];
  if(!base)throw Error('後続倍率の基準行なし: '+rule.sourceKey);
  for(const name of baseNames){
   const isPlus=/[+＋]$/.test(name);if(rule.variant==='base'&&isPlus||rule.variant==='plus'&&!isPlus)continue;
   const candidate=rows.find(r=>r.name===name&&r.dmgType===base.dmgType&&!r.supplement)||base;
   for(const [i,factor] of rule.factors.entries()){
    const label=rule.label+(rule.factors.length>1?'・初回の'+Math.round(factor*100)+'%':'');
    const r={...candidate,name,dmgType:(/回復/.test(base.dmgType)?'回復':'ダメージ')+'（'+label.replace(/[（）]/g,'')+'）',
      coeff:Math.round(candidate.coeff*factor*1e8)/1e8,lvScale:Math.round((candidate.lvScale||0)*factor*1e8)/1e8,fixed:Math.round((candidate.fixed||0)*factor*1e8)/1e8,
      hits:1,hitsVar:false,supplement:'derived',derivedKey:rule.sourceKey+'|'+name+'|'+i,derivedFrom:{sourceKey:rule.sourceKey,factor},componentNote:'この条件の1回分です。元データに明記された倍率から算出しています。'};
    delete r.sourceKey;
    if(candidate===base&&isPlus&&name!==base.name){r.upg=rows.find(x=>x.name===name)?.upg||base.upg;}
    rows.push(r);derived++;
   }
  }
 }
 let conditional=0;
 for(const rule of require('../data/lab-conditional-formulas.json')){
  const rows=SK[rule.pokemon],proof=source.filter(s=>pokemon(s.pokemon_ja)===rule.pokemon&&norm(s.move_ja)===norm(rule.move)&&[s.true_description,s.notes].some(t=>t?.includes(rule.evidence)));
  if(!proof.length)throw Error('条件式の説明を要再確認: '+rule.pokemon+'/'+rule.move);
  const bases=rows.filter(r=>norm(r.name)===norm(rule.move)&&r.coeff!=null&&!r.supplement&&(!rule.slot||r.slot===rule.slot)&&(!rule.component||r.dmgType===rule.component));
  for(const name of new Set(bases.map(r=>r.name))){
   const base=bases.find(r=>r.name===name);
   if(rule.singleHit)for(const r of bases.filter(r=>r.name===name)){r.hits=1;r.hitsVar=false;r.componentNote='連続命中による倍率は下の条件式を参照してください。計算値は最初の1ヒット分です。';}
   rows.push({slot:base.slot,name,upg:base.upg,dmgType:'条件式（'+rule.label+'）',stat:'',coeff:null,fixed:null,lvScale:0,hits:1,hitsVar:false,cd:base.cd,description:rule.text,formulaText:true,supplement:'conditional',descriptionSources:proof.map(key)});conditional++;
  }
 }
 return {addedNumeric,derived,conditional};
}
module.exports=apply;
module.exports.isSingleHitChange=(p,a,b)=>b.hits===1&&require('../data/lab-conditional-formulas.json').some(r=>r.singleHit&&r.pokemon===p&&norm(a.name)===norm(r.move)&&(!r.component||r.component===a.dmgType));
module.exports.isSourceRename=(a,b)=>a.name!==b.name&&((a.name.replace(/[+＋]$/,'')==='ダブルウイング'&&b.name.replace(/[+＋]$/,'')==='バレットパンチ')||(a.name==='グリーンスターダイブ'&&b.name==='レッドスターダイブ'));
