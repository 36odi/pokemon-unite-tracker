const fs=require('node:fs'),assert=require('node:assert/strict');
const base=fs.readFileSync('lab_data.js','utf8'),descriptions=fs.readFileSync('lab_descriptions.js','utf8'),core=fs.readFileSync('js/lab-core.js','utf8');
const {K,D,rows,move,raw}=new Function(base+descriptions+core+';return {K:LAB_SKILLS,D:LAB_DESCRIPTIONS,rows:labPassiveRows,move:labMoveDescription,raw:labRawValue}')();
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const before=JSON.stringify(K);eq(Object.keys(D.pokemon).length,103,'all supported species');
for(const [p,skills] of Object.entries(K)){
 const list=rows(p),text=list.filter(r=>r.description&&!r.formulaText);
 eq(text.length,Object.keys(D.pokemon[p].passives).length,p+' all evolution passive summaries');
 eq(list.filter(r=>r.coeff!=null).map(r=>JSON.stringify(r)).sort(),skills.filter(r=>r.slot==='特性'&&r.coeff!=null).map(r=>JSON.stringify(r)).sort(),p+' every numeric passive is unchanged');
 for(const r of text)eq(raw(r,{HP:6000,攻撃:300,特攻:400},9),0,p+' prose has no executable formula');
 for(const [name,d] of Object.entries(D.pokemon[p].moves)){
  eq(d.text.length>0&&d.sourceKeys.length>0,true,p+'/'+name+' nonempty sourced explanation');
  eq(move(p,name),d.text,p+'/'+name+' base summary');
 }
 for(const [name,d] of Object.entries(D.pokemon[p].upgrades)){
  eq(d.text.length>0&&d.sourceKeys.length>0,true,p+'/'+name+' sourced upgrade explanation');
  eq(move(p,name+'+'),d.text,p+'/'+name+' selects upgrade instead of base');
  eq(move(p,name+'＋'),d.text,p+'/'+name+' fullwidth plus selects upgrade');
  eq(move(p,name+'+')!==move(p,name),true,p+'/'+name+' distinct base and upgrade summaries');
 }
 for(const r of skills.filter(r=>!['特性','通常攻撃'].includes(r.slot)))eq(move(p,r.name).length>0,true,p+'/'+r.name+' visible move explanation');
}
eq(JSON.stringify(K),before,'description lookup never mutates calculation source');
eq(rows('サンダース'),K['サンダース'].filter(r=>r.slot==='特性'),'preserve praised Jolteon prose and order');
eq(rows('不明'),[],'unknown species is not invented');eq(move('不明','不明'),'','unknown move stays unknown');
eq(move('ニンフィア','マジカルフレイム'),'指定方向へ跳び、4つの炎を作って相手へ順に飛ばします。命中した相手の特攻を1秒間15%下げ、最大4段階まで重なります。','base flame count and debuff retained');
eq(move('ニンフィア','マジカルフレイム+'),'炎が1つ増え、4つから5つになります。','upgraded flame count is five');
eq(move('ゲッコウガ','みずしゅりけん+'),'水手裏剣を5つ投げるようになります。','upgraded projectile count');
eq(move('マリルリ','みずのはどう+').includes('最大5体'),true,'upgrade description2 source included');
eq(move('ジュナイパー','はっぱカッター+').includes('残りHP'),true,'upgrade notes source included');
eq(move('ニンフィア','めいそう+').includes('シールド'),true,'upgrade adds effect absent from base');
eq(move('ニンフィア','スピードスター+'),'','missing upgrade never falls back to base');
eq(rows('バンギラス').filter(r=>r.description).map(r=>r.name),['こんじょう','だっぴ','すなおこし'],'three evolution abilities clearly separated');
const without=new Function(base+core+';return labPassiveRows')();eq(without('リザードン'),K['リザードン'].filter(r=>r.slot==='特性'&&(r.coeff!=null||r.description)),'calculation remains usable if description asset unavailable');
console.log('ALL PASS — '+checks+' description checks');
