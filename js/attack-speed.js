// 既存のステータス集計を受け取り、採用済みの横棒を描画する。
window.LabAttackSpeed=(()=>{
  'use strict';
  let data=null,pending=null,last=null;
  let selectedPokemon='',selection={stateId:null,effects:{}};
  const scriptUrl=new URL(document.currentScript.src);
  const assetVersion=scriptUrl.searchParams.get('v')||'';
  const key='通常攻撃の速さ',fmt=n=>Number(n.toFixed(2)).toLocaleString('ja-JP');
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const get=()=>document.getElementById('labAttackSpeed');
  function load(){
    if(pending)return pending;
    const read=()=>{
      const bundle=window.LAB_ATTACK_SPEED_DATA;
      if(!bundle||!Array.isArray(bundle.rules?.stages)||bundle.rules.stages.length!==12||bundle.rules.fps!==60||!bundle.profiles)return null;
      return bundle;
    };
    pending=new Promise((resolve,reject)=>{
      const available=read();if(available){resolve(available);return;}
      // file://ではfetch(JSON)が拒否される。初回も再試行も通常のscriptで読む。
      const script=document.createElement('script');
      script.src=new URL('attack-speed-data.js?v='+encodeURIComponent(assetVersion),scriptUrl).href;
      script.onload=()=>{script.remove();const bundle=read();if(bundle)resolve(bundle);else reject(Error('attack speed schema'));};
      script.onerror=()=>{script.remove();reject(Error('attack speed data'));};
      document.head.append(script);
    }).then(bundle=>{
      data=bundle;
      if(last)render(last);
    }).catch(()=>{
      pending=null;
      const host=get();if(!host||!last)return;
      host.hidden=false;
      host.innerHTML='<h2>通常攻撃の速さ</h2><p>速度の資料を読み込めませんでした。</p><button type="button" class="lab-as-retry">もう一度読み込む</button>';
      host.querySelector('button').addEventListener('click',()=>render(last));
    }).finally(()=>{pending=null;});
    return pending;
  }
  function graphHtml(result,rules){
    if(result.state==='fixed')return '<figure class="lab-as-fixed-chart" role="img" aria-label="間隔は固定。速度補正を増やしても変わりません。"><div>間隔は固定</div><figcaption>速度補正を増やしても変わりません</figcaption></figure>';
    const chart=LabAttackSpeedCore.graph(result,rules);
    if(!chart)return '';
    const pos=n=>Math.max(0,Math.min(100,n)).toFixed(6)+'%';
    const next=chart.ticks.find(t=>t.next),current=['reference','model'].includes(result.state);
    const description=(result.hypothetical?'個別適用が未確認の仮のモデル。':'')+(current?`補正${fmt(result.bonus)}%。${result.frames}フレームの参考段階。`:`補正${fmt(result.bonus)}%。境界が未確定のため${result.candidates.join('または')}フレームの可能性があります。`);
    return `<div class="lab-as-direction" aria-hidden="true"><span>ゆっくり</span><span>速い</span></div>
      <figure class="lab-as-chart" role="img" aria-label="${esc(description)}表示範囲は補正${fmt(chart.min)}から${fmt(chart.max)}%。縦線が段階の境界です。">
        <div class="lab-as-track"><div class="lab-as-fill" style="width:${pos(chart.fill)}"></div></div>
        ${chart.ticks.map(t=>`<i aria-hidden="true" class="lab-as-tick${t.next?' lab-as-next':''}${t.min!==t.max?' lab-as-band':''}" style="left:${pos(t.left)};width:${t.min!==t.max?pos(t.right-t.left):'2px'}"></i>`).join('')}
        <div class="lab-as-current" aria-hidden="true" style="left:${pos(Math.max(12,Math.min(88,chart.fill)))}"><strong>いま</strong><span>+${fmt(result.bonus)}%</span></div>
        <i class="lab-as-pointer" aria-hidden="true" style="left:${pos(chart.fill)}"></i>
        ${chart.segments.map(s=>`<div aria-hidden="true" class="lab-as-stage${s.current?' is-current':''}" style="left:${pos(s.left)};width:${pos(s.width)}"><span>${s.frames}F</span>${s.current?'<small>'+(result.hypothetical?'モデルの段階':'現在の段階')+'</small>':''}</div>`).join('')}
        ${next?`<span aria-hidden="true" class="lab-as-next-label" style="left:${pos(Math.max(15,Math.min(85,next.left)))}">${next.min===next.max?'次に速くなる線':'次の境界の範囲'}</span>`:''}
      </figure>
      <div class="lab-as-legend" aria-hidden="true"><span><i class="lab-as-swatch"></i>現在値まで</span><span><i class="lab-as-legend-tick"></i>段階の境界（幅ありは帯）</span></div>
      <p class="lab-as-range">表示範囲：補正 ${fmt(chart.min)}〜${fmt(chart.max)}%。右端は速さの上限ではありません。</p>`;
  }
  function resultHtml(result){
    if(result.state==='fixed')return '<p>正確な固定間隔の秒数・F値は資料未確認のため表示しません。</p>';
    if(result.state==='excluded')return '<p class="lab-as-summary">この状態は通常攻撃モデルの対象外です。</p><p>'+esc(result.reason)+'</p>';
    if(result.state==='unsupported')return '<p class="lab-as-summary">段階表の個別適用は未確認です。</p><p>現在は補正値のみ表示しています。状態欄で「共通段階表で仮の参考計算」を選ぶと、仮定したモデルを表示できます。</p>';
    if(result.state==='outside')return '<p class="lab-as-summary">資料の確認範囲外です。</p><p>攻撃間隔や次の段階は、推測で補いません。</p>';
    if(result.state==='invalid')return '<p class="lab-as-summary">速度補正のデータがありません。</p>';
    if(result.state==='boundary')return `<p class="lab-as-summary">境界が未確定の範囲です。</p><p>${result.candidates.map(f=>`${f}F（約${fmt(f/60)}秒）`).join(' または ')}。間隔を一つに断定できません。</p>`;
    const next=result.next;
    const remaining=next?(next.min===next.max?(next.deltaMax<.01?'+0.01ポイント未満（境界を超える必要があります）':`約 +${fmt(next.deltaMax)}ポイント`):`+${fmt(next.deltaMin)}〜${fmt(next.deltaMax)}ポイント`):'';
    const distance=next?.deltaMax>=.01?'<span class="lab-as-distance">'+remaining+'</span>':remaining;
    const summary=next?(next.deltaMax===0?'次のライン上です。補正を少し増やすと、次の段階になります。':'次のラインまで、あと '+distance):'次の段階は資料未確認です。';
    return `<p class="lab-as-summary" role="status">${summary}</p>
      <p class="lab-as-numbers">${result.hypothetical?'モデル上':'いま'} <strong>約${fmt(result.seconds)}秒ごと</strong>${next?`<span>次の段階 <strong>約${fmt(next.frames/60)}秒ごと</strong></span>`:''}</p>`;
  }
  function controlsHtml(result){
    const r=result.resolved;if(!r||(r.states.length===1&&!r.effects.length))return '';
    return `<details class="lab-as-options" data-disclosure="options"><summary>通常攻撃の状態を変更</summary><div class="lab-as-controls">
      ${r.states.length>1?`<label for="labSpeedState">状態</label><select class="lab-select" id="labSpeedState" data-speed-state="1">${r.states.map(s=>`<option value="${esc(s.id)}"${s.id===r.state.id?' selected':''}>${esc(s.label)}</option>`).join('')}</select>`:''}
      ${r.effects.map(e=>`<label for="labSpeedEffect-${esc(e.id)}">${esc(e.label)}</label><select class="lab-select" id="labSpeedEffect-${esc(e.id)}" data-speed-effect="${esc(e.id)}">${e.options.map(o=>`<option value="${esc(o.id)}"${o.id===e.selected.id?' selected':''}>${esc(o.label)}</option>`).join('')}</select>`).join('')}
      ${['common','model'].includes(r.state.kind)?'<p>選んだ効果だけを速度欄に加えます。時間経過や自動切替は再現しません。</p>':''}
    </div></details>`;
  }
  function render(input){
    last=input;
    const host=get();if(!host)return;
    if(!input){host.hidden=true;host.innerHTML='';selectedPokemon='';selection={stateId:null,effects:{}};return;}
    host.hidden=false;
    if(!data){host.innerHTML='<h2>通常攻撃の速さ</h2><p>速度の資料を読み込んでいます…</p>';load();return;}
    const {poke,lv,computed,activeEffects}=input,profile=data.profiles[poke];
    if(selectedPokemon!==poke){selectedPokemon=poke;selection={stateId:null,effects:{}};}
    const profileCounts=Object.fromEntries(['reference','fixed','unconfirmed'].map(status=>[status,Object.values(data.profiles).filter(p=>p.status===status).length]));
    const result=LabAttackSpeedCore.calculate({bonus:computed.totals[key],profile,lv,stateId:selection.stateId,effects:selection.effects},data.rules);
    if(result.resolved)selection=result.resolved.selections;
    const badge=result.hypothetical?'個別適用は未確認のモデル':({fixed:'固定動作',excluded:'この状態は対象外',unsupported:'個別適用は未確認'})[result.state]||'強化攻撃を除く参考値';
    const opened=[...host.querySelectorAll('details[open]')].map(d=>d.dataset.disclosure);
    host.dataset.state=result.state;
    host.innerHTML=`<div class="lab-as-heading"><h2>通常攻撃の速さ</h2><span>${badge}</span></div>
      <p class="lab-as-intro">${['reference','model','boundary'].includes(result.state)?'色の先端が現在値。縦線を超えると、1段階速くなります。':'攻撃速度の補正値と、計算できる範囲を確認できます。'}</p>
      <p class="lab-as-context">${esc(poke)} Lv${lv} ／ れんだスカーフ ${activeEffects.includes('れんだスカーフ')?'発動中':'OFF'}</p>
      ${profile?.note&&!['fixed','unconfirmed'].includes(profile.status)?`<p class="lab-as-scope-note">${esc(profile.note)}</p>`:''}
      ${result.resolved&&(result.resolved.states.length>1||result.resolved.effects.length)?`<p class="lab-as-selected">状態：${esc(result.resolved.state.label)}${result.modelExtra?' ／ 固有補正 '+(result.modelExtra>0?'+':'')+fmt(result.modelExtra)+'%':''}</p>`:''}
      ${controlsHtml(result)}
      ${result.hypothetical?'<p class="lab-as-scope-note">このポケモンへの段階表の個別適用は未確認です。以下は共通段階表を仮定した参考計算で、ゲーム内の攻撃間隔を保証しません。</p>':''}
      ${graphHtml(result,data.rules)}${resultHtml(result)}
      <details data-disclosure="breakdown"><summary>攻撃速度の補正内訳 <span>${Number.isFinite(result.bonus)?'+'+fmt(result.bonus)+'%':'未収録'}</span></summary>
        <dl>${[['レベルによる基本補正',computed.base[key]],['もちもの（発動中の効果を含む）',computed.itemBonus[key]||0],['メダル',computed.medalBonus[key]||0],...(result.modelExtra?[['選択した形態・固有効果',result.modelExtra]]:[])].map(([label,value])=>`<div><dt>${label}</dt><dd>${Number.isFinite(value)?(value>=0?'+':'')+fmt(value)+'%':'未収録'}</dd></div>`).join('')}</dl>
        ${['reference','model'].includes(result.state)?`<p>理論上の回数：約${fmt(result.attacksPerSecond)}回／秒。強化攻撃を含む実戦の回数ではありません。</p>`:''}
        ${result.state==='fixed'?'<p>入力の補正内訳です。固定アニメーションの間隔には適用しません。</p>':''}
      </details>
      <details data-disclosure="scope"><summary>計算対象と注意点</summary>
        <p>${esc(data.rules.scope)}</p><p>全${Object.keys(data.profiles).length}体を個別確認。段階表の資料モデル${profileCounts.reference}体、固定動作${profileCounts.fixed}体、個別適用未確認${profileCounts.unconfirmed}体です。未確認対象では選択時だけ仮の共通モデルを表示します。現行ゲームの実測値ではありません。</p>
        ${profile?.review?`<p>このポケモンの確認範囲：${esc(profile.review)}</p>`:''}
        ${profile?.reason?`<p>${esc(profile.reason)}</p>`:''}
        <p>状態の選択はこの速度欄だけに反映します。ほかのステータスやダメージ計算、条件共有には反映しません。</p>
        <p>Fは60fps換算のフレームです。数値は表示用に丸めています。段階の判定には丸め前の値を使います。</p>
        <p>一点の境界は、その値を超えると次の段階になります。一致する場合は前の段階です。帯の中では段階を断定しません。</p>
        <p><a href="${data.rules.source}" target="_blank" rel="noopener noreferrer">Mathcordの原資料</a> ／ <a href="${data.rules.calculator}" target="_blank" rel="noopener noreferrer">公開計算表</a>（資料確認：${esc(data.rules.checkedAt)}。対応ゲーム版は未確定）</p>
      </details>`;
    for(const detail of host.querySelectorAll('details'))detail.open=opened.includes(detail.dataset.disclosure)||(detail.dataset.disclosure==='options'&&result.state==='unsupported');
  }
  get()?.addEventListener('change',event=>{
    const focusId=event.target.id;
    if(event.target.dataset.speedState){selection.stateId=event.target.value;selection.effects={};}
    else if(event.target.dataset.speedEffect)selection.effects[event.target.dataset.speedEffect]=event.target.value;
    else return;
    if(last){render(last);get()?.querySelector('#'+CSS.escape(focusId))?.focus({preventScroll:true});}
  });
  return {render};
})();
