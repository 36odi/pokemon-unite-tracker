const rules=require('../data/lab-reviewed-narratives.json'),{key,norm,hasEvidence}=require('./lab-data-utils');
const slots={'Basic':'通常攻撃','Passive':'特性','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ'};
module.exports=function(SK,source){
 const byKey=new Map(source.map(s=>[key(s),s]));let added=0;
 for(const rule of rules){
  const s=byKey.get(rule.sourceKey);if(!s||!hasEvidence(s,rule.evidence))throw Error('文章中の効果式を再確認してください: '+rule.sourceKey);
  if(rule.sourceLabel!==undefined&&rule.sourceLabel!==s.effect_label)throw Error('文章中の効果の条件・対象を再確認してください: '+rule.sourceKey);
  if(rule.publicationStatus&&!['documented','single_source','needs_review','conflict'].includes(rule.publicationStatus))throw Error('文章中の効果式の公開状態を確認してください: '+rule.id);
  if(rule.publicationStatus&&rule.publicationStatus!=='documented')continue;
  if(rule.implementedElsewhere)continue;
  const rows=SK[rule.pokemon],slot=slots[s.skill_slot],plus=/^enhanced/.test(s.ratio_component);
  const baseName=s.move_ja;
  let names=[...new Set(rows.filter(r=>r.slot===slot&&norm(r.name)===norm(baseName)&&!r.narrativeKey).map(r=>r.name))];
  const replacedInPlus=rule.versionScope!=='both'&&source.some(x=>x.pokemon_en===s.pokemon_en&&x.skill_slot===s.skill_slot&&x.move_en===s.move_en&&/^enhanced/.test(x.ratio_component)&&x.effect_label===s.effect_label&&['ratio_percent','base_value','level_scaling','true_description','notes'].some(k=>x[k]!==''));
  names=plus?names.filter(n=>/[+＋]$/.test(n)):names.filter(n=>!/[+＋]$/.test(n)||!replacedInPlus);
  if(rule.versionScope==='base')names=names.filter(n=>!/[+＋]$/.test(n));
  if(rule.versionScope==='plus')names=names.filter(n=>/[+＋]$/.test(n));
  if(!names.length&&slot==='特性')names=[baseName];
  if(!names.length)throw Error('文章の対応わざなし: '+rule.pokemon+'/'+baseName+'/'+rule.id);
  for(const name of names){
   const base=rows.find(r=>r.name===name&&!r.narrativeKey)||{upg:'',cd:null},r={slot,name,upg:base.upg,cd:base.cd,...(base.cdStatus?{cdStatus:base.cdStatus,normalCD:base.normalCD}:{}),dmgType:rule.label,stat:'',coeff:null,fixed:0,lvScale:0,hits:1,hitsVar:false,supplement:'narrative',narrativeKey:rule.sourceKey+'|'+name,descriptionSources:[rule.sourceKey]};
   if(rule.numeric){const n=rule.numeric;Object.assign(r,{stat:n.stat||(n.coeff||n.coeffPerLevel?'HP':''),coeff:n.coeff,...(n.coeffPerLevel!==undefined?{coeffPerLevel:n.coeffPerLevel}:{}),...(n.hpPercent!==undefined?{hpPercent:n.hpPercent}:{}),lvScale:n.lvScale,fixed:n.fixed,effectKind:n.kind,supportTarget:n.target,effectUnit:n.unit,componentNote:rule.formula+' 効果が発動したときの値を個別に計算します。他の成分へ自動加算しません。'});const h=s.effect_label.match(/\((\d+)x\)/);if(h)r.hits=Number(h[1]);}
   else Object.assign(r,{description:rule.formula,formulaText:true,calculationNotice:/未確認|未確定/.test(rule.formula)?'未確認の値は0として扱いません。':'参照するHP・与ダメージ・発動段階などの条件が必要です。この式は自動計算しません。'});
   if(rule.hits!==undefined){if(!Number.isInteger(rule.hits)||rule.hits<1)throw Error('文章式の回数を再確認してください: '+rule.id);r.hits=rule.hits;}
   rows.push(r);added++;
  }
  if(rule.id.startsWith('P')||rule.additionalTerm)for(const r of rows.filter(r=>(rule.affectedSourceKeys||[rule.sourceKey]).includes(r.sourceKey||r.derivedFrom?.sourceKey)&&names.includes(r.name))){
   let prefix=(r.componentNote||'').replace(/文章中の追加項.*$/,'').trim();
   if(rule.pokemon==='ヌメルゴン'&&norm(r.name)==='りゅうのはどう'&&r.dmgType==='回復'&&!prefix.includes('回復の固定部分'))prefix='回復の固定部分です。自身の減少HPに応じた回復はこの式に含まれません。 '+prefix;
   r.componentNote=prefix+' 文章中の追加項はこの数値に含まれません。別の条件式を参照してください。';
  }
 }
 return {narrativeComponents:added};
};
