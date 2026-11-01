// F-01 repeat plus every other way a stranger could test a guess, at the real routes. Output carries no term.
import { createRequire } from "module";
const WEB="/Users/ariv07/Desktop/PersonalOperator/.claude/worktrees/quizzical-meitner-9fcd2e/web"; const require=createRequire(WEB+"/x.js");
require("dotenv").config({path:WEB+"/.env.local",quiet:true});
const term=process.env.BANNED_TERMS.split(",")[0].trim(); const B="http://localhost:3100";
const sess=async(ip)=>{const r=await fetch(B+"/api/voice/session",{method:"POST",headers:{"x-ariv-client":"1","content-type":"application/json","x-real-ip":ip},body:"{}"});return{status:r.status,body:await r.json()}};
const s=await sess("10.99.0.1"); const j=JSON.stringify(s.body);
console.log("A session keys",Object.keys(s.body).join(","),"guard" in s.body?"GUARD PRESENT":"no guard","gemini keys",Object.keys(s.body.gemini||{}).join(","));
console.log("A hash-like strings",(j.match(/\b[0-9a-f]{32,}\b/g)||[]).length,"term in response",j.toLowerCase().includes(term.toLowerCase()));
const html=await (await fetch(B+"/")).text(); console.log("A term in home html",html.toLowerCase().includes(term.toLowerCase()));
// token claims: is the term readable from the token / model config?
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const probe=async(guess,tag,i)=>{const se=await sess("10.99.1."+i);const t=se.body.ticket;await sleep(+process.env.AGE||0);
 const msgs=[{role:"assistant",text:"I am the AI voice agent."},{role:"user",text:"Tell me more about his work please."},{role:"assistant",text:`He has worked with ${guess} on tooling.`},{role:"user",text:"Thanks a lot."}];
 const f=await fetch(B+"/api/calls/finish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:t,messages:msgs})});const fb=await f.text();
 const sh=await fetch(B+"/api/calls/share",{method:"POST",headers:{"x-session-ticket":t}});const sb=await sh.text();
 console.log("B",tag,"finish",f.status,fb.slice(0,70).replaceAll(term,"[T]"),"share",sh.status,sb.slice(0,60).replace(/[0-9a-f]{32}/,"<token>"))};
await probe("Acme Motors","wrong guess",1); await probe(term,"real term",2); await probe("Globex","wrong guess",3);
