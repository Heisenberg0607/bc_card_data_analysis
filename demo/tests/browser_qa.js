/* Local opt-in regression harness: index.html?qa=1. Never calls the paid LLM API. */
(async()=>{
 const report={errors:[],languages:{},missing:[],interactionChecks:{}};
 window.addEventListener('error',e=>report.errors.push(e.message));
 const pause=()=>new Promise(r=>setTimeout(r,40));
 const sourceMissing=new Set();
 const invariants=[];
 for(const lang of ['ko','en','zh-CN']) {
   I18n.set(lang);await pause();
   for(const t of ['region','nation','kb','eval','data']) {BC_APP.setTab(t);await pause();}
   const batch=Engine.batchEvaluate();
   report.languages[lang]=batch;
   if(lang!=='ko')for(const s of I18n.missing)sourceMissing.add(s);
   invariants.push(BC_DATA.regions.map(r=>{const p=Engine.runRules(r),cards=Engine.generateTemplate(r,p);return cards.map(c=>[c.cell_id,c.strength,c.evidence_ids]).flat();}));
   for(const r of BC_DATA.regions.filter(r=>!r.ctx.strict)) {
     const p=Engine.runRules(r),cs=Engine.generateTemplate(r,p);
     if(cs.some(c=>!c.cell_id.startsWith('HOLD-') || c.evidence_ids.some(id=>id.startsWith('POL-'))))report.errors.push('Context gate failed '+r.id);
   }
 }
 report.crossLanguageIdsEqual=JSON.stringify(invariants[0])===JSON.stringify(invariants[1]) && JSON.stringify(invariants[0])===JSON.stringify(invariants[2]);
 I18n.set('en');BC_APP.setTab('region');await pause();
 const input=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
 input('search','Yeongam');await pause();
 report.interactionChecks.englishSearch=document.querySelectorAll('#regionList li[data-id]').length===1;
 input('search','NO_REGION_EXISTS_123');await pause();
 report.interactionChecks.emptyState=!!document.querySelector('#regionList .empty');
 document.querySelector('#regionList .empty').click();await pause();
 input('search','');input('fCtx','분류보류');await pause();
 report.interactionChecks.pendingFilter=document.querySelectorAll('#regionList li[data-id]').length===4;
 input('fCtx','');input('fSort','conf_asc');await pause();
 const first=document.querySelector('#regionList li[data-id]')?.dataset.id;
 report.interactionChecks.sort=BC_DATA.regions.find(r=>r.id===first)?.confidence==='Low';
 input('fSort','famt');
 BC_APP.select('전라남도 영암군');await BC_APP.generate();await pause();
 const before=BC_APP.state.result?.cards.map(c=>[c.cell_id,c.strength,c.evidence_ids]);
 I18n.set('zh-CN');await pause();
 report.interactionChecks.generatedResultsRefresh=BC_APP.state.result?.cards.every(c=>c.language==='zh-CN') && JSON.stringify(before)===JSON.stringify(BC_APP.state.result.cards.map(c=>[c.cell_id,c.strength,c.evidence_ids]));
 report.interactionChecks.urlLanguage=new URLSearchParams(location.search).get('lang')==='zh-CN';
 report.interactionChecks.savedLanguage=localStorage.getItem('bc-lang')==='zh-CN';
 BC_APP.setTab('nation');await pause();
 const circles=[...document.querySelectorAll('#chScatter circle')];
 report.interactionChecks.scatterHas255Points=circles.length===255;
 report.interactionChecks.scatterDistinctX=new Set(circles.map(e=>e.getAttribute('cx'))).size>200;
 circles[0].dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:400,clientY:400}));await pause();
 report.interactionChecks.tooltipVisible=document.getElementById('tip').classList.contains('on');
 circles[0].dispatchEvent(new MouseEvent('mouseleave'));circles[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));await pause();
 report.interactionChecks.scatterClick=BC_APP.state.tab==='region';
 for(const lang of ['en','zh-CN']) {
   I18n.set(lang);BC_APP.setTab('region');await pause();
   for(const r of BC_DATA.regions.filter(r=>!r.ctx.strict)) {BC_APP.select(r.id);await pause();}
   for(const s of I18n.missing)sourceMissing.add(s);
 }
 for(const [k,v] of Object.entries(report.interactionChecks))if(!v)report.errors.push('Interaction failed: '+k);
 // Test responsive layout inside a real same-origin 390px viewport.
 const frame=document.createElement('iframe');frame.style='width:390px;height:900px;border:0;position:absolute;left:0;top:0';
 const ready=new Promise(resolve=>frame.onload=resolve);frame.src='./index.html?lang=en&mobileQA=1';document.body.append(frame);await ready;await pause();
 report.interactionChecks.mobileNoPageOverflow=frame.contentDocument.documentElement.scrollWidth<=frame.contentDocument.documentElement.clientWidth+1;
 frame.remove();
 if(!report.interactionChecks.mobileNoPageOverflow)report.errors.push('390px viewport overflows');
 report.missing=[...sourceMissing];
 report.missing=[...sourceMissing];
 I18n.set('en');BC_APP.setTab('region');await pause();
 const out=document.createElement('pre');out.id='qaResults';out.style='position:relative;z-index:99;white-space:pre-wrap;background:white;color:black;padding:24px';out.textContent=JSON.stringify(report,null,2);document.body.prepend(out);
})().catch(e=>{const out=document.createElement('pre');out.id='qaResults';out.textContent=e.stack;document.body.prepend(out)});
