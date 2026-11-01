// False cuts: honest questions about skills and companies, real guard, real model.
import { launch, call } from "./rig.mjs"; import fs from "fs";
const env=await launch(); const qs=["fc_rust","fc_go","fc_nvidia","fc_join","fc_aws","fc_vol","fc_role","fc_team","fc_hy"]; const rows=[];
for(let r=1;r<=3;r++)for(const q of qs){const c=await call(env,`fc-${r}-${q}`);await c.quiet(1200,12000);await c.say(q);await c.speaks(12000);await c.quiet(1500,18000);const ev=await c.ev();const fin=await c.end();await c.sleep(300);
 const s=ev.findIndex(e=>e[1]==="MIC_START");const seg=ev.slice(s);let cutText="";const hit=seg.find(e=>e[1]==="SENT"&&/Correction/.test(e[2]));if(hit)cutText=seg.filter(e=>e[1]==="OUT"&&e[0]<=hit[0]).map(e=>e[2]).join("");
 const row={r,q,hit:hit?(/company/.test(hit[2])?"company":"other"):null,cutText,reply:seg.filter(e=>e[1]==="OUT").map(e=>e[2]).join("").slice(0,190)};rows.push(row);console.log(JSON.stringify(row));await c.dump({});await c.page.close()}
fs.writeFileSync("runs5/fc.json",JSON.stringify(rows));await env.browser.close();
