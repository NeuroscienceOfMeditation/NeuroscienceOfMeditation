import re, glob, os, csv, collections, numpy as np
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'beh/txt/MW_Current_TextFileBIDS')
def parse(f):
    qs = []; cur = None
    for line in open(f, errors='ignore'):
        m = re.match(r'MW question asked at time\s+([\d.]+)', line)
        if m: cur = dict(t=float(m.group(1)), q=[None, None, None]); qs.append(cur); continue
        m = re.match(r'Key (\S+) \(code (\S*)\) pressed at time\s+([\d.]+) seconds, status (\d)', line)
        if m and cur is not None:
            key, st = m.group(1), int(m.group(4))
            if key[:1] in '0123' and st in (1, 2, 3): cur['q'][st - 1] = int(key[0])
            elif key[:1] not in '0123': cur = None
    return qs
def sesfile(sub, ses):
    n = int(sub.split('-')[1]); s = int(ses.split('-')[1])
    cands = [f'sub{n:02d}_info.txt', f'sub{n:02d}__info.txt'] if s == 1 else [f'sub{n:02d}_{s}_info.txt']
    for c in cands:
        if os.path.exists(os.path.join(D, c)): return os.path.join(D, c)
def all_sessions():
    out = collections.defaultdict(list)
    for f in sorted(glob.glob(D + '/sub*_info.txt')):
        b = os.path.basename(f)
        m = re.match(r'sub(\d+)_(\d*)_?info\.txt', b)
        if not m: continue
        out[f'sub-{int(m.group(1)):03d}'].append(parse(f))
    return out
def align(info_q, eeg_t):
    eeg_t = np.array(eeg_t); best = (-1, 0)
    for qi in info_q[:5]:
        for et in eeg_t:
            o = et - qi['t']; n = sum(np.min(np.abs(eeg_t - (q['t'] + o))) < 0.6 for q in info_q)
            if n > best[0]: best = (n, o)
    return best
if __name__ == '__main__':
    groups = {r['participant_id']: r['group'] for r in csv.DictReader(open('participants.tsv'), delimiter='\t')}
    A = all_sessions(); res = collections.defaultdict(list)
    for s, sess in sorted(A.items()):
        qs = [q for ses in sess for q in ses if q['q'][0] is not None and q['q'][1] is not None]
        med = sum(q['q'][0] > q['q'][1] for q in qs); mw = sum(q['q'][1] > q['q'][0] for q in qs)
        res[groups[s]].append((s, len(qs), med, mw, np.mean([q['q'][1] for q in qs])))
    for g, v in res.items():
        print(g, len(v), 'MW share of unequal trials %.1f%%' % (100 * np.mean([mw / (med + mw) for _, _, med, mw, _ in v if med + mw])),
              'mean MW depth %.2f' % np.mean([x[4] for x in v]), 'pooled MW%% %.1f' % (100 * sum(x[3] for x in v) / sum(x[2] + x[3] for x in v)))
