import { useEffect, useState } from 'react';
import { CONSENT_CALIBRATION, CONSENT_PHOTOS } from '../content';
import { Card, fmtDate, navigate } from '../components/ui';
import { type Client, deleteClient, deleteSession, getClient, listSessions, putSession, type Session, uid } from '../lib/db';
import { DEFAULT_FINDINGS, defaultScenarios, POSES } from '../lib/types';

function ConsentForm(props: { kind: 'consult' | 'followup'; onCancel: () => void; onAgree: (calibration: boolean) => void }) {
  const [photos, setPhotos] = useState(false);
  const [cal, setCal] = useState(false);
  return (
    <div className="consent">
      <h4>{props.kind === 'consult' ? 'New consultation' : '2-week follow-up'}: consent</h4>
      <label className="check">
        <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} />
        <span>{CONSENT_PHOTOS}</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={cal} onChange={(e) => setCal(e.target.checked)} />
        <span>{CONSENT_CALIBRATION}</span>
      </label>
      <div className="row">
        <button className="btn primary" disabled={!photos} onClick={() => props.onAgree(cal)}>Agree and take photos</button>
        <button className="btn ghost" onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function ClientPage({ id }: { id: string }) {
  const [client, setClient] = useState<Client | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [consentFor, setConsentFor] = useState<{ kind: 'consult' | 'followup'; parentId?: string } | null>(null);

  const refresh = async () => {
    setClient((await getClient(id)) ?? null);
    setSessions(await listSessions(id));
  };
  useEffect(() => { refresh(); }, [id]);

  if (!client) return <div className="page"><p className="muted">Loading…</p></div>;

  const consults = sessions.filter((s) => s.kind === 'consult');
  const followups = (cid: string) => sessions.filter((s) => s.parentId === cid);

  const start = async (calibration: boolean) => {
    if (!consentFor) return;
    const s: Session = {
      id: uid(),
      clientId: id,
      kind: consentFor.kind,
      parentId: consentFor.parentId,
      createdAt: new Date().toISOString(),
      consent: { photos: true, faceGeometry: true, calibrationUse: calibration, at: new Date().toISOString() },
      poses: [],
      ...(consentFor.kind === 'consult' ? { findings: { ...DEFAULT_FINDINGS }, scenarios: defaultScenarios() } : {}),
    };
    await putSession(s);
    navigate(`/session/${s.id}/capture`);
  };

  const removeSession = async (s: Session) => {
    if (!window.confirm('Delete this session and its photos from this device?')) return;
    await deleteSession(s.id);
    refresh();
  };

  const removeClient = async () => {
    if (!window.confirm(`Delete ${client.name} and all their sessions and photos from this device?`)) return;
    await deleteClient(id);
    navigate('/');
  };

  return (
    <div className="page">
      <nav className="crumbs"><a href="#/">Clients</a> / {client.name}</nav>
      <div className="page-head">
        <h2>{client.name}</h2>
        <div className="row">
          <button className="btn primary" onClick={() => setConsentFor({ kind: 'consult' })}>New consultation</button>
          <button className="btn ghost danger" onClick={removeClient}>Delete client</button>
        </div>
      </div>

      {consentFor && <ConsentForm kind={consentFor.kind} onCancel={() => setConsentFor(null)} onAgree={start} />}

      {consults.length === 0 && !consentFor && <p className="muted">No consultations yet.</p>}

      {consults.slice().reverse().map((c) => {
        const missing = POSES.filter((p) => p !== 'closed' && p !== 'squint' && !c.poses.includes(p));
        const fus = followups(c.id);
        return (
          <Card
            key={c.id}
            title={<>Consultation · {fmtDate(c.createdAt)}</>}
            actions={<button className="btn ghost sm danger" onClick={() => removeSession(c)}>Delete</button>}
          >
            <p className="muted">
              {c.poses.length} of 5 photos{missing.length ? ` · still needed: ${missing.join(', ')}` : ''}
              {c.chosenScenarioId && c.scenarios ? ` · plan for follow-up: ${c.scenarios.find((s) => s.id === c.chosenScenarioId)?.name}` : ''}
            </p>
            <div className="row wrap">
              <a className="btn primary" href={`#/session/${c.id}`}>Open comparison</a>
              <a className="btn" href={`#/session/${c.id}/capture`}>Photos</a>
              <button className="btn" onClick={() => setConsentFor({ kind: 'followup', parentId: c.id })}>Add 2-week follow-up</button>
            </div>
            {fus.length > 0 && (
              <ul className="sublist">
                {fus.map((f) => (
                  <li key={f.id}>
                    <span>Follow-up · {fmtDate(f.createdAt)} · {f.poses.length} photos</span>
                    <span className="row">
                      <a className="btn sm primary" href={`#/session/${f.id}`}>Projection vs. actual</a>
                      <a className="btn sm" href={`#/session/${f.id}/capture`}>Photos</a>
                      <button className="btn sm ghost danger" onClick={() => removeSession(f)}>Delete</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
