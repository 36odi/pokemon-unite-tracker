// 特性の数式を正本CSVから成分キーで追加。空欄の式を0として作らない。
module.exports=function(SK,source){
  const numeric=r=>['ratio_percent','base_value','level_scaling'].some(k=>r[k]!=='');
  const key=r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|');
  const num=v=>Number(String(v||0).replace(/,/g,''));
  const labels={
    'Damage':'ダメージ','Damage - Flare':'追加ダメージ（火種5個の消費）',
    'Def & Sp. Def - Increase (Stacks 10x)':'防御・特防の上昇量（1段階あたり・最大10段階）',
    'Damage - Fireball':'追加ダメージ（火の玉）','Damage - Additional (Basic)':'通常攻撃の追加ダメージ（1段階あたり）',
    'Shield':'シールド','Damage - Revenge':'反撃ダメージ','Healing - Revenge':'回復（反撃時）',
    'Damage - Counter':'反撃ダメージ','Damage - DoT Applied (4x)':'継続ダメージ（全4回）',
    'Damage (Slime)':'ダメージ（ぬめぬめ）','Healing (Per Tick)':'継続回復（1回あたり）',
    'Defense & Sp. Defense':'防御・特防の上昇量（1段階あたり・最大3段階）',
    'Damage - Burn (8x)':'やけどダメージ（1回あたり・全8回）',
    'Healing':'回復','Heal':'回復','Damage - Enhanced Auto':'強化された通常攻撃のダメージ',
    'Damage - Enhanced Auto (Fighter Mode)':'強化された通常攻撃のダメージ（ファイターモード）',
    'Damage - Second Hit':'ダメージ（通常攻撃の2段目）',
    'Damage - Second Hit (Basic)':'ダメージ（通常攻撃の2段目）',
    'Damage - Second Hit (Boosted)':'ダメージ（強化攻撃の2段目）',
    'Damage - Freezing':'追加ダメージ（こおり状態にした時）',
    'Damage - per Tick (7 Ticks)':'継続ダメージ（1回あたり・全7回）',
    'Dark Aura - Healing':'回復（ダークオーラでKOした時）',
    'Damage - Field (5x)':'継続ダメージ（電気のフィールド・全5回）',
  };
  for(const r of source.filter(r=>r.skill_slot==='Passive'&&numeric(r))){
    const rows=SK[r.pokemon_ja];if(!rows)throw Error('特性のポケモン未登録: '+r.pokemon_ja);
    const existing=rows.find(x=>x.sourceKey===key(r));
    // 既存9成分は従来の個別同期処理が管理する。追加34成分は出典の更新にも追従する。
    if(existing&&!existing.effectKind)continue;
    const label=labels[r.effect_label];if(!label)throw Error('特性ラベル未定義: '+r.effect_label);
    const hits=Number(r.effect_label.match(/\((\d+)(?:x| Ticks)\)/)?.[1]||1);
    const kind=/Heal/i.test(r.effect_label)?'heal':/^Shield/.test(r.effect_label)?'shield':/Defense|Def &/.test(r.effect_label)?'stat':'damage';
    let note='';
    if(r.pokemon_en==='Palkia')note='プレッシャー1段階あたりの値です。最大3段階。';
    if(r.pokemon_en==='Dhelmise')note=r.ratio_component==='base'?'シールド獲得による1段階あたりの追加値です。最大3段階。':'シールドが切れた時の回復はこの式に含まれません。';
    if(r.pokemon_en==='Blaziken')note='火の欠片5個が消費された時の追加ダメージです。特性の回復量はこの式に含まれません。';
    if(r.pokemon_en==='Suicune')note='相手の最大HPに応じた追加の確定ダメージはこの式に含まれません。';
    if(r.pokemon_en==='Yveltal')note='特性でKOした時の回復量です。相手の最大HPに応じた確定ダメージや、回復超過分のシールドは含みません。';
    const entry={slot:'特性',name:r.move_ja,dmgType:label,upg:'',stat:r.stat_type==='SpAtk'?'特攻':r.stat_type==='Atk'?'攻撃':r.stat_type,
      coeff:num(r.ratio_percent),fixed:num(r.base_value),lvScale:num(r.level_scaling),hits,hitsVar:false,
      cd:r.cooldown===''?null:num(r.cooldown),sourceKey:key(r),effectKind:kind,...(note?{componentNote:note}:{})};
    if(existing)rows[rows.indexOf(existing)]=entry;else rows.push(entry);
  }
};
