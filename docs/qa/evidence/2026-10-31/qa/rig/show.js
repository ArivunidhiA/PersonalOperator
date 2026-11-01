const f=process.argv[2];const d=JSON.parse(require('fs').readFileSync(`runs/${f}.json`));
const K=new Set((process.argv[3]||'QA_ECHO_START,QA_BARGE_SAY,VA,SPEAKING,INTERRUPTED,FLUSH,TC,GENDONE,SENT_END,IN,STRIP').split(','));
let audio=0;for(const e of d.ev){if(e[1]==='PCM')audio+=e[2];if(K.has(e[1]))console.log(e[0],e[1],String(JSON.stringify(e[2])).slice(0,100).replace(/\\n/g,' | '))}console.log('total pcm s',audio.toFixed(1));
