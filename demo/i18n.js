/* Presentation-only localization. Canonical data, select values and rule IDs are never translated. */
window.I18n = (() => {
  const supported = ['ko','en','zh-CN'];
  let stored; try { stored = localStorage.getItem('bc-lang'); } catch (_) {}
  const query = new URLSearchParams(location.search).get('lang');
  let lang = supported.includes(query) ? query : supported.includes(stored) ? stored : 'ko';
  const originals = new WeakMap(), attrs = new WeakMap(), missing = new Set();
  const catalog = window.BC_LOCALES;
  const keys = Object.keys(catalog).sort((a,b) => b.length-a.length);
  const escapeRE = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterned = keys.filter(k => /\{\d+\}/.test(k)).map(k => {
    const parts = k.split(/(\{\d+\})/);
    const unit = /^\{0\}(억원|억|만명|명|만|분|시간|일|개|건)$/.test(k);
    return { key:k, re:new RegExp('^'+parts.map(s => /^\{\d+\}$/.test(s) ? (unit ? '([+−-]?[0-9][0-9,.]*)' : '(.+?)') : escapeRE(s)).join('')+'$') };
  });
  function msg(key, ...values) {
    const row = catalog[key];
    const template = lang === 'ko' ? row?.ko ?? key : row?.[lang] ?? key;
    return template.replace(/\{(\d+)\}/g, (_,i) => String(values[i] ?? ''));
  }
  function text(value) {
    const str = String(value ?? '');
    const lead = str.match(/^\s*/)[0], tail = str.match(/\s*$/)[0], core = str.trim();
    if (catalog[core]) return lead + msg(core) + tail;
    if (lang === 'ko' || !/[가-힣]/.test(str)) return str;
    for (const p of patterned) {
      const m = core.match(p.re);
      if (m) return lead + msg(p.key,...m.slice(1).map(text)) + tail;
    }
    let out = str;
    out = out.replace(/([+−-]?[0-9][0-9,.]*)(억원|억|만명|시간|분|일|명|만|개|건)(?![가-힣])/g, (_,v,u)=>msg('{0}'+u,v));
    // Longest phrases first. These replacements affect display text only.
    for (const key of keys) if (!/\{\d+\}/.test(key) && out.includes(key)) out = out.split(key).join(msg(key));
    if (/[가-힣]/.test(out)) missing.add(core);
    return out;
  }
  function translateDOM(root=document.body) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n=walk.nextNode())) {
      if (n.parentElement?.closest('script,style,pre,code,[data-original-title],[data-no-translate],#langSwitch')) continue;
      const prev=originals.get(n);
      const source = prev && n.nodeValue === prev.rendered ? prev.source : n.nodeValue;
      if (n.parentElement?.tagName === 'OPTION' && !n.parentElement.hasAttribute('value')) n.parentElement.setAttribute('value',source);
      const rendered=text(source);
      originals.set(n,{source,rendered});
      if(n.nodeValue!==rendered) n.nodeValue=rendered;
    }
    for (const el of root.querySelectorAll('[title],[placeholder],[aria-label]')) {
      if (el.closest('[data-original-title],[data-no-translate],#langSwitch')) continue;
      let map=attrs.get(el); if(!map){map={};attrs.set(el,map);}
      for(const name of ['title','placeholder','aria-label']) if(el.hasAttribute(name)) {
        const current=el.getAttribute(name), prev=map[name];
        const source=prev && prev.rendered===current ? prev.source : current, rendered=text(source);
        map[name]={source,rendered}; if(current!==rendered) el.setAttribute(name,rendered);
      }
    }
  }
  function set(next) {
    if (!supported.includes(next)) return;
    lang=next; missing.clear();
    document.documentElement.lang=lang;
    document.title=msg('외국인 상권 Action KB');
    try {localStorage.setItem('bc-lang',lang);}catch(_){}
    const url=new URL(location.href);url.searchParams.set('lang',lang);history.replaceState(null,'',url);
    document.dispatchEvent(new CustomEvent('bc-language-change'));
    translateDOM();
    for(const b of document.querySelectorAll('#langSwitch button')) b.setAttribute('aria-pressed',String(b.dataset.lang===lang));
  }
  function start() {
    const box=document.createElement('div');box.id='langSwitch';box.className='seg';box.setAttribute('aria-label','Language');
    box.innerHTML='<button data-lang="ko">한국어</button><button data-lang="en">English</button><button data-lang="zh-CN">简体中文</button>';
    document.querySelector('.top-right').prepend(box);
    box.onclick=e=>{const b=e.target.closest('button');if(b)set(b.dataset.lang);};
    // Observe display updates, including chart tooltips and asynchronous errors.
    const observer=new MutationObserver(()=>{observer.disconnect();translateDOM();observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label']});});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label']});
    set(lang);
  }
  return {get lang(){return lang;},text,msg,set,start,translateDOM,missing,
    languageName:()=>({ko:'Korean',en:'English','zh-CN':'Simplified Chinese'}[lang]),
    searchRegion:(r,q)=>[r.id,text(r.id),text(r.ccg),text(r.sido)].some(v=>v.toLowerCase().includes(q.toLowerCase()))};
})();
