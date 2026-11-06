import { useEffect, useState } from 'react';
import { VIEW_LABEL } from '../content';
import { ImageView } from '../components/ImageView';
import { Card, DisclaimerBar, Spinner } from '../components/ui';
import { type FollowUpMetrics, getClient, getSession, putSession, type Session } from '../lib/db';
import { type LoadedSession, loadSession } from '../lib/loader';
import { browShift, W_MM } from '../lib/sim/brow';
import { baselineCreaseIndex, browHeightsMm, kappaFor, render, type RenderResult } from '../lib/sim/simulate';
import { DEFAULT_FINDINGS, effectOf, EXPR_VIEWS, type Img, type View } from '../lib/types';

interface Row {
  view: View;
  consult: Img;
  projection: RenderResult;
  actual: Img;
}

const f2 = (x: number | null | undefined) => (x == null ? '–' : x.toFixed(2));
const f1 = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}`;

export function FollowUpPage({ session: fu }: { session: Session }) {
  const [consult, setConsult] = useState<Session | null>(null);
  const [lc, setLc] = useState<LoadedSession | null>(null);
  const [lf, setLf] = useState<LoadedSession | null>(null);
  const [progress, setProgress] = useState('Loading');
  const [error, setError] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [metrics, setMetrics] = useState<FollowUpMetrics | null>(fu.metrics ?? null);
  const [clientName, setClientName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setClientName((await getClient(fu.clientId))?.name ?? '');
        const c = fu.parentId ? await getSession(fu.parentId) : undefined;
        if (!c) throw new Error('The consultation for this follow-up was not found.');
        setConsult(c);
        setScenarioId(fu.metrics?.scenarioId ?? c.chosenScenarioId ?? c.scenarios?.[0]?.id ?? null);
        setProgress('Analysing consultation photos');
        const a = await loadSession(c.id, setProgress);
        setProgress('Analysing follow-up photos');
        const b = await loadSession(fu.id, setProgress);
        if (a.error) throw new Error(`Consultation: ${a.error}`);
        if (b.error) throw new Error(`Follow-up: ${b.error}`);
        setLc(a);
        setLf(b);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [fu.id]);

  useEffect(() => {
    if (!consult || !lc?.prep || !lf?.prep || !scenarioId) return;
    const s = consult.scenarios?.find((x) => x.id === scenarioId);
    if (!s) return;
    setRows(null);
    const t = setTimeout(() => {
      const cp = lc.prep!, fp = lf.prep!;
      const kappa = kappaFor(cp, (consult.findings ?? DEFAULT_FINDINGS).kappaOverrideMm);
      const e = effectOf(s, 'typical');
      const out: Row[] = [];
      const crease: FollowUpMetrics['crease'] = {};
      out.push({ view: 'rest', consult: lc.photos.rest!.img, projection: render(cp, 'rest', e, kappa), actual: lf.photos.rest!.img });
      for (const v of EXPR_VIEWS) {
        if (!cp.views[v] || !fp.views[v]) continue;
        const proj = render(cp, v, e, kappa);
        out.push({ view: v, consult: lc.photos[v]!.img, projection: proj, actual: lf.photos[v]!.img });
        crease[v] = { baseline: baselineCreaseIndex(cp, v), projected: proj.creaseIndex, actual: baselineCreaseIndex(fp, v) };
      }
      const dh = browShift(e, kappa);
      const hc = browHeightsMm(cp), hf = browHeightsMm(fp);
      const m: FollowUpMetrics = {
        computedAt: new Date().toISOString(),
        scenarioId: s.id,
        scenario: s,
        browPredictedMm: { r: dh.r.map((x) => x * W_MM), l: dh.l.map((x) => x * W_MM) },
        browActualMm: { r: hf.r.map((x, i) => x - hc.r[i]), l: hf.l.map((x, i) => x - hc.l[i]) },
        crease,
      };
      setRows(out);
      setMetrics(m);
      putSession({ ...fu, metrics: m });
    }, 30);
    return () => clearTimeout(t);
  }, [consult, lc, lf, scenarioId]);

  if (error) {
    return (
      <div className="page">
        <p className="status warn">{error}</p>
        <a className="btn" href={`#/session/${fu.id}/capture`}>Follow-up photos</a>
      </div>
    );
  }
  if (!consult || !lc || !lf) return <div className="page center"><Spinner label={progress} /></div>;

  const pts = ['medial', 'mid', 'lateral'];
  return (
    <div className="page wide">
      <nav className="crumbs">
        <a href="#/">Clients</a> / <a href={`#/client/${fu.clientId}`}>{clientName}</a> / Projection vs. actual
      </nav>
      <DisclaimerBar />
      <div className="page-head">
        <div>
          <h2>Projection vs. actual</h2>
          <p className="muted">
            The consultation projection next to the real 2-week result. When projections are consistently off, the
            placeholder coefficients get tuned. That is what turns this demo into a calibrated tool.
          </p>
        </div>
        <label className="field inline">
          <span>Treatment actually given</span>
          <select className="input" value={scenarioId ?? ''} onChange={(e) => setScenarioId(e.target.value)}>
            {(consult.scenarios ?? []).map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
          </select>
        </label>
      </div>

      {!rows ? <Spinner label="Rendering projections" /> : rows.map((r) => (
        <Card key={r.view} title={VIEW_LABEL[r.view]}>
          <div className="trio">
            <ImageView img={r.consult} caption="Consultation photo" />
            <ImageView img={r.projection.img} overlays={{ watermark: true }} caption="Projection" />
            <ImageView img={r.actual} caption="Follow-up (actual)" />
          </div>
        </Card>
      ))}

      {metrics && (
        <div className="grid-2">
          <Card title="Lines (crease index: 1.00 = as relaxed; lower is smoother)">
            <table className="mini wide">
              <thead><tr><th>Expression</th><th>Before</th><th>Projected</th><th>Actual</th></tr></thead>
              <tbody>
                {Object.entries(metrics.crease).map(([v, c]) => (
                  <tr key={v}><td>{VIEW_LABEL[v as View]}</td><td>{f2(c.baseline)}</td><td>{f2(c.projected)}</td><td>{f2(c.actual)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Lighting and pose differences between visits move these numbers too. Compare like with like.</p>
          </Card>
          <Card title="Brow position at rest (mm change vs. consultation)">
            <table className="mini wide">
              <thead><tr><th>Point</th><th>Projected R / L</th><th>Actual R / L</th></tr></thead>
              <tbody>
                {pts.map((p, i) => (
                  <tr key={p}>
                    <td>{p}</td>
                    <td>{metrics.browPredictedMm ? `${f1(metrics.browPredictedMm.r[i])} / ${f1(metrics.browPredictedMm.l[i])}` : '–'}</td>
                    <td>{metrics.browActualMm ? `${f1(metrics.browActualMm.r[i])} / ${f1(metrics.browActualMm.l[i])}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">mm assume a 90 mm outer eye-corner width. Saved with this follow-up and included in dataset exports.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
