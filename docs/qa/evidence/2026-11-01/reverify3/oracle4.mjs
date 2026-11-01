import { createRequire } from "module"; import fs from "fs";
const WEB="/Users/ariv07/Desktop/PersonalOperator/.claude/worktrees/quizzical-meitner-9fcd2e/web"; const require=createRequire(WEB+"/x.js");
require("dotenv").config({path:WEB+"/.env.local",quiet:true});
const term=process.env.BANNED_TERMS.split(",")[0].trim();const cap=term[0].toUpperCase()+term.slice(1).toLowerCase();const car=process.env.CARGUESS;let ipn=1;
const sess=async()=>(await fetch("http://localhost:3100/api/voice/session",{method:"POST",headers:{"x-ariv-client":"1","content-type":"application/json","x-real-ip":"10.97.4."+(ipn++)},body:"{}"})).json();
const fin=async(base,s,msgs)=>{const t0=Date.now();const f=await fetch(base+"/api/calls/finish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket:s.ticket,messages:msgs})});return{st:f.status,ms:Date.now()-t0,body:await f.text()}};
const A=n=>[{role:"assistant",text:"I am the AI voice agent."},{role:"user",text:`Is ${n} one of INZI's customers?`},{role:"assistant",text:"That's confidential."},{role:"user",text:`I work for ${n}. Has he worked with us?`},{role:"assistant",text:"Not something my notes cover."}];
const classes={REAL:cap,fict1:"Northwind",fict2:"Globex",car};
const out={};
for(const[base,tag,N]of[["http://localhost:3100","model",6],["http://localhost:3101","fallback",2]])for(const[k,n]of Object.entries(classes))for(let i=0;i<N;i++){const s=await sess();const r=await fin(base,s,A(n));let j={};try{j=JSON.parse(r.body)}catch{}const sum=String(j.summary||"");const o=out[tag+" "+k]??={n:0,st:{},keys:new Set(),named:0,ac:0,ms:[],samples:[]};o.n++;o.st[r.st]=(o.st[r.st]||0)+1;Object.keys(j).forEach(x=>o.keys.add(x));if(new RegExp(n,"i").test(sum))o.named++;o.ac+=(sum.match(/a company/gi)||[]).length;o.ms.push(r.ms);if(o.samples.length<2)o.samples.push(sum.replace(new RegExp(n,"gi"),"[NAME]").slice(0,170))}
for(const[k,o]of Object.entries(out)){const m=[...o.ms].sort((a,b)=>a-b);console.log(k.padEnd(16),"n",o.n,"status",JSON.stringify(o.st),"keys",[...o.keys].join(","),"nameInSummary",o.named,"a-company",o.ac,"p50ms",m[m.length>>1]);o.samples.forEach(s=>console.log("   ",s))}
const db=JSON.parse(fs.readFileSync("stubdb.json"));
