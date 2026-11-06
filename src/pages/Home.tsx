import { useEffect, useRef, useState } from 'react';
import { BRAND, DEMO_NOTE } from '../content';
import { Card, fmtDate, navigate } from '../components/ui';
import { type Client, listClients, putClient, uid, wipeAll } from '../lib/db';
import { downloadBlob, exportDataset, importDataset } from '../lib/dataset';

export function Home() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listClients().then(setClients);
  useEffect(() => { refresh(); }, []);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const c: Client = { id: uid(), name: n, createdAt: new Date().toISOString() };
    await putClient(c);
    setName('');
    navigate(`/client/${c.id}`);
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const blob = await exportDataset();
      downloadBlob(blob, `linelogic-dataset-${new Date().toISOString().slice(0, 10)}.json`);
      setMsg(`Exported ${(blob.size / 1e6).toFixed(1)} MB.`);
    } finally { setBusy(false); }
  };

  const doImport = async (f: File) => {
    setBusy(true);
    try {
      const r = await importDataset(f);
      setMsg(`Imported ${r.clients} clients, ${r.sessions} sessions, ${r.photos} photos.`);
      refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(false); }
  };

  const doWipe = async () => {
    if (!window.confirm('Erase every client, session and photo stored in this browser? This cannot be undone.')) return;
    await wipeAll();
    setMsg('All demo data erased from this device.');
    refresh();
  };

  return (
    <div className="page">
      <section className="hero">
        <h1>{BRAND}</h1>
        <p className="lede">
          Show clients what neuromodulator treatment can really change, and what it can't, using their own photos.
          Treated lines soften toward the client's own relaxed face, never past it.
        </p>
        <p className="note">{DEMO_NOTE}</p>
      </section>

      <div className="grid-2">
        <Card title="Clients">
          <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input
              className="input"
              placeholder="Name or initials (e.g. Volunteer A)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New client name"
            />
            <button className="btn primary" type="submit" disabled={!name.trim()}>Add client</button>
          </form>
          {clients == null ? null : clients.length === 0 ? (
            <p className="muted">No clients yet. Add one to start a consultation.</p>
          ) : (
            <ul className="list">
              {clients.map((c) => (
                <li key={c.id}>
                  <a href={`#/client/${c.id}`} className="list-item">
                    <span className="avatar">{c.name.slice(0, 2).toUpperCase()}</span>
                    <span>
                      <strong>{c.name}</strong>
                      <small>Added {fmtDate(c.createdAt)}</small>
                    </span>
                    <span className="chev">›</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Dataset on this device">
          <p className="muted">
            Export everything (clients, consultations, follow-ups, photos and projection-vs-actual numbers) as one file,
            or import a file from another device. This is the raw material for calibrating the model.
          </p>
          <div className="row wrap">
            <button className="btn" onClick={doExport} disabled={busy}>Export dataset</button>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>Import dataset</button>
            <button className="btn danger ghost" onClick={doWipe} disabled={busy}>Erase all data</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }}
            />
          </div>
          {msg && <p className="status">{msg}</p>}
        </Card>
      </div>

      <Card title="How a demo consultation works" className="steps-card">
        <ol className="steps">
          <li><strong>Consent.</strong> Photos and face mapping, processed on this device.</li>
          <li><strong>Five photos.</strong> Relaxed, eyes closed, frown, brows raised, smile.</li>
          <li><strong>Compare plans.</strong> Glabella only vs. + forehead vs. + crow's feet, in each expression.</li>
          <li><strong>Follow up at 2 weeks.</strong> Same five photos, shown next to the projection.</li>
        </ol>
      </Card>
    </div>
  );
}
