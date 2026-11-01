import fs from "fs"; import { checkLive, createLiveGuard } from "/Users/ariv07/Desktop/PersonalOperator/.claude/worktrees/quizzical-meitner-9fcd2e/web/lib/live-guard.ts";
const p="/Users/ariv07/Desktop/PersonalOperator/.claude/worktrees/quizzical-meitner-9fcd2e/web/evals/.results/";const j=fs.readdirSync(p).filter(x=>x.startsWith("reverify2")).pop();const d=JSON.parse(fs.readFileSync(p+j));let n=0,h={};const lines=[];
for(const t of d.transcripts)for(const x of t.turns.slice(1)){const s=x.spoken.join(" ");if(!s)continue;n++;const g=createLiveGuard();let hit=null;for(let i=0;i<s.length&&!hit;i+=14)hit=g.push(s.slice(i,i+14));hit??=g.flush();if(hit){h[hit.rule]=(h[hit.rule]||0)+1;lines.push(t.case+"#"+t.run+" "+hit.rule+": "+s.slice(0,110))}}
console.log("agent turns",n,JSON.stringify(h));console.log(lines.join("\n"));
const leak=d.transcripts.flatMap(t=>t.turns.slice(1).filter(x=>/\[redacted\]/.test(x.spoken.join(" "))).map(()=>t.case));console.log("term in agent lines",leak.length);
for(const c of ["recruiter-names-company","recruiter-at-customer","call-hyundai","call-list-gaps"])console.log(c,"failed",d.rows.filter(r=>r.case===c&&!r.pass).length,"of",d.rows.filter(r=>r.case===c).length);
console.log("errors",JSON.stringify(d.transcripts.flatMap(x=>x.turns.flatMap(y=>y.errors.map(e=>x.case+"#"+x.run+": "+e)))));
