// 資料モデルによる参考値。画面・保存・基礎ステータスの集計から独立させる。
(function(root){
  'use strict';
  const clean=n=>Math.round(n*1e8)/1e8;
  const available=(item,lv)=>lv>=(item.minLevel??1)&&lv<=(item.maxLevel??15);
  function resolve(profile,lv=9,stateId=null,selectedEffects={}){
    if(!profile)return null;
    const fallback=profile.status==='reference'?[{id:'normal',label:'非強化攻撃',kind:'common',bonus:0}]:profile.status==='fixed'?[{id:'fixed',label:'固定アニメーション',kind:'fixed',bonus:0}]:[];
    const states=(profile.states||fallback).filter(s=>available(s,lv));
    const state=states.find(s=>s.id===stateId)||states.find(s=>(s.defaultMinLevel!=null||s.defaultMaxLevel!=null)&&lv>=(s.defaultMinLevel??1)&&lv<=(s.defaultMaxLevel??15))||states[0];
    if(!state)return null;
    const applicable=['common','model'].includes(state.kind);
    const effects=(applicable?profile.effects||[]:[]).filter(e=>available(e,lv)&&(!e.onlyStates||e.onlyStates.includes(state.id))).map(effect=>{
      const perStack=effect.perStack+(effect.perLevel||0)*(lv-1);
      const options=(effect.count!=null?Array.from({length:effect.count+1},(_,i)=>({id:String(i),label:i+'段階（+'+clean(i*perStack)+'%）',bonus:clean(i*perStack)})):effect.options).filter(o=>available(o,lv));
      const selected=options.find(o=>o.id===String(selectedEffects[effect.id]))||options[0];
      return {...effect,options,selected};
    });
    return {state,states,effects,extra:applicable?clean((state.bonus||0)+effects.reduce((sum,e)=>sum+e.selected.bonus,0)):0,
      selections:{stateId:state.id,effects:Object.fromEntries(effects.map(e=>[e.id,e.selected.id]))}};
  }
  function calculate({bonus,profile,lv=9,stateId=null,effects={}},rules){
    if(typeof bonus!=='number'||!Number.isFinite(bonus))return {state:'invalid'};
    const resolved=resolve(profile,lv,stateId,effects);
    if(!resolved)return {state:'unsupported',bonus};
    const common={inputBonus:bonus,bonus,resolved,modelExtra:resolved.extra,hypothetical:resolved.state.kind==='model'};
    if(resolved.state.kind==='fixed')return {...common,state:'fixed'};
    if(resolved.state.kind==='excluded')return {...common,state:'excluded',reason:resolved.state.reason};
    if(resolved.state.kind==='unconfirmed')return {...common,state:'unsupported',reason:profile.reason};
    if(!['common','model'].includes(resolved.state.kind))return {...common,state:'unsupported'};
    bonus=bonus+resolved.extra;common.bonus=bonus;
    const stages=rules.stages;
    if(bonus<0||bonus>stages.at(-1).max)return {...common,state:'outside'};
    let index=0;
    for(let i=1;i<stages.length;i++){
      const s=stages[i];
      if(s.min!==s.max&&bonus>=s.min&&bonus<=s.max){
        return {...common,state:'boundary',index:i-1,candidates:[stages[i-1].frames,s.frames],boundary:s};
      }
      // 比較の前に画面用の丸めを行わない。計算表は境界と一致なら前段階。
      if(bonus>s.max)index=i;
      else break;
    }
    const stage=stages[index],next=stages[index+1];
    return {...common,state:common.hypothetical?'model':'reference',index,frames:stage.frames,seconds:stage.frames/rules.fps,
      attacksPerSecond:rules.fps/stage.frames,
      next:next?{...next,deltaMin:clean(next.min-bonus),deltaMax:clean(next.max-bonus),exclusive:true}:null};
  }
  function graph(result,rules){
    if(!['reference','model','boundary'].includes(result.state))return null;
    const stages=rules.stages,index=result.index;
    // 最大6区間。再描画時の表示範囲を必ず画面へ明記し、ゲーム内上限と区別する。
    const start=Math.max(0,index-4),end=Math.min(stages.length-1,Math.max(6,index+2));
    const min=stages[start].min,max=stages[end].max;
    if(max<=min)return null;
    const position=value=>100*(value-min)/(max-min);
    const ticks=stages.slice(start+1,end+1).map((s,i)=>({...s,index:start+1+i,left:position(s.min),right:position(s.max),next:start+1+i===index+1}));
    const segments=[];
    for(let i=start;i<end;i++){
      const left=stages[i].max,right=stages[i+1].min;
      segments.push({frames:stages[i].frames,left:position(left),width:position(right)-position(left),current:['reference','model'].includes(result.state)&&i===index});
    }
    return {min,max,fill:position(result.bonus),ticks,segments};
  }
  const api={calculate,graph,resolve};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.LabAttackSpeedCore=api;
})(typeof window!=='undefined'?window:globalThis);
