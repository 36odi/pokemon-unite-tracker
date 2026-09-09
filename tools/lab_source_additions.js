// 2026-09同期で追加された成分。行番号や並び順を使わず、出典の成分キーで接続する。
module.exports=function(SK, source){
  const num=v=>Number(String(v||0).replace(/,/g,''));
  const slots={'Passive':'特性','Basic':'通常攻撃','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ'};
  const key=r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|');
  const numeric=r=>['ratio_percent','base_value','level_scaling'].some(k=>r[k]!=='');
  const targets=source.filter(r=>numeric(r)&&(r.pokemon_en==='Morpeko'
    ||(['Ceruledge','Mega-Charizard-X','Aegislash'].includes(r.pokemon_en)&&r.skill_slot==='Passive')
    ||(['Clefable','Hoopa'].includes(r.pokemon_en)&&r.skill_slot==='Unite Move')));
  if(targets.length!==27) throw Error('追加成分構造の変化: '+targets.length+' / 27');
  const labels={
    'Healing - Full Belly transform':'回復 - まんぷくもようへの変化',
    'Damage - Basic':'ダメージ - 通常','Damage - Boosted':'ダメージ - 強化',
    'Damage - Follow Up':'ダメージ - 追撃','Damage - Additional (Paralyzed target)':'ダメージ - まひした相手への追加',
    'Damage - Hangry':'ダメージ - はらぺこもよう',
    'Damage - Flame Body':'ダメージ - ほのおのからだ','Damage - First Stack':'ダメージ - くだけるよろい（1段階目）',
    'Damage - Added to Move':'ダメージ - サンパワーによる追加','Damage - Added to Move (Mega)':'ダメージ - かたいツメによる追加',
    'Defense - Increase (Shield Stance)':'防御上昇 - シールドフォルム',
    'Special Defense - Increase (Shield Stance)':'特防上昇 - シールドフォルム',
    'Attack - Increase (Sword Stance)':'攻撃上昇 - ブレードフォルム'
  };
  for(const r of targets){
    const p=r.pokemon_ja, mor=p==='モルペコ', unite=r.skill_slot==='Unite Move';
    const label=labels[r.effect_label]||(r.effect_label.startsWith('Heal')?'回復':'ダメージ');
    const hits=r.move_en==='Hydro Pump'?3:r.move_en==='Close Combat'||r.move_en==='Hyperspace Fury'?7:1;
    const base={slot:slots[r.skill_slot],name:r.move_ja,dmgType:unite&&!mor?label+' - '+r.move_ja:label,
      upg:mor?({'Spark':'5','Assurance':'7','Hungry Supercharge Wheel':'9'}[r.move_en]||''):'',
      stat:r.stat_type==='SpAtk'?'特攻':'攻撃',coeff:num(r.ratio_percent),fixed:num(r.base_value),lvScale:num(r.level_scaling),
      hits,hitsVar:false,cd:r.cooldown===''?null:num(r.cooldown),sourceKey:key(r)};
    if(mor&&unite&&r.ratio_component==='base')base.dmgType='ダメージ - まんぷくもよう';
    const variants=[base];
    // +専用の数値が提供されていない成分は通常値を引き継ぐ（Lvはユーザー指定）。
    if(mor&&['Spark','Assurance'].includes(r.move_en))variants.push({...base,name:base.name+'+',upg:r.move_en==='Spark'?'11':'13'});
    const rows=SK[p]??=[];
    for(const row of variants){const i=rows.findIndex(x=>x.sourceKey===row.sourceKey&&x.name===row.name);if(i<0)rows.push(row);else rows[i]=row;}
  }
  // 今回CSVで変更された待ち時間だけを同期。既存のユーザー指定Lv等には触れない。
  const moves={'Buzzwole':['Superpower'],'Comfey':['Sweet Kiss'],'Crustle':['Rubble Rouser'],
    'Dodrio':['Jump Kick','Triple Trample'],'Duraludon':['Flash Cannon','Revolving Ruin'],
    'Feraligatr':['Waterfall'],'Garchomp':['Dragon Rush','Dragon Claw'],'Greedent':['Berry Belly Flop']};
  for(const [en,names] of Object.entries(moves))for(const name of names){
    const found=source.filter(r=>r.pokemon_en===en&&r.move_en===name&&r.cooldown!=='');
    const cds=[...new Set(found.map(r=>num(r.cooldown)))];
    if(cds.length!==1)throw Error('待ち時間の出典不整合: '+en+'/'+name);
    const r=found[0];const rows=(SK[r.pokemon_ja]||[]).filter(x=>x.slot===slots[r.skill_slot]&&(x.name.replace(/[+＋]$/,'')===r.move_ja||r.skill_slot==='Unite Move'));
    if(!rows.length)throw Error('待ち時間の対応先なし: '+en+'/'+name);
    rows.forEach(x=>x.cd=cds[0]);
  }
};
