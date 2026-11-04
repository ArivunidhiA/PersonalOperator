// speech end -> first agent audio, across every rig run
const fs=require('fs');const L=[];
for(const f of fs.readdirSync('runs').filter(x=>x.endsWith('.json')&&!/^(rule|real|guard)/.test(x))){const d=JSON.parse(fs.readFileSync('runs/'+f));
 let end=null,w=null;for(const e of d.ev){if(e[1]==='MIC_END'){end=e[0];w=e[2]} if(e[1]==='MIC_START')end=null;
 if(e[1]==='PCM'&&end!==null){L.push({f,w,ms:Math.round((e[0]-end)*1000),nudge:d.ev.some(x=>x[1]==='SENT'&&/waiting/.test(String(x[2]))&&x[0]>end&&x[0]<e[0])});end=null}}}
const s=L.map(x=>x.ms).sort((a,b)=>a-b);const p=q=>s[Math.floor(q*s.length)];console.log('n',s.length,'p50',p(.5),'p90',p(.9),'max',s.at(-1),'over3s',s.filter(x=>x>3000).length,'over6s',s.filter(x=>x>6000).length);
console.log(L.filter(x=>x.ms>3000).map(x=>`${x.f} ${x.w} ${x.ms} nudge=${x.nudge}`).join('\n'));
