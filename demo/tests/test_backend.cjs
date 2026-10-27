const assert=require('node:assert/strict');
const {generate,endpoint}=require('../server/qwen.cjs');
const env={DASHSCOPE_API_KEY:'TEST_ONLY_NOT_A_REAL_KEY',DASHSCOPE_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1',QWEN_MODEL:'qwen3.8-max'};
const region='전라남도 영암군';
(async()=>{
 let calls=0;
 for(const lang of ['ko','en','zh-CN']){
  const result=await generate({region,lang},{env,fetchImpl:async(url,opts)=>{
   calls++;assert.equal(url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');assert.equal(opts.headers.Authorization,'Bearer '+env.DASHSCOPE_API_KEY);
   const body=JSON.parse(opts.body);assert.equal(body.model,'qwen3.8-max');assert.equal(body.enable_thinking,false);assert.equal(body.response_format.type,'json_object');
   assert(!opts.body.includes(env.DASHSCOPE_API_KEY));assert(body.messages[0].content.includes({ko:'Korean',en:'English','zh-CN':'Simplified Chinese'}[lang]));
   const packet=JSON.parse(body.messages[1].content.split('\n\n')[1]);assert.equal(packet.output_language,lang);assert.equal(packet.candidates.length,3);
   return {ok:true,json:async()=>({choices:[{message:{content:'{"cards":[]}'},finish_reason:'stop'}],model:body.model,usage:{prompt_tokens:12,completion_tokens:34},ignored_secret:env.DASHSCOPE_API_KEY})};
  }});
  assert.equal(result.status,200);assert.equal(result.body.usage.prompt_tokens,12);assert(!JSON.stringify(result).includes(env.DASHSCOPE_API_KEY));
 }
 assert.equal((await generate({region,lang:'ko'},{env:{}})).body.error.code,'QWEN_NOT_CONFIGURED');
 for(const body of [{region,lang:'xx'},{region,lang:'ko',model:'arbitrary'},{region,lang:'ko',messages:[]},{region:'unknown',lang:'ko'}])assert.equal((await generate(body,{env})).status,400);
 for(const url of ['https://evil.test/compatible-mode/v1','http://dashscope.aliyuncs.com/compatible-mode/v1','https://dashscope.aliyuncs.com.evil.test/compatible-mode/v1','https://dashscope.aliyuncs.com/compatible-mode/v1?secret=x'])assert.throws(()=>endpoint(url));
 assert.equal(endpoint('https://test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/'),'https://test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
 const auth=await generate({region,lang:'ko'},{env,fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:env.DASHSCOPE_API_KEY}})})});assert.equal(auth.body.error.code,'QWEN_AUTH_ERROR');assert(!JSON.stringify(auth).includes(env.DASHSCOPE_API_KEY));
 assert.equal((await generate({region,lang:'ko'},{env,fetchImpl:async()=>{throw Object.assign(new Error('secret'),{name:'TimeoutError'});}})).body.error.code,'QWEN_TIMEOUT');
 const originalFetch=global.fetch,oldKey=process.env.DASHSCOPE_API_KEY;
 const {createServer}=require('../server/local.cjs');process.env.DASHSCOPE_API_KEY=env.DASHSCOPE_API_KEY;
 const server=await createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await originalFetch(base+'/')).status,200);
  for(const file of ['/.env','/.env.local','/demo/.env.local','/server/qwen.cjs','/api/qwen.mjs','/package.json','/../.env'])assert.equal((await originalFetch(base+file)).status,404,file);
  assert.equal((await originalFetch(base+'/api/qwen')).status,405);
  assert.equal((await originalFetch(base+'/api/qwen',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:JSON.stringify({region,lang:'ko'})})).status,403);
  assert.equal((await originalFetch(base+'/api/qwen',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(3000)})).status,413);
  global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"cards":[]}'},finish_reason:'stop'}],model:env.QWEN_MODEL})});
  const result=await originalFetch(base+'/api/qwen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({region,lang:'ko'})});assert.equal(result.status,200);assert(!(await result.text()).includes(env.DASHSCOPE_API_KEY));
 }finally{global.fetch=originalFetch;if(oldKey===undefined)delete process.env.DASHSCOPE_API_KEY;else process.env.DASHSCOPE_API_KEY=oldKey;await new Promise(r=>server.close(r));}
 console.log(JSON.stringify({serverLanguageChecks:3,upstreamMockCalls:calls,serverOnlyCredentials:true,canonicalInput:true,endpointAllowlist:true,authErrorRedaction:true,timeout:true,envFileBlocked:true,httpEndpoint:true,realApiCalls:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
