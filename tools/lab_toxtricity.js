// 提示シートの成分キーでストリンダーを生成。数値のない効果をダメージへ変換しない。
module.exports=function(SK,source){
  const rows=source.filter(r=>r.pokemon_en==='Toxtricity');
  const key=r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|');
  const num=v=>{const n=Number(String(v||0).replace(/,/g,''));if(!Number.isFinite(n))throw Error('Invalid Toxtricity number: '+v);return n;};
  const spec=[
    ['Passive','Punk Rock','rsb','base','回復 - 減速中の相手への通常攻撃'],
    ['Basic','Attack','rsb','base','ダメージ - 通常'],
    ['Basic','Attack','boosted_rsb','base','ダメージ - 強化（どくの音色）'],
    ['Basic','Attack','boosted_rsb','add1','回復 - 強化（でんきの音色）'],
    ['Move 1','Charge','rsb','base','ダメージ - 通常攻撃への追加'],
    ['Move 2','Growl','rsb','base','ダメージ'],
    ['Move 2','Overdrive','rsb','base','ダメージ'],
    ['Move 2','Overdrive','rsb','add1','ダメージ - どくの音色（毒の爆発）'],
    ['Move 2','Overdrive','rsb','add2','ダメージ - どくの音色（周囲）'],
    ['Move 2','Overdrive','rsb','add3','ダメージ - でんきの音色（反響）'],
    ['Unite Move','Venom Distortion','rsb','base','ダメージ - 1回分']
  ];
  const numeric=rows.filter(r=>['ratio_percent','base_value','level_scaling'].some(k=>r[k]!==''));
  const expected=spec.map(s=>['Toxtricity',...s.slice(0,4)].join('|')).sort();
  if(JSON.stringify(numeric.map(key).sort())!==JSON.stringify(expected))throw Error('ストリンダーの出典成分構造が変化しました');
  const slots={'Passive':'特性','Basic':'通常攻撃','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ'};
  const generated=[];
  for(const [slot,move,obj,comp,label] of spec){
    const s=numeric.find(r=>r.skill_slot===slot&&r.move_en===move&&r.source_object===obj&&r.ratio_component===comp);
    if(s.stat_type!=='SpAtk')throw Error('ストリンダーの参照ステータス変化');
    const r={slot:slots[slot],name:s.move_ja,dmgType:label,upg:slot==='Unite Move'?'9':s.upgrade_level_1||'',stat:'特攻',coeff:num(s.ratio_percent),fixed:num(s.base_value),lvScale:num(s.level_scaling),hits:slot==='Unite Move'?5:1,hitsVar:false,cd:s.cooldown===''?null:num(s.cooldown),sourceKey:key(s)};
    generated.push(r);
    // シートの+は非数値効果のみの変更。基礎式を継承する。
    if(move==='Overdrive')generated.push({...r,name:r.name+'+',upg:s.upgrade_level_2});
  }
  const gear=rows.find(r=>r.move_en==='Shift Gear'&&r.ratio_component==='base');
  if(!gear||gear.upgrade_level_1!=='5'||gear.upgrade_level_2!=='11')throw Error('ギアチェンジの出典が不完全');
  for(const plus of [false,true])generated.push({slot:'わざ1',name:gear.move_ja+(plus?'+':''),dmgType:'効果',upg:plus?gear.upgrade_level_2:gear.upgrade_level_1,stat:'特攻',coeff:null,fixed:null,lvScale:0,hits:1,hitsVar:false,cd:num(gear.cooldown),description:'直接ダメージなし。音色を切り替えます。'+(plus?'強化攻撃を準備します。':''),sourceKey:key(gear)});
  SK['ストリンダー']=generated;
};
