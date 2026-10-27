/* node demo/tests/verify_engine.cjs; no packages, network, raw data or API keys needed. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..');
const files=['data.js','kb.js','locales.js','region_locales.js','action_locales.js','ui_locales.js','detail_locales.js','final_locales.js','supply_locales.js','i18n.js','action_templates.js','engine.js'];
function load(lang,saved=lang){
 const ctx=vm.createContext({console,URL,URLSearchParams,location:{search:'?lang='+lang,href:'http://localhost/?lang='+lang},localStorage:{getItem:()=>saved},performance});
 ctx.window=ctx;
 for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
 return ctx;
}
(async()=>{
 const report={languages:{},negativeChecks:[],llmMockChecks:[]};let reference;
 assert.equal(load('en','zh-CN').I18n.lang,'en');
 assert.equal(load('invalid','zh-CN').I18n.lang,'zh-CN');
 assert.equal(load('','en').I18n.lang,'en');
 report.urlOverridesSavedLanguage=true;report.invalidUrlFallsBackToSavedLanguage=true;
 for(const lang of ['ko','en','zh-CN']){
  const c=load(lang),{BC_DATA:D,Engine:E,I18n:L}=c;
  const batch=E.batchEvaluate();report.languages[lang]=JSON.parse(JSON.stringify(batch));
  for(const key of ['numbers','rule_consistency','citation_validity','confidence_ok','context_eligibility','language_compliance']) assert.equal(batch[key],1,lang+' '+key);
  assert.equal(D.regions.length,255);assert.equal(D.regions.filter(r=>!r.ctx.strict).length,4);
  const signature=D.regions.map(r=>{
   assert.equal(r.structure,(r.scale_share>=D.meta.thresholds.scale_cut?'대규모':'소규모')+'·'+(r.tvd>=D.meta.thresholds.tvd_cut?'고괴리':'저괴리'));
   const p=E.runRules(r),cards=E.generateTemplate(r,p);
   if(!r.ctx.strict){assert.equal(r.ctx.gap,null);assert.equal(r.context,'분류보류');assert(cards.every(x=>x.cell_id.startsWith('HOLD-')));assert(p.actions.every(a=>a.level===1));}
   assert(!/[가-힣]/.test(L.text(r.id)) || lang==='ko');
   return cards.map(x=>[x.cell_id,x.strength,x.timing,x.evidence_ids]);
  });
  const json=JSON.stringify(signature);if(reference)assert.equal(json,reference);else reference=json;
  const r=D.regions.find(r=>r.ctx.strict && r.confidence==='Low'),p=E.runRules(r),cards=E.generateTemplate(r,p);
  const bad=JSON.parse(JSON.stringify(cards));bad[0].action+=' [FAKE-ID-99] 99999999999999';bad[0].strength='wrong';
  const ev=E.evaluate(r,p,bad)[0];assert(!ev.citation_valid);assert(ev.numbers<1);assert(!ev.rule_match);
  const low=JSON.parse(JSON.stringify(cards));low[0].action+=' '+c.ActionTemplates.forbidden(lang)[0];assert(!E.evaluate(r,p,low)[0].confidence_ok);
  const pending=D.regions.find(r=>!r.ctx.strict),pp=E.runRules(pending),pc=E.generateTemplate(pending,pp);
  const tampered=JSON.parse(JSON.stringify(pc));tampered[0].action+=' [POL-01]';tampered[0].evidence_ids.push('POL-01');assert(!E.evaluate(pending,pp,tampered)[0].context_ok);
  report.negativeChecks.push({lang,unknownCitationRejected:true,unprovidedNumberRejected:true,wrongIntensityRejected:true,lowConfidenceWordingRejected:true,pendingContextPolicyRejected:true});
  let request;
  c.fetch=async(url,opts)=>{request=JSON.parse(opts.body);return {ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify({cards})}],model:'mock-only',usage:{input_tokens:1,output_tokens:1}})}};
  const response=await E.generateClaude(r,p,{apiKey:'TEST_ONLY_NOT_A_REAL_KEY',model:'mock-only'});
  assert.equal(response.cards.length,3);assert(request.system.includes(L.languageName()));assert.equal(JSON.parse(request.messages[0].content.split('\n\n')[1]).output_language,lang);
  assert(!JSON.stringify(request).includes('TEST_ONLY_NOT_A_REAL_KEY'));
  c.fetch=async()=>({ok:true,json:async()=>({content:[{type:'text',text:'{"cards":[]}'}]})});
  await assert.rejects(()=>E.generateClaude(r,p,{apiKey:'TEST_ONLY_NOT_A_REAL_KEY',model:'mock-only'}));
  report.llmMockChecks.push({lang,languagePrompt:true,threeStakeholders:true,malformedResponseRejected:true,realNetworkCalls:0});
 }
 report.crossLanguageIdsEvidenceIntensityTimingEqual=true;
 fs.writeFileSync(path.join(root,'engine-verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
