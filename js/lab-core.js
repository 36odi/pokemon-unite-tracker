// ===== ラボ計算コア =====
// index.html から分離（Phase 3）。DOMに触らない計算関数のみ。

// 共通ステータス計算（攻撃側・防御側両用）
function computeStats({poke,lv,items,dmgStack=0,koStack=0,goalCount=0,medalPresetIdx=null}){
  const sd=LAB_STATUS?.[poke];
  if(!sd) return null;
  const idx=lv-1;
  const base={
    HP:sd.hp[idx]||0, 攻撃:sd.atk[idx]||0, 防御:sd.def[idx]||0,
    特攻:sd.spatk[idx]||0, 特防:sd.spdef[idx]||0, 移動速度:sd.ms[idx]||0,
  };
  const tierFor=g=>g>=20?2:g>=10?1:0;
  const ib={};
  // グレード補正
  for(const {name,grade} of items){
    if(!name||!LAB_ITEMS?.[name]) continue;
    const gs=LAB_ITEMS[name][grade-1]||{};
    Object.entries(gs).forEach(([k,v])=>{ const m=LAB_STAT_MAP[k]||k; ib[m]=(ib[m]||0)+v; });
  }
  // 常時%補正
  for(const {name,grade} of items){
    if(!name||!LAB_PCT_ITEMS?.[name]) continue;
    const info=LAB_PCT_ITEMS[name]; const tier=tierFor(grade);
    const m=LAB_STAT_MAP[info.stat]||info.stat;
    ib[m]=(ib[m]||0)+Math.round((base[m]||0)*info.tiers[tier]/100);
  }
  // ダメージ受けスタック
  if(dmgStack>0) for(const {name,grade} of items){
    if(!name||!LAB_DMG_STACK_ITEMS?.[name]) continue;
    const info=LAB_DMG_STACK_ITEMS[name]; const tier=tierFor(grade);
    const m=LAB_STAT_MAP[info.stat]||info.stat;
    ib[m]=(ib[m]||0)+Math.round((base[m]||0)*info.tiers[tier]*dmgStack/100);
  }
  // KO/アシストスタック
  if(koStack>0) for(const {name,grade} of items){
    if(!name||!LAB_STACK_ITEMS?.[name]) continue;
    const info=LAB_STACK_ITEMS[name]; const tier=tierFor(grade);
    const m=LAB_STAT_MAP[info.stat]||info.stat;
    ib[m]=(ib[m]||0)+Math.round((base[m]||0)*info.tiers[tier]*koStack/100);
  }
  // ゴール補正
  if(goalCount>0) for(const {name,grade} of items){
    if(!name||!LAB_GOAL_ITEMS?.[name]) continue;
    const info=LAB_GOAL_ITEMS[name]; const tier=tierFor(grade);
    const m=LAB_STAT_MAP[info.stat]||info.stat;
    ib[m]=(ib[m]||0)+info.tiers[tier]*goalCount;
  }
  // メダル補正
  const mb={};
  if(medalPresetIdx!==null){
    const bonus=labCalcMedalBonus(medalPresetIdx,base);
    Object.entries(bonus).forEach(([k,v])=>{ mb[k]=(mb[k]||0)+v; });
  }
  const totals={...base};
  Object.entries(ib).forEach(([k,v])=>{ totals[k]=(totals[k]||0)+v; });
  Object.entries(mb).forEach(([k,v])=>{ totals[k]=(totals[k]||0)+v; });
  return totals;
}

// ---- DC: 実ダメージ計算式 ----
function dcCalcActual(raw,def,pen=0,pctIgnore=0,dmgReduce=0){
  // 割合無視は防御値を直接削減（固定貫通と重なる場合は掛け算）
  const defAdj=Math.max(0,(def-pen)*(1-pctIgnore));
  const step1=Math.floor(raw*600/(600+defAdj));
  const step2=Math.floor(step1*(1-dmgReduce));
  return Math.max(1,step2);
}
