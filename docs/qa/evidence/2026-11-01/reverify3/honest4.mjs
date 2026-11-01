// Honest summaries: nothing here names an outside company, so any "a company" is a false scrub.
import { launch, call } from "./rig.mjs"; import fs from "fs";
const env=await launch(); const qs=[["hs_name"],["hs_dock"],["hs_tue"],["hs_inzi"],["hs_gh"],["hs_name","hs_dock","hs_inzi"]]; const rows=[];
for(let r=1;r<=2;r++)for(const q of qs){const c=await call(env,`hs-${r}-${q[0]}-${q.length}`);await c.quiet(1200,12000);for(const w of q){await c.say(w);await c.speaks(12000);await c.quiet(1500,18000)}await c.sleep(21000-0);const fin=await c.end();await c.sleep(500);let row=null;try{row=JSON.parse(fs.readFileSync("stubdb.json")).call_summaries.find(x=>x.session_id===c.session().sessionId)}catch{}
 const o={q:q.join("+"),summary:row?.summary,topics:row?.topics,caller:row?.caller_name,company:row?.company,scrubbed:/a company/i.test((row?.summary||"")+(row?.topics||[]).join(" "))};rows.push(o);console.log(JSON.stringify(o));await c.dump({});await c.page.close()}
fs.writeFileSync("runs4/honest.json",JSON.stringify(rows));await env.browser.close();
