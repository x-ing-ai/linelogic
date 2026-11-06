import { useEffect, useMemo, useRef, useState } from 'react';
import { AREAS, SIDE_EFFECT_SOURCE, TIMING, URGENT, VIEW_LABEL, WONT_CHANGE } from '../content';
import { CompareSlider } from '../components/CompareSlider';
import { ImageView } from '../components/ImageView';
import { Card, DisclaimerBar, Segmented, Spinner } from '../components/ui';
import { getClient, putSession, type Session } from '../lib/db';
import { type LoadedSession, loadSession } from '../lib/loader';
import { browShift, type SideTriple, W_MM } from '../lib/sim/brow';
import { kappaFor, render, type RenderResult } from '../lib/sim/simulate';
import {
  DEFAULT_FINDINGS,
  defaultScenarios,
  effectOf,
  type Findings,
  type Img,
  type Level,
  LEVEL_LABEL,
  type Range,
  type Scenario,
  type View,
  VIEWS,
} from '../lib/types';

type Mode = 'slider' | 'side' | 'all';
const LEVELS: { value: Level; label: string }[] = LEVEL_LABEL.map((l, i) => ({ value: i as Level, label: l }));

const avg = (t: SideTriple, i: number) => (t.r[i] + t.l[i]) / 2;
const mm = (x: number) => `${Math.abs(x).toFixed(1)} mm`;

function keyOf(view: View, s: Scenario, range: Range, kappa: SideTriple) {
  return JSON.stringify([view, s.glabella, s.forehead, s.foreheadLateral, s.foreheadUpperOnly, s.crowsFeet, range, kappa]);
}

function ScenarioEditor({ s, onChange }: { s: Scenario; onChange: (s: Scenario) => void }) {
  return (
    <div className="editor">
      <label className="field">
        <span>Plan name</span>
        <input className="input" value={s.name} onChange={(e) => onChange({ ...s, name: e.target.value })} />
      </label>
      <div className="field">
        <span>{AREAS.glabella.name}</span>
        <Segmented size="sm" value={s.glabella} options={LEVELS} onChange={(v) => onChange({ ...s, glabella: v })} label="Glabella response" />
      </div>
      <div className="field">
        <span>{AREAS.forehead.name}</span>
        <Segmented size="sm" value={s.forehead} options={LEVELS} onChange={(v) => onChange({ ...s, forehead: v })} label="Forehead response" />
        {s.forehead > 0 && (
          <div className="subfields">
            <label className="check small">
              <input type="checkbox" checked={s.foreheadLateral} onChange={(e) => onChange({ ...s, foreheadLateral: e.target.checked })} />
              <span>Include lateral forehead {s.foreheadLateral ? '' : '(brow tails may arch up: "Spock brow")'}</span>
            </label>
            <label className="check small">
              <input type="checkbox" checked={s.foreheadUpperOnly} onChange={(e) => onChange({ ...s, foreheadUpperOnly: e.target.checked })} />
              <span>Upper forehead only (protects brow position; lower lines may remain)</span>
            </label>
          </div>
        )}
      </div>
      <div className="field">
        <span>{AREAS.crowsFeet.name}</span>
        <Segmented size="sm" value={s.crowsFeet} options={LEVELS} onChange={(v) => onChange({ ...s, crowsFeet: v })} label="Crow's feet response" />
      </div>
      <p className="muted small">Response levels, not doses. The provider decides product, units and placement.</p>
    </div>
  );
}

function PlanPanels(props: { s: Scenario; range: Range; kappa: SideTriple; findings: Findings; hasClosed: boolean }) {
  const { s, findings } = props;
  const dh = browShift(effectOf(s, props.range), props.kappa);
  const med = avg(dh, 0) * W_MM, mid = avg(dh, 1) * W_MM, lat = avg(dh, 2) * W_MM;
  const changes: string[] = [];
  if (s.glabella) changes.push(`${AREAS.glabella.name} (${LEVEL_LABEL[s.glabella].toLowerCase()}): ${AREAS.glabella.change}`);
  if (s.forehead) changes.push(`${AREAS.forehead.name} (${LEVEL_LABEL[s.forehead].toLowerCase()}): ${AREAS.forehead.change}`);
  if (s.crowsFeet) changes.push(`${AREAS.crowsFeet.name} (${LEVEL_LABEL[s.crowsFeet].toLowerCase()}): ${AREAS.crowsFeet.change}`);
  const brow: string[] = [];
  if (s.forehead) {
    brow.push(`Brows sit about ${mm(mid)} lower at rest in the middle (illustrative). The more the forehead is holding the brows up today, the larger the drop.`);
    if (!s.foreheadLateral) brow.push(`Brow tails may arch up (about ${lat > 0 ? mm(lat) : '0 mm'} at the tail) because the lateral forehead is untreated.`);
    if (findings.lidHooding !== 'none') brow.push('Hooded upper lids may look heavier.');
    if (!props.hasClosed && findings.kappaOverrideMm == null) brow.push('No eyes-closed photo, so the brow drop may be understated.');
  } else if (s.glabella) {
    brow.push(`Inner brows may lift slightly (about ${mm(med)}).`);
  }
  const effects = [
    s.glabella ? `${AREAS.glabella.name}: ${AREAS.glabella.effects}` : null,
    s.forehead ? `${AREAS.forehead.name}: ${AREAS.forehead.effects}` : null,
    s.crowsFeet ? `${AREAS.crowsFeet.name}: ${AREAS.crowsFeet.effects}` : null,
  ].filter(Boolean) as string[];
  const wont = [...WONT_CHANGE];
  if (findings.staticLines === 'moderate' || findings.staticLines === 'deep') {
    wont[0] = `This client has ${findings.staticLines} etched lines at rest. They stay visible after this treatment.`;
  }
  return (
    <div className="panels">
      <Card title="What changes">
        {changes.length ? <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="muted">No treatment in this plan.</p>}
        {brow.length > 0 && (<><h5>Brow position</h5><ul>{brow.map((b) => <li key={b}>{b}</li>)}</ul></>)}
      </Card>
      <Card title="What this won't change">
        <ul>{wont.map((w) => <li key={w}>{w}</li>)}</ul>
      </Card>
      <Card title="Possible side effects">
        {effects.length ? <ul>{effects.map((e) => <li key={e}>{e}</li>)}</ul> : <p className="muted">None: no treatment.</p>}
        <p className="muted small">{SIDE_EFFECT_SOURCE}</p>
        <p className="small urgent">{URGENT}</p>
      </Card>
      <Card title="Timing">
        <p>{TIMING}</p>
      </Card>
    </div>
  );
}

export function ConsultPage({ session: initial }: { session: Session }) {
  const [loaded, setLoaded] = useState<LoadedSession | null>(null);
  const [progress, setProgress] = useState('Loading photos');
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>(initial.scenarios ?? defaultScenarios());
  const [findings, setFindings] = useState<Findings>(initial.findings ?? { ...DEFAULT_FINDINGS });
  const [chosen, setChosen] = useState<string | undefined>(initial.chosenScenarioId);
  const [selected, setSelected] = useState<string>(scenarios[0].id);
  const [view, setView] = useState<View>('frown');
  const [mode, setMode] = useState<Mode>('slider');
  const [range, setRange] = useState<Range>('typical');
  const [showChange, setShowChange] = useState(false);
  const [showLm, setShowLm] = useState(false);
  const [results, setResults] = useState<Record<string, RenderResult>>({});
  const [busy, setBusy] = useState(false);
  const cacheRef = useRef(new Map<string, RenderResult>());

  useEffect(() => {
    getClient(initial.clientId).then((c) => setClientName(c?.name ?? ''));
    loadSession(initial.id, setProgress)
      .then((l) => {
        setLoaded(l);
        if (l.error) setError(l.error);
        if (l.prep && !l.prep.views.frown) setView(l.prep.views.raise ? 'raise' : 'rest');
      })
      .catch((e) => setError((e as Error).message));
  }, [initial.id, initial.clientId]);

  // Persist plan edits.
  useEffect(() => {
    const t = setTimeout(() => {
      putSession({ ...initial, ...(loaded?.session ?? {}), scenarios, findings, chosenScenarioId: chosen });
    }, 400);
    return () => clearTimeout(t);
  }, [scenarios, findings, chosen]);

  const prep = loaded?.prep ?? null;
  const kappa = useMemo(() => (prep ? kappaFor(prep, findings.kappaOverrideMm) : { r: [0, 0, 0], l: [0, 0, 0] }) as SideTriple, [prep, findings.kappaOverrideMm]);
  const sel = scenarios.find((s) => s.id === selected) ?? scenarios[0];
  const wanted = mode === 'all' ? scenarios : [sel];
  const avail = (v: View) => v === 'rest' || !!prep?.views[v];

  useEffect(() => {
    if (!prep || !avail(view)) return;
    let cancelled = false;
    const todo = wanted.map((s) => ({ s, key: keyOf(view, s, range, kappa) }));
    const ready: Record<string, RenderResult> = {};
    const missing = todo.filter((t) => {
      const hit = cacheRef.current.get(t.key);
      if (hit) ready[t.key] = hit;
      return !hit;
    });
    setResults(ready);
    if (!missing.length) return;
    setBusy(true);
    (async () => {
      for (const t of missing) {
        await new Promise((r) => setTimeout(r, 16));
        if (cancelled) return;
        const r = render(prep, view, effectOf(t.s, range), kappa);
        cacheRef.current.set(t.key, r);
        if (cacheRef.current.size > 40) cacheRef.current.delete(cacheRef.current.keys().next().value!);
        ready[t.key] = r;
        setResults({ ...ready });
      }
      setBusy(false);
    })();
    return () => { cancelled = true; setBusy(false); };
  }, [prep, view, range, kappa, mode, JSON.stringify(wanted)]);

  if (error && !prep) {
    return (
      <div className="page">
        <p className="status warn">{error}</p>
        <a className="btn" href={`#/session/${initial.id}/capture`}>Back to photos</a>
      </div>
    );
  }
  if (!loaded || !prep) return <div className="page center"><Spinner label={progress} /></div>;

  const before: Img = view === 'rest' ? loaded.photos.rest!.img : loaded.photos[view]!.img;
  const beforeLm = view === 'rest' ? loaded.photos.rest!.lm : loaded.photos[view]!.lm;
  const resOf = (s: Scenario) => results[keyOf(view, s, range, kappa)];
  const selRes = resOf(sel);
  const overlays = (r?: RenderResult) => ({ watermark: true, change: showChange && r ? { roi: r.roi, values: r.change } : null });
  const updateSel = (s: Scenario) => setScenarios((all) => all.map((x) => (x.id === s.id ? s : x)));
  const kMm = prep.kappaMeasured ? { r: prep.kappaMeasured.r.map((x) => x * W_MM), l: prep.kappaMeasured.l.map((x) => x * W_MM) } : null;

  return (
    <div className="page wide">
      <nav className="crumbs">
        <a href="#/">Clients</a> / <a href={`#/client/${initial.clientId}`}>{clientName}</a> / Consultation
      </nav>
      <DisclaimerBar extra={<span className="tag warn">Uncalibrated demo model</span>} />

      <div className="toolbar">
        <Segmented
          label="Expression"
          value={view}
          onChange={setView}
          options={VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v], disabled: !avail(v) }))}
        />
        <Segmented
          label="Compare mode"
          value={mode}
          onChange={setMode}
          options={[{ value: 'slider', label: 'Slider' }, { value: 'side', label: 'Side by side' }, { value: 'all', label: 'All plans' }]}
        />
        <Segmented
          label="Response range"
          value={range}
          onChange={setRange}
          options={[{ value: 'lower', label: 'Lower response' }, { value: 'typical', label: 'Typical' }, { value: 'upper', label: 'Upper response' }]}
        />
        <label className="check small">
          <input type="checkbox" checked={showChange} onChange={(e) => setShowChange(e.target.checked)} />
          <span>Show what changed</span>
        </label>
      </div>

      <div className="consult">
        <div className="stage">
          {busy && <div className="stage-busy"><Spinner label="Rendering" /></div>}
          {mode === 'slider' && (selRes ? (
            <CompareSlider before={before} after={selRes.img} afterOverlays={overlays(selRes)} labels={['Photo', sel.name]} />
          ) : <ImageView img={before} caption="Photo" />)}
          {mode === 'side' && (
            <div className="duo">
              <ImageView img={before} caption="Photo" overlays={{ landmarks: showLm ? beforeLm : null }} />
              <ImageView img={selRes?.img ?? null} overlays={overlays(selRes)} caption={`Simulation · ${sel.name}`} />
            </div>
          )}
          {mode === 'all' && (
            <div className="quad">
              <ImageView img={before} caption="Photo" />
              {scenarios.map((s) => (
                <ImageView key={s.id} img={resOf(s)?.img ?? null} overlays={overlays(resOf(s))} caption={s.name} />
              ))}
            </div>
          )}
          <p className="muted small stage-note">
            {view === 'rest'
              ? 'At rest, neuromodulators change brow position more than lines. Etched lines stay.'
              : `Treated areas soften toward this client's own relaxed photo, never past it. Untreated areas are unchanged.`}
          </p>
        </div>

        <aside className="side">
          <Card title="Plans">
            <Segmented value={selected} onChange={setSelected} options={scenarios.map((s) => ({ value: s.id, label: s.id }))} label="Plan" />
            <ScenarioEditor s={sel} onChange={updateSel} />
            <div className="row wrap">
              <button className={`btn sm ${chosen === sel.id ? 'primary' : ''}`} onClick={() => setChosen(sel.id)}>
                {chosen === sel.id ? '✓ Plan chosen for follow-up' : 'Choose this plan'}
              </button>
              <button className="btn sm ghost" onClick={() => updateSel(defaultScenarios().find((d) => d.id === sel.id) ?? sel)}>Reset</button>
            </div>
          </Card>

          <details className="card provider">
            <summary>Provider details</summary>
            <div className="field">
              <span>Forehead compensation (brow lift with eyes open vs. closed)</span>
              {kMm ? (
                <p className="small">
                  Right: {kMm.r.map((x) => x.toFixed(1)).join(' / ')} mm · Left: {kMm.l.map((x) => x.toFixed(1)).join(' / ')} mm
                  <br /><span className="muted">medial / mid / lateral, assuming 90 mm eye-corner width</span>
                </p>
              ) : <p className="small muted">No eyes-closed photo. Enter your exam value below.</p>}
              <label className="row small">
                Override (mm)
                <input
                  className="input num"
                  type="number"
                  step="0.5"
                  min="0"
                  max="8"
                  value={findings.kappaOverrideMm ?? ''}
                  onChange={(e) => setFindings({ ...findings, kappaOverrideMm: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="field">
              <span>Lid hooding</span>
              <Segmented size="sm" value={findings.lidHooding} onChange={(v) => setFindings({ ...findings, lidHooding: v })}
                options={[{ value: 'none', label: 'None' }, { value: 'mild', label: 'Mild' }, { value: 'marked', label: 'Marked' }]} />
            </div>
            <div className="field">
              <span>Etched lines at rest</span>
              <Segmented size="sm" value={findings.staticLines} onChange={(v) => setFindings({ ...findings, staticLines: v })}
                options={[{ value: 'none', label: 'None' }, { value: 'mild', label: 'Mild' }, { value: 'moderate', label: 'Moderate' }, { value: 'deep', label: 'Deep' }]} />
            </div>
            <label className="check small">
              <input type="checkbox" checked={findings.lowBrows} onChange={(e) => setFindings({ ...findings, lowBrows: e.target.checked })} />
              <span>Low brows already</span>
            </label>
            <label className="check small">
              <input type="checkbox" checked={showLm} onChange={(e) => setShowLm(e.target.checked)} />
              <span>Show landmarks (side-by-side view)</span>
            </label>
            <h5>Predicted rest brow change (mm, medial / mid / lateral)</h5>
            <table className="mini">
              <tbody>
                {scenarios.map((s) => {
                  const d = browShift(effectOf(s, range), kappa);
                  return (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td>{[0, 1, 2].map((i) => (avg(d, i) * W_MM).toFixed(1)).join(' / ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selRes && (
              <p className="small muted">
                Checks: {selRes.checks.identity ? 'no change (identity)' : selRes.checks.restCeilingOk ? 'rest ceiling ✓' : '⚠ rest ceiling: alignment issue, retake photos'}
                {selRes.creaseIndex != null && ` · crease index ${selRes.creaseIndex.toFixed(2)} (1.00 = relaxed)`}
              </p>
            )}
            <label className="field">
              <span>Notes</span>
              <textarea className="input" rows={3} value={findings.notes} onChange={(e) => setFindings({ ...findings, notes: e.target.value })} />
            </label>
          </details>
        </aside>
      </div>

      <PlanPanels s={sel} range={range} kappa={kappa} findings={findings} hasClosed={!!prep.kappaMeasured} />
    </div>
  );
}
