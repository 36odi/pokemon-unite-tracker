// ラボ共通計算。仕様・出典・確認範囲は docs/lab-calculation-review.md。
const LAB_TEMP_ITEM_EFFECTS={
  'ふんばりベルト':{stats:['防御','特防'],tiers:[12,20,28],label:'妨害を受けた後の3秒間'},
  'かるいし':{stats:['移動速度'],tiers:[10,15,20],label:'戦闘から離れて5秒後'},
  'こだわりスカーフ':{stats:['移動速度'],tiers:[30,35,40],label:'通常攻撃の条件達成後の3秒間'},
  'れんだスカーフ':{flatStat:'通常攻撃の速さ',tiers:[15,20,25],label:'通常攻撃3回命中後の5秒間'},
  'エナジーアンプ':{damage:true,tiers:[7,14,21],label:'ユナイトわざ使用後の効果中（通常4秒）'},
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
// ---- DC: 実ダメージ計算式 ----
function dcCalcActual(raw,def,pen=0,pctIgnore=0,dmgReduce=0){
  // 割合無視は防御値を直接削減（固定貫通と重なる場合は掛け算）
  const defAdj=Math.max(0,(def-pen)*(1-pctIgnore));
  const step1=Math.floor(raw*600/(600+defAdj));
  const step2=Math.floor(step1*(1-dmgReduce));
  return Math.max(1,step2);
}
