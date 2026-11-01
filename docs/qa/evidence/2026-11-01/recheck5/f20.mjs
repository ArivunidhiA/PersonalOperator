// Frozen honest scenarios until each has 8 model-path summaries. A fallback summary is not counted: wait and redo.
import { launch, call } from "./rig.mjs"; import fs from "fs";
const env=await launch(); const rows=[]; const need={hs_inzi:8,hs_tue:8}; let n=0,fb=0;
const fbk=s=>/^Caller asked (a|\d)|^Short call/.test(s||"");
while(Object.values(need).some(x=>x>0)&&n<40){for(const q of Object.keys(need)){if(need[q]<=0)continue;n++;const c=await call(env,`f20-${n}-${q}`);await c.quiet(1200,12000);await c.say(q);await c.speaks(14000);await c.quiet(1500,18000);await c.sleep(21000);await c.end();await c.sleep(600);let row=null;try{row=JSON.parse(fs.readFileSync("stubdb.json")).call_summaries.find(x=>x.session_id===c.session().sessionId)}catch{}
 const s=row?.summary||"";const a=(row?.transcript||[]).filter(m=>m.role!=="user").map(m=>m.text).join(" ");const u=(row?.transcript||[]).filter(m=>m.role==="user").map(m=>m.text).join(" / ");
 const o={q,path:fbk(s)?"fallback":"model",summary:s,topics:row?.topics,company:row?.company,caller:row?.caller_name,user:u.slice(0,110),agentSaidEastern:/eastern/i.test(a),aCompany:/a company/i.test(s+" "+(row?.topics||[]).join(" ")),inziKept:/inzi/i.test(s)};rows.push(o);console.log(JSON.stringify(o));fs.writeFileSync("runs6/f20.json",JSON.stringify(rows));await c.dump({});await c.page.close();
 if(o.path==="model")need[q]--;else{fb++;await new Promise(r=>setTimeout(r,70000))}}}
await env.browser.close();
