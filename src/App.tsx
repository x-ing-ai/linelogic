import { useEffect, useState } from 'react';
import { BRAND, DISCLAIMER_FULL } from './content';
import { getSession, type Session } from './lib/db';
import { CapturePage } from './pages/CapturePage';
import { ClientPage } from './pages/ClientPage';
import { ConsultPage } from './pages/ConsultPage';
import { FollowUpPage } from './pages/FollowUpPage';
import { Home } from './pages/Home';

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const on = () => { setHash(window.location.hash.replace(/^#/, '') || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function SessionRoute({ id }: { id: string }) {
  const [s, setS] = useState<Session | null | undefined>(undefined);
  useEffect(() => { getSession(id).then((x) => setS(x ?? null)); }, [id]);
  if (s === undefined) return <div className="page"><p className="muted">Loading…</p></div>;
  if (s === null) return <div className="page"><p>Session not found on this device.</p><a href="#/">Back</a></div>;
  return s.kind === 'consult' ? <ConsultPage key={id} session={s} /> : <FollowUpPage key={id} session={s} />;
}

function Route({ path }: { path: string }) {
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/client\/([\w-]+)$/))) return <ClientPage id={m[1]} />;
  if ((m = path.match(/^\/session\/([\w-]+)\/capture$/))) return <CapturePage id={m[1]} />;
  if ((m = path.match(/^\/session\/([\w-]+)$/))) return <SessionRoute id={m[1]} />;
  return <Home />;
}

export function App() {
  const path = useHash();
  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 15c3-4 6-4 9 0s6 4 9 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M3 9h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" /></svg>
          </span>
          {BRAND}
          <span className="tag">Demo</span>
        </a>
        <span className="topbar-note">Data stays on this device</span>
      </header>
      <main>
        <Route path={path} />
      </main>
      <footer className="footer">
        <p>{DISCLAIMER_FULL}</p>
      </footer>
    </>
  );
}
