// 2026-10-22のシートから、新規2体の数値成分を固定の出典キーで取り込む。
module.exports=function(SK,source){
  const key=r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|');
  const numeric=r=>['ratio_percent','base_value','level_scaling'].some(k=>r[k]!=='');
  const num=v=>{const n=Number(String(v||0).replaceAll(',',''));if(!Number.isFinite(n))throw Error('新規2体の数値欠損: '+v);return n;};
  const slots={'Passive':'特性','Basic':'通常攻撃','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ'};
  // [スロット、わざ、出典オブジェクト、成分、表示名、回数、注記]
  const specs={
    Flareon:[
      ['Passive','Flash Fire','rsb','base','ダメージ（熱波）',7,'熱波1回分の式です。全7回。ヒートゲージによる攻撃上昇と通常攻撃の回復は自動反映しません。'],
      ['Basic','Attack','rsb','base','ダメージ（通常時）',1],
      ['Basic','Attack','boosted_rsb','base','ダメージ（強化）',1],
      ['Move 1','Swift','rsb','base','ダメージ（星1発あたり）',4],
      ['Move 1','Fire Blast','rsb','base','ダメージ（命中時）',1],
      ['Move 1','Fire Blast','rsb','add1','ダメージ（やけど）',4],
      ['Move 2','Tackle','rsb','base','ダメージ',1],
      ['Move 2','Flare Blitz','rsb','base','ダメージ',1],
      ['Move 2','Flare Blitz','rsb','enhanced','ダメージ',1],
      ['Unite Move','Garnet Ignition','rsb','base','ダメージ（着地）',1],
      ['Unite Move','Garnet Ignition','rsb','add1','ダメージ（熱波1回あたり）',1,'熱波はヒートゲージに応じて1〜4回発生します。表示は1回分です。']
    ],
    Jolteon:[
      ['Basic','Attack','rsb','base','ダメージ（通常時）',1],
      ['Basic','Attack','rsb','add1','ダメージ（強化）',1],
      ['Basic','Attack','boosted_rsb','base','ダメージ（はやあしの特殊強化攻撃）',2],
      ['Basic','Attack','boosted_rsb','add1','ダメージ（落雷）',1,'はやあしのカウンターが最大の相手に発動します。'],
      ['Basic','Attack','boosted_rsb','add2','回復（はやあしの特殊強化攻撃）',1,'相手1匹に命中した時の回復量です。2匹目以降の回復は1匹目の30%で、この表示には含みません。'],
      ['Move 1','Swift','rsb','base','ダメージ（最初の星）',1,'星は3発。同じ相手への2・3発目はそれぞれ1発目の30%です。表示は1発目のみです。'],
      ['Move 1','Pin Missile','rsb','base','ダメージ',3],
      ['Move 2','Quick Attack','rsb','base','ダメージ',1],
      ['Move 2','Volt Switch','rsb','base','ダメージ',1],
      ['Unite Move','Plasma Quintupulse','rsb','base','ダメージ（連続攻撃）',4],
      ['Unite Move','Plasma Quintupulse','rsb','add1','ダメージ（突進）',1],
      ['Unite Move','Plasma Quintupulse','rsb','add2','回復（突進）',1,'突進がカウンター4個または5個の相手に命中した時に発動します。'],
      ['Unite Move','Plasma Quintupulse','rsb','add3','ダメージ（落雷）',1,'突進がカウンター4個または5個の相手に命中した時に発動します。']
    ]
  };
  for(const [en,spec] of Object.entries(specs)){
    const rows=source.filter(r=>r.pokemon_en===en),numbers=rows.filter(numeric);
    const expected=spec.map(s=>[en,...s.slice(0,4)].join('|')).sort();
    if(JSON.stringify(numbers.map(key).sort())!==JSON.stringify(expected))throw Error(en+'の出典成分構造が変化しました');
    const generated=[];
    for(const [slot,move,obj,component,label,hits,note] of spec){
      const s=numbers.find(r=>r.skill_slot===slot&&r.move_en===move&&r.source_object===obj&&r.ratio_component===component);
      if(s.stat_type!==(en==='Flareon'?'Atk':'SpAtk'))throw Error(en+'の参照ステータス変化');
      const plus=component.startsWith('enhanced');
      const entry={slot:slots[slot],name:s.move_ja+(plus?'+':''),dmgType:label,upg:slot==='Unite Move'?'8':plus?s.upgrade_level_2:s.upgrade_level_1||'',stat:s.stat_type==='Atk'?'攻撃':'特攻',coeff:num(s.ratio_percent),fixed:num(s.base_value),lvScale:num(s.level_scaling),hits,hitsVar:false,cd:s.cooldown===''?null:num(s.cooldown),sourceKey:key(s),...(note?{componentNote:note}:{})};
      generated.push(entry);
      // +専用の式がないわざは通常の式を継承する。
      if(!plus&&s.upgrade_level_2&&!numbers.some(r=>r.skill_slot===slot&&r.move_en===move&&r.ratio_component==='enhanced'+(component==='base'?'':'_'+component)))generated.push({...entry,name:entry.name+'+',upg:s.upgrade_level_2});
    }
    const descriptions=en==='Flareon'?[
      ['Adaptability','てきおうりょく','イーブイの特性。通常攻撃かわざが相手に命中すると、攻撃が5秒間12%上昇します。待ち時間10秒。攻撃上昇は自動反映しません。'],
      ['Flash Fire','もらいび','ブースターの特性。ヒートゲージの各段階で攻撃が8%ずつ上昇し、通常攻撃に3%・4%・5%のHP吸収が追加されます。攻撃上昇やHP吸収は自動反映しません。']
    ]:[
      ['Anticipation','きけんよち','イーブイの特性。相手が一定範囲に入ると、移動速度が5秒間40%上昇します。待ち時間15秒。'],
      ['Quick Feet','はやあし','サンダースの特性。強化攻撃・わざ・ユナイトわざで6秒間のカウンターを最大5個付けます。5個で特殊な強化攻撃が使用可能。カウンターのある相手に向かうと移動速度が20%上昇し、まひ状態になりません。']
    ];
    for(const [move,name,description] of descriptions){
      const s=rows.find(r=>r.skill_slot==='Passive'&&r.move_en===move&&r.ratio_component==='text');
      if(!s||s.move_ja!==name)throw Error(en+'の特性説明が未収録: '+move);
      generated.push({slot:'特性',name,dmgType:'効果',upg:'',stat:en==='Flareon'?'攻撃':'特攻',coeff:null,fixed:null,lvScale:0,hits:1,hitsVar:false,cd:null,description,sourceKey:key(s)});
    }
    SK[rows[0].pokemon_ja]=generated;
  }
};
