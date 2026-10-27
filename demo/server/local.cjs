const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.join(__dirname,'..');
const externalEnv=new Set(Object.keys(process.env));
for(const file of ['.env','.env.local']){
 const envPath=path.join(ROOT,file);
 if(fs.existsSync(envPath))for(const [key,value] of Object.entries(require('node:util').parseEnv(fs.readFileSync(envPath,'utf8'))))if(!externalEnv.has(key))process.env[key]=value;
}
const browserScripts=['data.js','kb.js','locales.js','region_locales.js','action_locales.js','ui_locales.js','detail_locales.js','final_locales.js','supply_locales.js','i18n.js','action_templates.js','engine.js','charts.js','app.js'];
const publicFiles=new Set(['index.html','style.css',...browserScripts,'tests/browser_qa.js']);
async function createServer(){
 const {default:handler}=await import('../api/qwen.mjs');
 return http.createServer(async(req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(_){res.statusCode=400;return res.end();}
  if(name==='/api/qwen'||name==='/demo/api/qwen')return handler(req,res);
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end();}
  name=name.replace(/^\/demo\//,'/').replace(/^\//,'')||'index.html';
  if(!publicFiles.has(name)){res.statusCode=404;return res.end('Not found');}
  try{const data=fs.readFileSync(path.join(ROOT,name));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(req.method==='HEAD'?undefined:data);}catch(_){res.statusCode=404;res.end();}
 });
}
if(require.main===module)createServer().then(server=>server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log(`Local demo: http://localhost:${server.address().port} (Qwen API enabled)`))).catch(()=>{console.error('Server startup failed. Use Node.js 22 or later and check your configuration.');process.exitCode=1;});
module.exports={createServer};
