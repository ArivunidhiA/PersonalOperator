// One session, many names: does a single share request test a whole list?
import { createRequire } from "module";
const WEB="/Users/ariv07/Desktop/PersonalOperator/.claude/worktrees/quizzical-meitner-9fcd2e/web"; const require=createRequire(WEB+"/x.js");
require("dotenv").config({path:WEB+"/.env.local",quiet:true});
const term=process.env.BANNED_TERMS.split(",")[0].trim(); const B="http://localhost:3100"; const names=Array.from({length:200},(_,i)=>"Vendor"+i);
const go=async(list,ip)=>{const s=await(await fetch(B+"/api/voice/session",{method:"POST",headers:{"x-ariv-client":"1","content-type":"application/json","x-real-ip":ip},body:"{}"})).json();await new Promise(r=>setTimeout(r,25000));
 const msgs=[{role:"assistant",text:"I am the AI voice agent."},{role:"user",text:"Tell me more about his work please."},{role:"assistant",text:"He has worked with "+list.join(", ")+"."},{role:"user",text:"Thanks a lot."}];
 const f=await fetch(B+"/api/calls/finish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:s.ticket,messages:msgs})});const sh=await fetch(B+"/api/calls/share",{method:"POST",headers:{"x-session-ticket":s.ticket}});return [f.status,sh.status]};
console.log("200 wrong names",await go(names,"10.99.2.1"));console.log("200 names incl real",await go([...names.slice(0,100),term,...names.slice(100)],"10.99.2.2"));
