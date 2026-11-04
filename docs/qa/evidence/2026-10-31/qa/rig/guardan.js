// For each cut: audio that actually played before the flush.
const fs=require('fs');
for(const f of fs.readdirSync('runs').filter(x=>/^(guard|rule)-.*json$/.test(x))){const d=JSON.parse(fs.readFileSync('runs/'+f));
 let turnSpeak=null,queued=0,text='',firstPcm=null,genAudio=0;
 for(const e of d.ev){const[t,k,v]=e;
  if(k==='SENT'&&/Correction/.test(v)){}
  if(k==='SPEAKING'&&v===true)turnSpeak=t;
  if(k==='PCM'){if(firstPcm===null)firstPcm=t;queued+=v}
  if(k==='OUT')text+=v;
  if(k==='SENT'&&/Correction/.test(String(v))){const fl=d.ev.filter(x=>x[1]==='FLUSH'&&Math.abs(x[0]-t)<0.3)[0];console.log(f.padEnd(26),'hit@',t,'speakingFor(ms)',turnSpeak?Math.round((t-turnSpeak)*1000):null,'audioQueued(s)',queued.toFixed(2),'charsSoFar',text.length,'flushed',!!fl,'tail:',text.slice(-40).replace(/\n/g,' '))}
  if(k==='TC'||k==='INTERRUPTED'){queued=0;text='';firstPcm=null}
 }}
