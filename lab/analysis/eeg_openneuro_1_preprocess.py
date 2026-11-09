"""Simplified re-analysis of ds001787 (Brandmeyer & Delorme 2018), one recording.
Steps: 64 EEG channels -> 1-40 Hz -> bad channels interpolated -> average reference ->
ICA, remove eye components (correlated with Fp1/Fp2) -> 10 s epochs before each probe ->
classify by self-report (Q1 meditation depth vs Q2 mind-wandering depth) -> drop epochs
>200 uV peak-to-peak -> Welch spectra."""
import sys, json, numpy as np, mne, csv, io, urllib.request
mne.set_log_level('ERROR')
bdf, ev_tsv, out = sys.argv[1], sys.argv[2], sys.argv[3]
raw = mne.io.read_raw_bdf(bdf, preload=True)
eeg = raw.ch_names[:64]
raw.pick(eeg)
mont = mne.channels.make_standard_montage('biosemi64')
raw.rename_channels(dict(zip(eeg, mont.ch_names))); raw.set_montage(mont)
raw.filter(1., 40., fir_design='firwin')
# bad channels: robust z-score of log variance
v = np.log(np.var(raw.get_data(), axis=1)); z = (v - np.median(v)) / (1.4826 * np.median(np.abs(v - np.median(v))) + 1e-12)
raw.info['bads'] = [raw.ch_names[i] for i in np.where(np.abs(z) > 4)[0]]
nbad = len(raw.info['bads'])
if nbad: raw.interpolate_bads(reset_bads=True)
raw.set_eeg_reference('average')
ica = mne.preprocessing.ICA(n_components=20, random_state=7, max_iter=400)
ica.fit(raw, decim=4)
eog = set()
for ch in ('Fp1', 'Fp2'):
    idx, _ = ica.find_bads_eog(raw, ch_name=ch, threshold=3.0); eog.update(idx)
ica.exclude = sorted(eog)[:4]
ica.apply(raw)
# every probe onset (value 128); ratings are matched later from the behavioural logs,
# because the EEG event codes miss key "0" presses.
rows = list(csv.DictReader(open(ev_tsv), delimiter='\t'))
onsets = [float(r['onset']) for r in rows if r['value'] not in ('n/a', '') and int(float(r['value'])) == 128]
sf = raw.info['sfreq']; data = raw.get_data() * 1e6
EXC = [mont.ch_names.index(c) for c in ('Fz', 'C3', 'Cz', 'C4', 'Pz', 'Oz')]
probes = []; freqs = None
for t in onsets:
    a, b = int(round((t - 10.05) * sf)), int(round((t - 0.05) * sf))
    if a < 0 or b > data.shape[1]: probes.append(dict(t=t, ok=False, why='edge')); continue
    seg = data[:, a:b]; ptp = float(np.ptp(seg, axis=1).max())
    P, f = mne.time_frequency.psd_array_welch(seg, sf, fmin=1, fmax=40, n_fft=512, n_overlap=256)
    freqs = f
    probes.append(dict(t=t, ok=ptp <= 200, ptp=round(ptp, 1), psd=np.round(np.log10(P), 4).tolist(), ex=seg[EXC, ::2].round(1).tolist()))
res = dict(file=bdf.split('/')[-1], bads=nbad, ica_removed=len(ica.exclude), freqs=None if freqs is None else freqs.tolist(), chans=mont.ch_names, probes=probes)
json.dump(res, open(out, 'w'))
print(res['file'], 'bads', nbad, 'ica', ica.exclude, 'probes', len(probes), 'clean', sum(p['ok'] for p in probes))
