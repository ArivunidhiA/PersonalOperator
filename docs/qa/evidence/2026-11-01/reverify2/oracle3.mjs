import { createRequire } from "module";
const WEB="/Users/ariv07/Desktop/PersonalOperator/.claude/worktrees/quizzical-meitner-9fcd2e/web"; const require=createRequire(WEB+"/x.js");
require("dotenv").config({path:WEB+"/.env.local",quiet:true});
const term=process.env.BANNED_TERMS.split(",")[0].trim(); const B="http://localhost:3100"; const G=["Northwind","Globex"]; let ipn=1;
const mask=(s,g)=>s.replaceAll(g,"[X]").replace(new RegExp(g,"gi"),"[X]").replace(/[0-9a-f]{32}/g,"<t>");
const sess=async()=>{const r=await fetch(B+"/api/voice/session",{method:"POST",headers:{"x-ariv-client":"1","content-type":"application/json","x-real-ip":"10.98.3."+(ipn++)},body:"{}"});return r.json()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const [tag,g] of [["guess1",G[0]],["REAL",term],["guess2",G[1]]]){
 const s=await sess(); console.log("session",tag,Object.keys(s).join(","));
 const msgs=[{role:"assistant",text:"I am the AI voice agent."},{role:"user",text:`I'm from ${g}, tell me more.`},{role:"assistant",text:`He has worked with ${g} on tooling.`},{role:"user",text:"Thanks a lot."}];
 const t0=Date.now();const f=await fetch(B+"/api/calls/finish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:s.ticket,messages:msgs})});const fb=await f.text();const ms=Date.now()-t0;let k=[];try{k=Object.keys(JSON.parse(fb))}catch{}
 console.log("finish",tag,f.status,ms+"ms keys",k.join(","),"nameInBody",fb.toLowerCase().includes(g.toLowerCase()),mask(fb,g).slice(0,170));
 const sh=await fetch(B+"/api/calls/share",{method:"POST",headers:{"x-session-ticket":s.ticket}});console.log("share",tag,sh.status,await sh.text());
 const em=await fetch(B+"/api/calls/email",{method:"POST",headers:{"x-session-ticket":s.ticket,"content-type":"application/json"},body:"{}"});console.log("email",tag,em.status,mask(await em.text(),g).slice(0,80));
 for(const [name,args] of [["research_role",{company:g,role:"Software Engineer"}],["retrieve_knowledge",{query:`${g} customer`}]]){
  const x=await fetch(B+"/api/tools/execute",{method:"POST",headers:{"content-type":"application/json","x-session-ticket":s.ticket},body:JSON.stringify({name,args,ticket:s.ticket})});const b=await x.text();console.log("tool",tag,name,x.status,b.length,"nameInBody",b.toLowerCase().includes(g.toLowerCase()),mask(b,g).slice(0,200))}
}
