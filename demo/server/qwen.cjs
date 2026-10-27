const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
const FILES=['data.js','kb.js','locales.js','region_locales.js','action_locales.js','ui_locales.js','detail_locales.js','final_locales.js','supply_locales.js','i18n.js','action_templates.js','engine.js'];
const scripts=FILES.map(file=>new vm.Script(fs.readFileSync(path.join(ROOT,file),'utf8'),{filename:file}));
function inputFor(region,lang){
 const ctx=vm.createContext({console,URL,URLSearchParams,location:{search:'?lang='+lang,href:'http://localhost/?lang='+lang},localStorage:{getItem:()=>null}});ctx.window=ctx;
 for(const script of scripts)script.runInContext(ctx);
 const r=ctx.BC_DATA.regions.find(r=>r.id===region);if(!r)return null;
 const plan=ctx.Engine.runRules(r);
 return {system:ctx.Engine.SYSTEM.replace('- 한국어로, 각 action은 2~4문장.',`- Write all human-readable fields in ${ctx.I18n.languageName()}. Each action has 2–4 sentences. Preserve cell_id, stakeholder, strength and timing exactly as supplied (internal identifiers). Context classification is deferred for incomplete observations: do not recommend context-dependent actions.`),packet:ctx.Engine.llmInput(r,plan)};
}
function endpoint(base){
 const u=new URL(base.trim().replace(/\/+$/,''));
 const legacy=['dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com','dashscope-us.aliyuncs.com','cn-hongkong.dashscope.aliyuncs.com'];
 const workspace=/^[a-z0-9-]+\.(cn-beijing|ap-southeast-1|cn-hongkong|us-east-1|eu-central-1|ap-northeast-1)\.maas\.aliyuncs\.com$/i;
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||(!legacy.includes(u.hostname)&&!workspace.test(u.hostname))||u.pathname!=='/compatible-mode/v1')throw new Error('Invalid endpoint');
 return u.href+'/chat/completions';
}
const fail=(status,code)=>({status,body:{error:{code}}});
async function generate(body,{env=process.env,fetchImpl=globalThis.fetch}={}){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['region','lang'].includes(k))||typeof body.region!=='string'||body.region.length>100||!['ko','en','zh-CN'].includes(body.lang))return fail(400,'QWEN_BAD_REQUEST');
 const key=env.DASHSCOPE_API_KEY?.trim();
 if(!key||key==='YOUR_DASHSCOPE_API_KEY')return fail(503,'QWEN_NOT_CONFIGURED');
 let url;const model=env.QWEN_MODEL?.trim()||'qwen3.8-max';
 try{url=endpoint(env.DASHSCOPE_BASE_URL||'https://dashscope.aliyuncs.com/compatible-mode/v1');if(!/^qwen[a-z0-9._-]*$/i.test(model))throw new Error();}catch(_){return fail(503,'QWEN_BAD_CONFIG');}
 const input=inputFor(body.region,body.lang);if(!input)return fail(400,'QWEN_BAD_REQUEST');
 try{
  const res=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(50000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model,max_tokens:8192,stream:false,enable_thinking:false,response_format:{type:'json_object'},messages:[{role:'system',content:input.system},{role:'user',content:'Return exactly one JSON object containing three stakeholder Action Cards.\n\n'+JSON.stringify(input.packet)}]})});
  if(!res.ok)return fail(res.status===429?429:502,res.status===401||res.status===403?'QWEN_AUTH_ERROR':res.status===429?'QWEN_RATE_LIMIT':'QWEN_UPSTREAM_ERROR');
  const data=await res.json(),choice=data.choices?.[0];
  if(!choice||typeof choice.message?.content!=='string')return fail(502,'QWEN_UPSTREAM_ERROR');
  return {status:200,body:{choices:[{message:{content:choice.message.content,refusal:choice.message.refusal||null},finish_reason:choice.finish_reason}],model:data.model||model,usage:{prompt_tokens:data.usage?.prompt_tokens,completion_tokens:data.usage?.completion_tokens}}};
 }catch(e){return fail(502,e.name==='TimeoutError'||e.name==='AbortError'?'QWEN_TIMEOUT':'QWEN_UPSTREAM_ERROR');}
}
module.exports={generate,inputFor,endpoint};
