import json, glob, numpy as np, csv, collections, os, mne
from scipy import stats
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
OUT = '/home/claude/neuroscienceofmeditation/lab/eeg'; os.makedirs(OUT, exist_ok=True)
groups = {r['participant_id']: r['group'] for r in csv.DictReader(open('participants.tsv'), delimiter='\t')}
import eeg_openneuro_beh as beh
per = collections.defaultdict(list)
for f in sorted(glob.glob('proc/*.json')):
    d = json.load(open(f)); sub, ses = d['file'].replace('.bdf', '').split('_')[:2]; per[sub].append((ses, d))
mont = mne.channels.make_standard_montage('biosemi64'); CH = mont.ch_names
ROI = {'front': ['Fz', 'F1', 'F2', 'AFz', 'FCz', 'F3', 'F4'], 'centre': ['C3', 'C4', 'C5', 'C6', 'CP3', 'CP4', 'CP5', 'CP6'], 'back': ['O1', 'Oz', 'O2', 'PO3', 'POz', 'PO4']}
idx = {k: [CH.index(c) for c in v] for k, v in ROI.items()}
ALLB = beh.all_sessions()
subs = []; freqs = None; alignlog = []
for s in sorted(groups):
    trials = [q for ses in ALLB.get(s, []) for q in ses if q['q'][0] is not None and q['q'][1] is not None]
    n = collections.Counter('med' if q['q'][0] > q['q'][1] else 'mw' if q['q'][1] > q['q'][0] else 'eq' for q in trials)
    rec = dict(id=s, group=groups[s], probes=len(trials), n_med=n['med'], n_mw=n['mw'], n_eq=n['eq'],
               mw_depth=round(float(np.mean([q['q'][1] for q in trials])), 3) if trials else None)
    eps = {'med': [], 'mw': []}; ex = {}
    for ses, d in per.get(s, []):
        if d['freqs'] is None: continue
        freqs = np.array(d['freqs'])
        et = [p['t'] for p in d['probes']]
        # match this EEG session to whichever behavioural log of this person lines up best
        n_ = int(s.split('-')[1]); best = None
        for bf in sorted(glob.glob(beh.D + f'/sub{n_:02d}_*info*.txt')):
            qs_ = [q for q in beh.parse(bf) if q['q'][0] is not None and q['q'][1] is not None]
            if not qs_: continue
            nm, off_ = beh.align(qs_, et)
            if best is None or nm / len(qs_) > best[0]: best = (nm / len(qs_), nm, off_, qs_, bf.split('/')[-1])
        if best is None or best[0] < 0.8: alignlog.append((s, ses, 'no match', best and best[4], best and round(best[0], 2))); continue
        _, nmatch, off, qs, bfn = best; alignlog.append((s, ses, bfn, len(qs), len(et), nmatch, round(off, 2)))
        for q in qs:
            j = int(np.argmin([abs(t - (q['t'] + off)) for t in et]))
            if abs(et[j] - (q['t'] + off)) > 0.6: continue
            p = d['probes'][j]
            if not p['ok']: continue
            c = 'med' if q['q'][0] > q['q'][1] else 'mw' if q['q'][1] > q['q'][0] else None
            if not c: continue
            eps[c].append(10 ** np.array(p['psd']))
            if c not in ex: ex[c] = p['ex']
    rec['ep_med'], rec['ep_mw'] = len(eps['med']), len(eps['mw'])
    rec['_med'] = np.mean(eps['med'], 0) if eps['med'] else None
    rec['_mw'] = np.mean(eps['mw'], 0) if eps['mw'] else None
    rec['_ex'] = ex if len(ex) == 2 else None
    subs.append(rec)
for a_ in alignlog: print('align', a_)
F = freqs
band = lambda P, lo, hi: np.log10(P[:, (F >= lo) & (F <= hi)].mean(1))
MINEP = 3
summary = dict(freqs=[round(x, 2) for x in F[F <= 30]], groups={}, subjects=[])
for s in subs:
    ok = s['_med'] is not None and s['_mw'] is not None and s['ep_med'] >= MINEP and s['ep_mw'] >= MINEP
    s['ok'] = ok
    out = {k: v for k, v in s.items() if not k.startswith('_')}
    summary['subjects'].append(out)
    if ok:
        sj = dict(id=s['id'], group=s['group'], ep_med=s['ep_med'], ep_mw=s['ep_mw'], freqs=summary['freqs'],
                  spec={r: {c: [round(float(x), 3) for x in np.log10(s['_' + c][idx[r]].mean(0))[F <= 30]] for c in ('med', 'mw')} for r in ROI},
                  examples=s['_ex'], ex_chans=['Fz', 'C3', 'Cz', 'C4', 'Pz', 'Oz'], ex_fs=128)
        json.dump(sj, open(f"{OUT}/{s['id']}.json", 'w'), separators=(',', ':'))
for g in ('expert', 'novice'):
    G = [s for s in subs if s['group'] == g and s['ok']]
    res = dict(n=len(G))
    for name, lo, hi in (('theta', 4, 7), ('alpha', 9, 11)):
        D = np.array([band(s['_med'], lo, hi) - band(s['_mw'], lo, hi) for s in G])  # subjects x channels
        t, p = stats.ttest_1samp(D, 0, axis=0)
        res[name] = dict(diff=D.mean(0).round(4).tolist(), t=np.round(t, 3).tolist())
        for r in ROI:
            dr = D[:, idx[r]].mean(1); tt, pp = stats.ttest_1samp(dr, 0)
            res[name][r] = dict(mean=round(float(dr.mean()), 4), t=round(float(tt), 3), p=round(float(pp), 4), up=int((dr > 0).sum()), n=len(dr),
                                pct=round(float((10 ** dr.mean() - 1) * 100), 1))
    res['spec'] = {r: {c: [round(float(x), 3) for x in np.mean([np.log10(s['_' + c][idx[r]].mean(0)) for s in G], 0)[F <= 30]] for c in ('med', 'mw')} for r in ROI}
    summary['groups'][g] = res
json.dump(summary, open(f'{OUT}/summary.json', 'w'), separators=(',', ':'))
# scalp maps
info = mne.create_info(CH, 256, 'eeg'); info.set_montage(mont)
vmax = max(np.abs(summary['groups'][g][b]['diff']).max() for g in ('expert', 'novice') for b in ('theta', 'alpha'))
for g in ('expert', 'novice'):
    for b in ('theta', 'alpha'):
        fig, ax = plt.subplots(figsize=(3, 3), dpi=160)
        mne.viz.plot_topomap(np.array(summary['groups'][g][b]['diff']), info, axes=ax, show=False, cmap='RdBu_r', vlim=(-vmax, vmax), contours=0, sensors=True,
                             outlines='head', image_interp='cubic')
        for l in ax.lines: l.set_color('#8a8a7a')
        fig.savefig(f'{OUT}/map-{g}-{b}.png', transparent=True, bbox_inches='tight', pad_inches=0.02); plt.close(fig)
summary['vmax'] = float(vmax)
json.dump(summary, open(f'{OUT}/summary.json', 'w'), separators=(',', ':'))
for g in ('expert', 'novice'):
    r = summary['groups'][g]; print(g, 'n', r['n'])
    for b in ('theta', 'alpha'):
        print('  ', b, {k: r[b][k] for k in ROI})
print('vmax (log10)', vmax)
