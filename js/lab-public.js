// 閲覧URLだけのナビゲーション。認証・対戦記録・永続保存から独立させる。
window.LabPublic=(()=>{
  const enabled=!!window.LAB_PUBLIC_MODE,el=id=>document.getElementById(id);
  const tools=['ratio','calc','dmg','medal'];
  let restoring=false,serial=0,current={pokemon:'',tool:'ratio'};
  const dataUrl=p=>new URL('lab/'+(p?'pokemon/'+encodeURIComponent(p)+'/':'')+'index.html',location.href.split('?')[0]);
  function selected(pokemon,tool=current.tool){
    if(!enabled||restoring)return;
    const next={pokemon:pokemon||'',tool:tools.includes(tool)?tool:'ratio'};
    if(next.pokemon===current.pokemon&&next.tool===current.tool)return;
    current=next;
    const url=new URL(location.href);url.searchParams.set('lab',next.pokemon);url.searchParams.set('tool',next.tool);
    // 条件共有の確認中はそのリンクを保つ。
    history.pushState(null,'',url);metadata();
  }
  function metadata(){
    if(!enabled)return;
    document.title=(current.pokemon?current.pokemon+'｜':'')+'ユナイトラボ';
    el('labPublicData').href=dataUrl(current.pokemon).href;
    let canonical=document.querySelector('link[rel="canonical"]');
    if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}
    canonical.href=new URL('lab/'+(current.pokemon?'pokemon/'+encodeURIComponent(current.pokemon)+'/':''),'https://36odi.github.io/pokemon-unite-tracker/').href;
    document.querySelector('meta[name="description"]').content=(current.pokemon?current.pokemon+'の':'')+'わざ・基礎ステータス・ダメージを確認できるログイン不要のラボです。';
    document.querySelector('meta[property="og:title"]').content=document.title;
    document.querySelector('meta[property="og:url"]').content=canonical.href;
  }
  function tabChanged(tool){
    if(!enabled||restoring)return;
    const p=current.pokemon;
    if(tool==='ratio'){ratioPokemon=p;ratioSearch();if(p)ratioRender();}
    if(tool==='calc'){el('labPokeSelect').value=p;calcLabStats(false);}
    if(tool==='dmg'&&el('dcAtkPoke').value!==p){el('dcAtkPoke').value=p;dcPokeChanged();}
    selected(p,tool);
  }
  async function restore(){
    const token=++serial;
    restoring=true;
    try{
      await whenLibReady('lab');if(token!==serial)return;
      loadLabData();
      const query=new URLSearchParams(location.search),pokemon=query.get('lab')||'',tool=tools.includes(query.get('tool'))?query.get('tool'):'ratio';
      current={pokemon:Object.hasOwn(LAB_STATUS,pokemon)?pokemon:'',tool};
      switchLab(tool);
      ratioPokemon=current.pokemon;ratioType='all';el('ratioSearch').value='';ratioSearch();
      if(current.pokemon)ratioRender();else el('ratioResult').textContent=pokemon?'指定されたポケモンは見つかりません。一覧から選択してください。':'ポケモンを選ぶと、全わざのレシオを表示します。';
      el('labPokeSelect').value=current.pokemon;calcLabStats(false);
      dcInitUI();el('dcAtkPoke').value=current.pokemon;
      if(current.pokemon)dcPokeChanged();
      metadata();
    }catch{el('labPublicNotice').textContent='データを読み込めませんでした。ページを再読み込みしてください。';}
    finally{if(token===serial)restoring=false;}
  }
  if(enabled){
    document.documentElement.classList.add('lab-public-mode');
    el('loading').style.display='none';el('authSection').style.display='none';el('appSection').style.display='block';
    const nav=document.createElement('nav');nav.className='lab-public-nav';nav.setAttribute('aria-label','ラボの入口');
    nav.innerHTML='<a id="labPublicData" href="lab/index.html">ポケモン別データ</a><a href="index.html">対戦記録・ログインへ</a><p id="labPublicNotice">ログイン不要のラボです。保存はこのページ内だけの一時保存で、閉じると消えます。</p>';
    el('labPage').prepend(nav);
    const desc=el('lcLibrary').querySelector(':scope > p.lr-caption');if(desc)desc.textContent='保存一覧はこのページ内だけの一時保存です。再読み込みすると消えます。条件共有リンクは別の端末でも利用できます。';
    el('lcImportDialog').querySelector('p.lr-caption').textContent='読み込むと現在の計算条件を置き換えます。ログインやゲスト利用を開始せず、このページで計算します。';
    el('lcSave').textContent='このページに一時保存';
    el('lcSaveDialog').querySelector('h2').textContent='計算条件を一時保存';
    el('lcSaveDialog').querySelector('p.lr-caption').textContent='このページ内に一時保存します。閉じると消えます。端末やアカウントの保存一覧には追加しません。';
    showPage('lab');restore();
    window.addEventListener('popstate',restore);
    el('labPage').addEventListener('change',event=>{
      if(event.target.id==='labPokeSelect')selected(event.target.value,'calc');
      if(event.target.id==='dcAtkPoke')selected(event.target.value,'dmg');
    });
  }
  return {selected,tabChanged,dataUrl};
})();
