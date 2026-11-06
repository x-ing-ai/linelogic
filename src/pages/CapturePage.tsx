import { useEffect, useRef, useState } from 'react';
import { POSE_INFO } from '../content';
import { CameraCapture } from '../components/CameraCapture';
import { Spinner, navigate } from '../components/ui';
import { deletePhoto, getClient, getPhoto, getSession, putPhoto, putSession, type Session } from '../lib/db';
import { analysePhoto, invalidate } from '../lib/loader';
import { normalizePhoto } from '../lib/photo';
import type { QualityResult } from '../lib/quality';
import { POSES, type Pose } from '../lib/types';

interface Slot {
  url: string | null;
  quality: QualityResult | null;
  busy: boolean;
}

export function CapturePage({ id }: { id: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [clientName, setClientName] = useState('');
  const [slots, setSlots] = useState<Record<Pose, Slot>>(() =>
    Object.fromEntries(POSES.map((p) => [p, { url: null, quality: null, busy: false }])) as Record<Pose, Slot>,
  );
  const [camera, setCamera] = useState<Pose | null>(null);
  const [modelMsg, setModelMsg] = useState<string | null>(null);
  const fileFor = useRef<Pose | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const setSlot = (p: Pose, s: Partial<Slot>) => setSlots((all) => ({ ...all, [p]: { ...all[p], ...s } }));

  useEffect(() => {
    (async () => {
      const s = await getSession(id);
      if (!s) return;
      setSession(s);
      setClientName((await getClient(s.clientId))?.name ?? '');
      for (const p of s.poses) {
        const blob = await getPhoto(id, p);
        if (!blob) continue;
        setSlot(p, { url: URL.createObjectURL(blob), busy: true });
        try {
          const a = await analysePhoto(p, blob);
          setSlot(p, { quality: a.quality, busy: false });
        } catch (e) {
          setModelMsg((e as Error).message);
          setSlot(p, { busy: false });
        }
      }
    })();
  }, [id]);

  const accept = async (pose: Pose, raw: Blob) => {
    if (!sessionRef.current) return;
    setCamera(null);
    setSlot(pose, { busy: true, quality: null });
    try {
      const blob = await normalizePhoto(raw);
      await putPhoto(id, pose, blob);
      const cur = (await getSession(id)) ?? sessionRef.current;
      const next = { ...cur, poses: POSES.filter((p) => p === pose || cur.poses.includes(p)) };
      await putSession(next);
      setSession(next);
      invalidate(id);
      setSlot(pose, { url: URL.createObjectURL(blob) });
      const a = await analysePhoto(pose, blob);
      setSlot(pose, { quality: a.quality, busy: false });
    } catch (e) {
      setModelMsg((e as Error).message);
      setSlot(pose, { busy: false });
    }
  };

  const remove = async (pose: Pose) => {
    const cur = (await getSession(id)) ?? sessionRef.current;
    if (!cur) return;
    await deletePhoto(id, pose);
    const next = { ...cur, poses: cur.poses.filter((p) => p !== pose) };
    await putSession(next);
    setSession(next);
    invalidate(id);
    setSlot(pose, { url: null, quality: null });
  };

  if (!session) return <div className="page"><p className="muted">Loading…</p></div>;
  const ready = session.poses.includes('rest') && (session.poses.includes('frown') || session.poses.includes('raise'));

  return (
    <div className="page">
      <nav className="crumbs">
        <a href="#/">Clients</a> / <a href={`#/client/${session.clientId}`}>{clientName}</a> /{' '}
        {session.kind === 'consult' ? 'Consultation photos' : 'Follow-up photos'}
      </nav>
      <div className="page-head">
        <div>
          <h2>{session.kind === 'consult' ? 'Consultation photos' : '2-week follow-up photos'}</h2>
          <p className="muted">
            Same spot, same light, same distance for every photo. The relaxed photo is the client's baseline: treated
            areas can soften toward it, never past it.
          </p>
        </div>
        <button className="btn primary" disabled={!ready} onClick={() => navigate(`/session/${id}`)}>
          {session.kind === 'consult' ? 'Continue to comparison' : 'Compare with projection'}
        </button>
      </div>
      {modelMsg && <p className="status warn">{modelMsg}</p>}

      <div className="pose-grid">
        {POSES.map((pose) => {
          const info = POSE_INFO[pose];
          const s = slots[pose];
          return (
            <article key={pose} className={`pose ${s.quality ? (s.quality.ok ? 'ok' : 'warn') : ''}`}>
              <div className="pose-img">
                {s.url ? <img src={s.url} alt={`${info.title} photo`} /> : <div className="pose-empty">{info.title}</div>}
                {s.busy && <div className="pose-busy"><Spinner label="Checking" /></div>}
              </div>
              <div className="pose-body">
                <h4>
                  {info.title} {info.optional && <span className="tag">optional</span>}
                </h4>
                <p className="muted small">{info.prompt}</p>
                {s.quality && (
                  s.quality.ok ? (
                    <p className="good small">✓ Looks good</p>
                  ) : (
                    <ul className="issues small">{s.quality.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                  )
                )}
                <div className="row wrap">
                  <button className="btn sm primary" onClick={() => setCamera(pose)}>{s.url ? 'Retake' : 'Take photo'}</button>
                  <button className="btn sm" onClick={() => { fileFor.current = pose; fileInput.current?.click(); }}>Upload</button>
                  {s.url && <button className="btn sm ghost danger" onClick={() => remove(pose)}>Remove</button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          const p = fileFor.current;
          if (f && p) accept(p, f);
          e.target.value = '';
        }}
      />

      {camera && (
        <CameraCapture
          title={POSE_INFO[camera].title}
          prompt={POSE_INFO[camera].prompt}
          onClose={() => setCamera(null)}
          onCapture={(b) => accept(camera, b)}
        />
      )}
    </div>
  );
}
