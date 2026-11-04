const fs=require('fs');for(const f of fs.readdirSync('runs').filter(x=>/^realb?-\d+\.json$/.test(x)).sort()){const d=JSON.parse(fs.readFileSync('runs/'+f));const b=d.ev.find(e=>e[1]==='QA_BARGE_SAY')?.[0];
const sp=[...d.ev].reverse().find(e=>e[1]==='SPEAKING'&&e[0]<b);const i=d.ev.find(e=>e[1]==='INTERRUPTED'&&e[0]>b);const off=d.ev.find(e=>e[1]==='SPEAKING'&&e[2]===false&&e[0]>b);
const selfInt=d.ev.filter(e=>e[1]==='INTERRUPTED'&&e[0]<b).length;
const heard=d.ev.filter(e=>e[1]==='IN'&&e[0]>b).map(e=>e[2]).join('').slice(0,80);
console.log(f.replace('.json','').padEnd(9),'agentPlaying',sp?.[2],'interrupt+',i?(i[0]-b).toFixed(2):'NONE','agentStop+',off?(off[0]-b).toFixed(2):null,'selfInterrupts',selfInt,'|',heard)}
