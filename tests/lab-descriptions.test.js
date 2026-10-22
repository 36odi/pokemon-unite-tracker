const fs=require('node:fs'),assert=require('node:assert/strict');
const base=fs.readFileSync('lab_data.js','utf8'),descriptions=fs.readFileSync('lab_descriptions.js','utf8'),core=fs.readFileSync('js/lab-core.js','utf8');
const {K,D,rows,move,raw}=new Function(base+descriptions+core+';return {K:LAB_SKILLS,D:LAB_DESCRIPTIONS,rows:labPassiveRows,move:labMoveDescription,raw:labRawValue}')();
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const before=JSON.stringify(K);eq(Object.keys(D.pokemon).length,103,'all supported species');
for(const [p,skills] of Object.entries(K)){
 const list=rows(p),text=list.filter(r=>r.description);
 eq(text.length,Object.keys(D.pokemon[p].passives).length,p+' all evolution passive summaries');
 eq(list.filter(r=>r.coeff!=null).map(r=>JSON.stringify(r)).sort(),skills.filter(r=>r.slot==='特性'&&r.coeff!=null).map(r=>JSON.stringify(r)).sort(),p+' every numeric passive is unchanged');
 for(const r of text)eq(raw(r,{HP:6000,攻撃:300,特攻:400},9),0,p+' prose has no executable formula');
 for(const [name,d] of Object.entries(D.pokemon[p].moves)){
  eq(d.text.length>0&&d.sourceKeys.length>0,true,p+'/'+name+' nonempty sourced explanation');
  eq(move(p,name+'+'),d.text,p+'/'+name+' upgrade shares primary effect summary');
 }
 for(const r of skills.filter(r=>!['特性','通常攻撃'].includes(r.slot)))eq(move(p,r.name).length>0,true,p+'/'+r.name+' visible move explanation');
}
eq(JSON.stringify(K),before,'description lookup never mutates calculation source');
eq(rows('サンダース'),K['サンダース'].filter(r=>r.slot==='特性'),'preserve praised Jolteon prose and order');
eq(rows('不明'),[],'unknown species is not invented');eq(move('不明','不明'),'','unknown move stays unknown');
eq(rows('バンギラス').filter(r=>r.description).map(r=>r.name),['こんじょう','だっぴ','すなおこし'],'three evolution abilities clearly separated');
const without=new Function(base+core+';return labPassiveRows')();eq(without('リザードン'),K['リザードン'].filter(r=>r.slot==='特性'&&(r.coeff!=null||r.description)),'calculation remains usable if description asset unavailable');
console.log('ALL PASS — '+checks+' description checks');
