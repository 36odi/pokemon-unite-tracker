// 前後の期間は境界を重複させない。記録日時を使い、元の記録を変更しない。
const PatchAnalysisCore=(()=>{
  const DAY=86400000;
  const buildKey=b=>JSON.stringify([b.skill1||null,b.skill2||null,(b.items||'').split(',').filter(Boolean).sort(),b.battle_item||null,medalSetKey(b.medal_set)||null]);
  function analyze(records,{pokemon,boundary,days=14,mode='all',rank='',build='',skill1='',skill2='',item='',battleItem='',medal='',excludeBots=true,now=Date.now()},playedMap=new Map()){
    const time=Date.parse(boundary);if(!Number.isFinite(time)||![7,14,28].includes(days))throw Error('比較する日時・期間が不正です。');
    const match=(value,filter)=>!filter||(filter==='__missing'?!value:value===filter);
    const selected=records.filter(b=>b.pokemon===pokemon&&['win','loss'].includes(b.result)&&(mode==='all'||b.match_type===mode)&&(!excludeBots||!b.is_bot)&&match(aggRankTier(b,playedMap),rank)&&(build?buildKey(b)===build:match(b.skill1,skill1)&&match(b.skill2,skill2)&&(!item||(item==='__missing'?!b.items:(b.items||'').split(',').includes(item)))&&match(b.battle_item,battleItem)&&match(medalSetKey(b.medal_set),medal)));
    const before=[],after=[];let unknown=0,future=0;
    for(const b of selected){
      const t=typeof b.created_at==='string'&&b.created_at?Date.parse(b.created_at):NaN;
      if(!Number.isFinite(t)){unknown++;continue;}if(t>now){future++;continue;}
      if(t>=time-days*DAY&&t<time)before.push(b);
      else if(t>=time&&t<time+days*DAY)after.push(b);
    }
    const metrics=rows=>({n:rows.length,wins:winCount(rows),losses:rows.length-winCount(rows),rate:rows.length?100*winCount(rows)/rows.length:null,stats:aggBattleStats(rows)});
    const a=metrics(before),b=metrics(after);
    function mix(getKey){
      const groups=new Map();for(const [index,rows] of [[0,before],[1,after]])for(const row of rows){const key=getKey(row)||'未記録';if(!groups.has(key))groups.set(key,{key,before:0,after:0});groups.get(key)[index===0?'before':'after']++;}
      return [...groups.values()].sort((x,y)=>y.before+y.after-x.before-x.after);
    }
    return {before,after,a,b,difference:a.rate===null||b.rate===null?null:b.rate-a.rate,unknown,future,incomplete:now<time+days*DAY,from:time-days*DAY,boundary:time,to:time+days*DAY,modes:mix(r=>r.match_type),ranks:mix(r=>aggRankTier(r,playedMap)),builds:mix(buildKey)};
  }
  return {buildKey,analyze};
})();
