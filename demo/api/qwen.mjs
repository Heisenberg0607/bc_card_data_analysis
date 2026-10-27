import service from '../server/qwen.cjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{error:{code:'QWEN_METHOD_NOT_ALLOWED'}});}
 if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:{code:'QWEN_BAD_REQUEST'}});}catch(_){return send(403,{error:{code:'QWEN_BAD_REQUEST'}});}}
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:{code:'QWEN_BAD_REQUEST'}});
 let body=req.body;
 try{
  if(body===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2048)return send(413,{error:{code:'QWEN_BAD_REQUEST'}});}body=JSON.parse(raw);}
  else if(typeof body==='string'){if(Buffer.byteLength(body)>2048)return send(413,{error:{code:'QWEN_BAD_REQUEST'}});body=JSON.parse(body);}
  else if(Buffer.byteLength(JSON.stringify(body))>2048)return send(413,{error:{code:'QWEN_BAD_REQUEST'}});
 }catch(_){return send(400,{error:{code:'QWEN_BAD_REQUEST'}});}
 try{const result=await service.generate(body);return send(result.status,result.body);}
 catch(_){return send(500,{error:{code:'QWEN_SERVER_ERROR'}});}
}
