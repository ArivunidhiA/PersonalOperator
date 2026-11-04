import subprocess, wave, sys, json, os
os.makedirs('wav',exist_ok=True)
def say(text, voice, name, rate=None):
    a=f'wav/{name}.aiff'; w=f'wav/{name}.wav'
    if os.path.exists(w): return
    cmd=['say','-v',voice,'-o',a]+(['-r',str(rate)] if rate else [])+[text]
    subprocess.check_call(cmd)
    subprocess.check_call(['afconvert','-f','WAVE','-d','LEI16@48000','-c','1',a,w]); os.remove(a)
def read(p):
    w=wave.open(p); d=w.readframes(w.getnframes()); w.close(); return d
def join(name, parts):
    out=b''
    for p in parts:
        out+= b'\0\0'*int(48000*p) if isinstance(p,(int,float)) else read(f'wav/{p}.wav')
    w=wave.open(f'wav/{name}.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(out); w.close()
lines=json.load(open('lines.json'))
for n,(v,t) in lines.items(): say(t,v,n)
# Ariv's stall turn: same words as the production record, with hesitation gaps
parts=[]
seq=[('h1',"I don't know."),('h2','I feel like, you know.'),('h3','You have to, you know.'),('h4','I feel like I need more information before I schedule a call with him.'),('h5',"Even if I even should schedule a call with him, you know, I feel like he's not that talented."),('hh1','Hello.'),('hh2','Hello.')]
gaps=[1.2,1.5,2.5,1.0,3.0,2.0,0]
for (n,t),g in zip(seq,gaps):
    say(t,'Samantha',n); parts+= [n,g]
join('stall_turn',parts)
join('stall_turn_tight',['h1',.6,'h2',.7,'h3',.8,'h4',.5,'h5',1.0,'hh1',.8,'hh2'])
join('hello_hello',['hh1',1.0,'hh2'])
