// In-memory PostgREST subset, so the app's Supabase client never reaches production. Dumps to stubdb.json.
import http from "http"; import fs from "fs"; import path from "path";
const out=path.join(path.dirname(new URL(import.meta.url).pathname),"stubdb.json");
const T={}; let id=1; const log=[];
const parseCond=(k,v)=>{const m=/^(eq|neq|gte|gt|lte|lt|is|in)\.(.*)$/.exec(v);if(!m)return ()=>true;const[,op,val]=m;return r=>{const x=r[k];if(op==="eq")return String(x)===val;if(op==="neq")return String(x)!==val;if(op==="in")return val.replace(/^\(|\)$/g,"").split(",").includes(String(x));if(op==="is")return val==="null"?x==null:String(x)===val;if(op==="gte")return String(x)>=val;if(op==="gt")return String(x)>val;if(op==="lte")return String(x)<=val;if(op==="lt")return String(x)<val;return true}};
const parseOr=(s)=>{const parts=s.replace(/^\(|\)$/g,"").match(/([a-z_]+\.[a-z]+\.(\([^)]*\)|[^,]*))/g)||[];const fs=parts.map(p=>{const[k,...rest]=p.split(".");return parseCond(k,rest.join("."))});return r=>fs.some(f=>f(r))};
http.createServer((q,s)=>{let b="";q.on("data",d=>b+=d);q.on("end",()=>{
 const u=new URL(q.url,"http://x");const m=/^\/rest\/v1\/([a-z_]+)/.exec(u.pathname);log.push(q.method+" "+q.url.slice(0,120));
 if(!m){s.writeHead(404);return s.end("{}")}const t=T[m[1]]??=[];const conds=[];for(const[k,v]of u.searchParams){if(["select","order","limit","offset","on_conflict","columns"].includes(k))continue;if(k==="or")conds.push(parseOr(v));else conds.push(parseCond(k,v))}
 const match=r=>conds.every(f=>f(r));let rows;const prefer=q.headers.prefer||"";const obj=(q.headers.accept||"").includes("vnd.pgrst.object");
 const send=(st,data,extra={})=>{fs.writeFileSync(out,JSON.stringify(T));s.writeHead(st,{"content-type":"application/json",...extra});s.end(JSON.stringify(data))};
 if(q.method==="POST"){const a=[].concat(JSON.parse(b||"[]")).map(r=>({id:id++,created_at:new Date().toISOString(),...r}));t.push(...a);return send(201,prefer.includes("return=representation")?(obj?a[0]:a):null)}
 if(q.method==="PATCH"){rows=t.filter(match);const p=JSON.parse(b||"{}");rows.forEach(r=>Object.assign(r,p));return send(200,prefer.includes("return=representation")?rows:null)}
 if(q.method==="DELETE"){rows=t.filter(match);T[m[1]]=t.filter(r=>!match(r));return send(200,null,{"content-range":`0-0/${rows.length}`})}
 rows=t.filter(match);const lim=+(u.searchParams.get("limit")||0);if(lim)rows=rows.slice(0,lim);
 if(q.method==="HEAD"||prefer.includes("count")){if(q.method==="HEAD"){s.writeHead(200,{"content-range":`0-0/${rows.length}`});return s.end()}}
 if(obj){if(rows.length===1)return send(200,rows[0]);if((q.headers.accept||"").includes("vnd.pgrst.object")&&!rows.length)return send(406,{code:"PGRST116",message:"0 rows",details:"",hint:""})}
 send(200,rows,{"content-range":`0-${rows.length}/${rows.length}`});
})}).listen(54399,"127.0.0.1");
