const fs=require('fs');let runs=0,moved=[],capd=[],gem=[];
for(const f of fs.readdirSync('runs').filter(x=>x.endsWith('.json')&&!x.startsWith('_')&&!x.startsWith('realb'))){const d=JSON.parse(fs.readFileSync('runs/'+f));runs++;
 const endT=(d.ev.findLast?.(e=>e[1]==='WS_CLOSE')||[0])[0]*1000;
 const pos=new Set(d.orb.filter(o=>o[0]<endT-300).map(o=>o[1].split(',').slice(0,4).join(',')).filter(s=>s&&!s.startsWith(',')));if(pos.size>1)moved.push(f+':'+[...pos].join(' '));
 const ev=d.ev;for(let i=0;i<ev.length;i++){if(ev[i][1]!=='MIC_START')continue;const t=ev[i][0];const before=ev.slice(0,i).reverse().find(e=>e[1]==='STRIP')?.[2]?.split('\n')[0]||'';
  const fs1=ev.slice(i).find(e=>e[1]==='STRIP'&&e[2].split('\n')[0]!==before&&!/^[A-Z].*[.?!]$/.test(e[2].split('\n')[0]));const g=ev.slice(i).find(e=>e[1]==='IN');const next=ev.slice(i+1).find(e=>e[1]==='MIC_START')?.[0]??1e9;
  if(fs1&&fs1[0]<next)capd.push(fs1[0]-t);if(g&&g[0]<next)gem.push(g[0]-t);}
}
const p=(a,q)=>{a=[...a].sort((x,y)=>x-y);return a[Math.floor(q*a.length)]?.toFixed(2)};
console.log('runs',runs,'orbMoved',moved.length,moved.slice(0,3));console.log('caption first change after mic start: n',capd.length,'p50',p(capd,.5),'p90',p(capd,.9));console.log('gemini first text: n',gem.length,'p50',p(gem,.5),'p90',p(gem,.9));
// missing transcript turns
let m=0,tot=0,list=[];for(const f of fs.readdirSync('runs').filter(x=>/^(adv|stall|rc)/.test(x)&&x.endsWith('.json'))){const ev=JSON.parse(fs.readFileSync('runs/'+f)).ev;const s=ev.map((e,i)=>e[1]==='MIC_START'?i:-1).filter(i=>i>=0);s.forEach((i,k)=>{tot++;const seg=ev.slice(i,s[k+1]??ev.length);if(!seg.some(e=>e[1]==='IN')){m++;list.push(f+':'+ev[i][2])}})}console.log('turns',tot,'no gemini input text',m,list.join(' '));
