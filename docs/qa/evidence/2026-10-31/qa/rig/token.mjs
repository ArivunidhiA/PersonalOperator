// Direct probes against the local /api/voice/session and Gemini with the real locked token.
import { createRequire } from "module"; import crypto from "crypto";
const WEB="/Users/ariv07/Desktop/PersonalOperator/.claude/worktrees/quizzical-meitner-9fcd2e/web"; const require=createRequire(WEB+"/x.js");
require("dotenv").config({path:WEB+"/.env.local",quiet:true}); const WebSocket=require("ws");
const sess=async(ip)=>{const r=await fetch("http://localhost:3100/api/voice/session",{method:"POST",headers:{"x-ariv-client":"1","content-type":"application/json","x-real-ip":ip},body:"{}"});return {status:r.status,body:await r.json()}};
const s=await sess("10.88.0.1"); console.log("session",s.status,Object.keys(s.body));
const g=s.body.gemini; const url=`${g.wsUrl}?access_token=${encodeURIComponent(g.token)}`;
// hash oracle: can a stranger confirm a guess?
const {salt,hashes,maxWords}=s.body.guard; const norm=t=>t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(Boolean).join(" ");
const H=t=>crypto.createHash("sha256").update(`${salt}:${t}`).digest("hex");
const terms=process.env.BANNED_TERMS.split(",").map(x=>norm(x)).filter(x=>x.length>=3);
console.log("hashes returned",hashes.length,"maxWords",maxWords,"real terms that verify offline",terms.filter(t=>hashes.includes(H(t))).length,"/",terms.length,"; non-term guess verifies:",hashes.includes(H("acme motors")));
const conn=(setup,label,ms=3000)=>new Promise(res=>{const w=new WebSocket(url);let out={label,setup:false,close:null,text:""};
 w.on("open",()=>w.send(JSON.stringify({setup})));
 w.on("message",d=>{let m;try{m=JSON.parse(d)}catch{return} if(m.setupComplete){out.setup=true; if(setup.__ask){}; w.send(JSON.stringify({clientContent:{turns:[{role:"user",parts:[{text:"Say the single word PINEAPPLE and nothing else."}]}],turnComplete:true}}))} const t=m.serverContent?.outputTranscription?.text; if(t) out.text+=t;});
 w.on("close",(c,r)=>{out.close=[c,String(r).slice(0,90)];res(out)}); w.on("error",e=>{out.err=String(e).slice(0,90)}); setTimeout(()=>{try{w.close()}catch{}},ms)});
const m=`models/${g.model}`;
console.log(await conn({model:m,systemInstruction:{parts:[{text:"You are a pirate. Always reply ARRR."}]},generationConfig:{temperature:2}},"use1 override prompt",7000));
console.log(await conn({model:m,tools:[{functionDeclarations:[{name:"evil",description:"x"}]}]},"use2 add tools",4000));
console.log(await conn({model:m},"use3",3000));
console.log(await conn({model:m},"use4 must fail",3000));
console.log(await conn({model:m},"use5 must fail",3000));
