// When a word's transcript reaches the client, how far before (+) or after (-) that word plays?
const fs=require('fs');let M=[],turns=0;
for(const f of fs.readdirSync('runs').filter(x=>/^(adv|stall)/.test(x)&&x.endsWith('.json'))){const ev=JSON.parse(fs.readFileSync('runs/'+f)).ev;
 let cur=null;const flush=()=>{if(cur&&cur.pcm>2&&cur.chars>30&&!cur.broken){turns++;let c=0;for(const[t,len]of cur.deltas){c+=len;const wordAt=c/cur.chars*cur.pcm;const elapsed=t-cur.first;M.push({m:wordAt-elapsed,f,t,frac:c/cur.chars})}}cur=null};
 for(const e of ev){const[t,k,v]=e;if(k==='PCM'){cur??={first:t,pcm:0,chars:0,deltas:[]};cur.pcm+=v}
  if(k==='OUT'&&cur){cur.chars+=v.length;cur.deltas.push([t,v.length])}
  if(k==='OUT'&&!cur){cur={first:t,pcm:0,chars:v.length,deltas:[[t,v.length]]}}
  if(k==='INTERRUPTED'&&cur)cur.broken=true; if(k==='TC')flush();}}
const s=M.map(x=>x.m).sort((a,b)=>a-b);const p=q=>s[Math.floor(q*s.length)].toFixed(2);console.log('turns',turns,'deltas',s.length,'margin s: min',s[0].toFixed(2),'p1',p(.01),'p10',p(.1),'p50',p(.5));console.log('share of deltas already audible (margin<0):',(s.filter(x=>x<0).length/s.length).toFixed(3));
const worst=[...M].sort((a,b)=>a.m-b.m).slice(0,4);console.log(worst.map(x=>`${x.f} @${x.t} m=${x.m.toFixed(2)} frac=${x.frac.toFixed(2)}`).join('\n'));
