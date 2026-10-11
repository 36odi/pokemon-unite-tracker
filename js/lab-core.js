// ラボ共通計算。仕様・出典・確認範囲は docs/lab-calculation-review.md。
const LAB_TEMP_ITEM_EFFECTS={
  'ふんばりベルト':{stats:['防御','特防'],tiers:[12,20,28],label:'妨害を受けた後の3秒間'},
  'かるいし':{stats:['移動速度'],tiers:[10,15,20],label:'戦闘から離れて5秒後'},
  'こだわりスカーフ':{stats:['移動速度'],tiers:[30,35,40],label:'通常攻撃の条件達成後の3秒間'},
  'れんだスカーフ':{flatStat:'通常攻撃の速さ',tiers:[15,20,25],label:'通常攻撃3回命中後の5秒間'},
  'エナジーアンプ':{damage:true,tiers:[7,14,21],label:'ユナイトわざ使用後の効果中（通常4秒）'},
};
// もちもの自身の発動量。G1〜9 / G10〜19 / G20〜40。
// 2026-10-11取得のUnite-DB held_items.json。詳細は docs/lab-item-effects.md。
const LAB_PROC_ITEM_EFFECTS={
  'ちからのハチマキ':{source:'Muscle Band',kind:'damage',stat:'targetHP',pct:[1,2,3],cap:[120,240,360],label:'通常攻撃命中時の追加ダメージ1回分'},
  'こだわりメガネ':{source:'Choice Specs',kind:'damage',stat:'特攻',pct:[30,35,40],fixed:[40,50,60],label:'わざ命中時、最初の相手への追加ダメージ（待ち時間8秒）'},
  'するどいツメ':{source:'Razor Claw',kind:'damage',stat:'攻撃',pct:[40,45,50],fixed:[10,15,20],label:'わざ使用後3秒以内の次の通常攻撃（待ち時間1.5秒）'},
  'じゅうてんチャーム':{source:'Charging Charm',kind:'damage',stat:'攻撃',pct:[50,60,70],fixed:[20,30,40],label:'エネルギー満タン時、最初の相手への追加ダメージ'},
  'ピントレンズ':{source:'Scope Lens',kind:'damage',stat:'攻撃',pct:[45,60,75],label:'通常攻撃の急所命中時の追加ダメージ（待ち時間1秒）'},
  'ゴツゴツメット':{source:'Rocky Helmet',kind:'damage',stat:'HP',pct:[1.9,2.2,2.5],label:'最大HPの3%以上を1ヒットで受けた時、近くの相手への反射（待ち時間0.6秒）'},
  'かいがらのすず':{source:'Shell Bell',kind:'heal',stat:'特攻',pct:[40,50,60],fixed:[50,65,80],label:'わざ命中時の自己回復（待ち時間8秒）'},
  'きあいのハチマキ':{source:'Focus Band',kind:'heal',stat:'missingHP',pct:[6,9,12],label:'HP25%未満で発動する回復の1回分（毎秒、全3回／待ち時間100・90・80秒）'},
  'たべのこし':{source:'Leftovers',kind:'heal',stat:'HP',pct:[2,3,4],label:'戦闘から離れて5秒後、毎秒の自己回復'},
  'いやしのかんむり':{source:'Drain Crown',kind:'heal',stat:'hpDamage',pct:[9,12,15],label:'物理の通常攻撃で相手のHPへ与えたダメージから自己回復（シールド分を除く）'},
  'さきがけベル':{source:'Vanguard Bell',kind:'heal',stat:'HP',pct:[6,8,10],label:'相手に妨害を与えた時の自己回復（待ち時間5秒）'},
  'とつげきチョッキ':{source:'Assault Vest',kind:'shield',stat:'HP',pct:[10,15,20],label:'特殊ダメージを15秒受けていない時の、特殊ダメージ専用シールド'},
  'おたすけバリア':{source:'Buddy Barrier',kind:'shield',stat:'HP',pct:[15,20,25],ally:true,label:'ユナイトわざ使用時、自分と近くの味方1体へ5秒間（待ち時間30秒）'},
  'きょうめいガード':{source:'Resonant Guard',kind:'shield',stat:'HP',pct:[4,5,6],fixed:[60,80,100],ally:true,label:'相手へのダメージで自分と近くの味方1体へ3秒間（待ち時間10秒）'},
  'ゴールサポーター':{source:'Score Shield',kind:'shield',stat:'HP',pct:[5,7.5,10],fixed:[15,22,30],level:[15,22,30],label:'ゴール中のシールド（待ち時間20秒）'},
};
function labUniqueItems(items=[]){
  const seen=new Set();
  return items.filter(it=>it.name&&!seen.has(it.name)&&seen.add(it.name)).map(it=>({...it,grade:Math.max(1,Math.min(40,Math.trunc(Number(it.grade)||1)))}));
}
function computeStats(input,deps){return computeStatsDetailed(input,deps)?.totals||null;}
function computeStatsDetailed({poke,lv,items=[],dmgStack=0,koStack=0,goalCount=0,medalPresetIdx=null,activeEffects=[]},deps){
  if(!deps) throw new TypeError('computeStats requires deps');
  const {status,itemStats,statMap={},pctItems={},dmgStackItems={},stackItems={},goalItems={},medalBonus}=deps;
  const sd=status?.[poke]; if(!sd)return null;
  const idx=Math.max(0,Math.min(14,Math.trunc(Number(lv)||1)-1));
  const base={HP:sd.hp[idx]||0,攻撃:sd.atk[idx]||0,防御:sd.def[idx]||0,特攻:sd.spatk[idx]||0,特防:sd.spdef[idx]||0,移動速度:sd.ms[idx]||0};
  items=labUniqueItems(items);
  const tierFor=g=>g>=20?2:g>=10?1:0;
  const flat={},pct={},active=new Set(activeEffects);
  const add=(obj,k,v)=>obj[k]=(obj[k]||0)+v;
  for(const {name,grade} of items){
    Object.entries(itemStats?.[name]?.[grade-1]||{}).forEach(([k,v])=>add(flat,statMap[k]||k,v));
    const t=tierFor(grade), goal=goalItems[name];
    if(goal)add(flat,statMap[goal.stat]||goal.stat,goal.tiers[t]*Math.max(0,Math.min(6,Math.trunc(goalCount)||0)));
    for(const [rules,count,max] of [[pctItems,1,1],[dmgStackItems,dmgStack,4],[stackItems,koStack,20]]){
      const r=rules[name];if(r)add(pct,statMap[r.stat]||r.stat,r.tiers[t]*Math.max(0,Math.min(r.maxStacks||max,Math.trunc(count)||0)));
    }
    const effect=LAB_TEMP_ITEM_EFFECTS[name];
    if(effect&&active.has(name)){
      for(const k of effect.stats||[])add(pct,k,effect.tiers[t]);
      if(effect.flatStat)add(flat,effect.flatStat,effect.tiers[t]);
    }
  }
  let mb={},medalFlat={};
  if(medalPresetIdx!==null){
    if(typeof medalBonus!=='function')throw new TypeError('computeStats requires deps.medalBonus');
    mb=medalBonus(medalPresetIdx,base);
    // 基礎値を0にして呼ぶと、色セットの割合分を除いた個々のメダルの固定値を取得できる。
    medalFlat=medalBonus(medalPresetIdx,Object.fromEntries(Object.keys(base).map(k=>[k,0])));
  }
  const totals={},itemBonus={};
  for(const k of new Set([...Object.keys(base),...Object.keys(flat),...Object.keys(mb),...Object.keys(pct)])){
    const b=base[k]||0, f=flat[k]||0, m=mb[k]||0, mf=medalFlat[k]||0;
    const value=(b+f+mf)*(1+(pct[k]||0)/100)+(m-mf);
    // 小数ステータスは保持し、ダメージ式の所定の段階で切り捨てる。
    totals[k]=Math.round(value*1e8)/1e8;
    if(f||pct[k])itemBonus[k]=Math.round((totals[k]-b-m)*1e8)/1e8;
  }
  return {base,itemBonus,medalBonus:mb,totals};
}
function labItemDamageMultiplier(items,activeEffects=[]){
  const active=new Set(activeEffects);
  return 1+labUniqueItems(items).reduce((sum,it)=>{
    const e=LAB_TEMP_ITEM_EFFECTS[it.name];return sum+(active.has(it.name)&&e?.damage?e.tiers[it.grade>=20?2:it.grade>=10?1:0]:0);
  },0)/100;
}
function labSupportMultiplier(items,isHeal,target='self'){
  let pct=0;
  for(const it of labUniqueItems(items)){
    const t=it.grade>=20?2:it.grade>=10?1:0;
    if(it.name==='レスキューフード'&&target==='ally')pct+=[17,20,23][t];
    if(it.name==='おおきなねっこ'&&isHeal&&target==='self')pct+=[10,15,20][t];
  }
  return 1+pct/100;
}
function labRawValue(r,stats,lv){
  const st=r.stat||'攻撃';
  const key=/特攻|Sp\.?\s*Atk|sp_?atk/i.test(st)?'特攻':/HP/i.test(st)?'HP':'攻撃';
  return Math.max(0,Math.floor((r.coeff||0)/100*(stats[key]||0)+(r.lvScale||0)*(lv-1)+(r.fixed||0)+1e-9));
}
// 固定値・レベル補正だけの式も対象。能力変化にダメージ軽減や回復補正を適用しない。
function labEffectKind(r){
  if(r.effectKind)return r.effectKind;
  const dt=r.dmgType||'';
  if(/回復.*与ダメージ割合/.test(dt))return 'rate';
  if(/^(防御|特防|攻撃上昇|攻撃速度|最大HP増加|攻撃 - 増加|HP -)/.test(dt))return 'stat';
  if(/回復/.test(dt))return 'heal';
  if(/^シールド/.test(dt))return 'shield';
  return 'damage';
}
function labEffectUnit(r){return labEffectKind(r)==='rate'||/攻撃速度.*%/.test(r.dmgType||'')?'%':'';}
function labItemProcValues({items=[],activeEffects=[],stats={},lv=1,targetStats=null,targetHP=null,selfHP=null,hpDamage=null}){
  const active=new Set(activeEffects),equipped=labUniqueItems(items);
  const floor=v=>Math.max(0,Math.floor(v+1e-9));
  const amount=(v,max)=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&(max==null||Number(v)<=max);
  return equipped.filter(it=>active.has(it.name)&&LAB_PROC_ITEM_EFFECTS[it.name]).map(it=>{
    const e=LAB_PROC_ITEM_EFFECTS[it.name],t=it.grade>=20?2:it.grade>=10?1:0;
    const result={name:it.name,kind:e.kind,label:e.label};
    let ref=stats[e.stat]||0;
    if(e.stat==='targetHP'){
      if(!amount(targetHP))return {...result,message:'相手の発動直前の残りHPを入力してください。'};
      ref=Number(targetHP);
    }
    if(e.stat==='missingHP'){
      if(!amount(selfHP,stats.HP))return {...result,message:'自分の残りHPを入力してください。'};
      if(Number(selfHP)===0)return {...result,message:'HPが0の時は回復できません。'};
      if(Number(selfHP)>=(stats.HP||0)*.25)return {...result,message:'残りHPが25%未満の時に発動します。'};
      ref=(stats.HP||0)-Number(selfHP);
    }
    if(e.stat==='hpDamage'){
      if(!amount(hpDamage))return {...result,message:'物理の通常攻撃で相手のHPへ与えたダメージを入力してください。'};
      ref=Number(hpDamage);
    }
    const level=Math.max(1,Math.min(15,Math.trunc(Number(lv)||1)));
    let raw=floor(ref*e.pct[t]/100+(e.fixed?.[t]||0)+(e.level?.[t]||0)*(level-1));
    if(e.cap)raw=Math.min(raw,e.cap[t]); // 対象は相手チームのポケモン。
    result.raw=raw;
    if(e.kind==='damage'){
      const special=e.stat==='特攻';
      result.damageType=special?'特殊':'物理';
      // 0HPなどで発動量が0の時に、最低ダメージ1を作らない。
      const mult=labItemDamageMultiplier(equipped,activeEffects);
      result.value=floor(raw*mult);
      if(targetStats){
        const spoon=equipped.find(i=>i.name==='すりぬけスプーン');
        const pen=special&&spoon?[9,12,15][spoon.grade>=20?2:spoon.grade>=10?1:0]/100:0;
        result.actual=raw===0?0:floor(dcCalcActual(raw,targetStats[special?'特防':'防御']||0,0,pen)*mult);
      }
    }else{
      result.value=floor(raw*labSupportMultiplier(equipped,e.kind==='heal','self'));
      if(e.ally)result.ally=floor(raw*labSupportMultiplier(equipped,false,'ally'));
    }
    return result;
  });
}
// ---- DC: 実ダメージ計算式 ----
function dcCalcActual(raw,def,pen=0,pctIgnore=0,dmgReduce=0){
  // 割合無視は防御値を直接削減（固定貫通と重なる場合は掛け算）
  const defAdj=Math.max(0,(def-pen)*(1-pctIgnore));
  const step1=Math.floor(raw*600/(600+defAdj));
  const step2=Math.floor(step1*(1-dmgReduce));
  return Math.max(1,step2);
}
