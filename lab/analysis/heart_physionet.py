import numpy as np, json, os, glob
from scipy import signal
R='raw'; OUT='out'
def load(p):
    a=np.loadtxt(p); t,h=a[:,0],a[:,1]
    good=(h>30)&(h<200)
    med=np.array([np.median(h[max(0,i-7):i+8]) for i in range(len(h))])
    good&=np.abs(h-med)/med<0.45
    return t[good]-t[good][0], h[good], 1-good.mean(), np.diff(t).max()
def analyse(p):
    t,h,drop,maxgap=load(p)
    fs=2.0; tt=np.arange(0,t[-1],1/fs); hh=np.interp(tt,t,h)
    sos=signal.butter(4,[0.025,0.35],btype='band',fs=fs,output='sos')
    bp=signal.sosfiltfilt(sos,hh-hh.mean())
    env=np.abs(signal.hilbert(bp))
    # ignore 30 s at each edge (filter transients)
    k=int(30*fs); Am=float(np.median(env[k:-k])) if len(env)>4*k else float(np.median(env))
    f,P=signal.welch(hh-hh.mean(),fs=fs,nperseg=min(512,len(hh)),detrend='linear')
    band=(f>=0.025)&(f<=0.35); pb=(f>=0.04)&(f<=0.35)
    power=float(np.trapezoid(P[band],f[band])); peak=float(f[pb][np.argmax(P[pb])])
    rr=60000/h; rmssd=float(np.sqrt(np.mean(np.diff(rr)**2)))
    return dict(dur=float(t[-1]),hr=float(np.mean(h)),Am=Am,rmssd=rmssd,power=power,peak=peak,drop=float(drop),maxgap=float(maxgap)),tt,hh,f,P,env
summ=[]; os.makedirs(OUT,exist_ok=True)
groups={'chi':'Chi meditation','yoga':'Kundalini Yoga','normal':'Sleeping, normal breathing','metron':'Paced breathing, 15 per minute','ironman':'Elite athletes, asleep'}
for g in groups:
    for p in sorted(glob.glob(f'{R}/{g}/*')):
        name=os.path.basename(p)
        if name=='RECORDS': continue
        s,tt,hh,f,P,env=analyse(p)
        subj=name.split('.')[0]; phase=name.split('.')[1] if '.' in name else 'rec'
        s.update(group=g,subject=subj,phase=phase); summ.append(s)
        if g in('chi','yoga'):
            fn=f'{OUT}/{subj}.json'
            d=json.load(open(fn)) if os.path.exists(fn) else {'subject':subj,'group':g}
            d[phase]={'hr':[round(x,1) for x in hh],'fs':2,'spec_f':[round(x,4) for x in f[f<=0.4]],'spec_p':[round(float(x),3) for x in P[f<=0.4]],
                      'stats':{k:round(v,4) for k,v in s.items() if isinstance(v,float)}}
            json.dump(d,open(fn,'w'),separators=(',',':'))
json.dump(summ,open(f'{OUT}/summary.json','w'),indent=0)
import collections
by=collections.defaultdict(list)
for s in summ: by[(s['group'],s['phase'])].append(s)
for k,v in by.items():
    a=np.array([x['Am'] for x in v]); pw=np.array([x['power'] for x in v])
    print(k,len(v),'Am %.2f±%.2f'%(a.mean(),a.std(ddof=1) if len(a)>1 else 0),'power %.1f'%pw.mean(),'drop max %.3f'%max(x['drop'] for x in v),'gap max %.1f'%max(x['maxgap'] for x in v),'peak',[round(x['peak'],3) for x in v])
