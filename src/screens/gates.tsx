import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { apiMode, call, hostToken, ApiFailure } from '../api/client';
import type { Catalog, HostSnapshot } from '../api/types';
import { applyCatalog, applySnapshot } from '../data/state';
import { useStore } from '../data/store';
import { useT } from '../i18n';
import { SignInScreen } from './host/SignInScreen';

/** Guest screens: fresh catalog and occupancy from the server. */
export function GuestGate() {
  const { replace } = useStore();
  const { t } = useT();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!apiMode) return;
    const load = () =>
      call<Catalog>('GET', 'api/public/catalog')
        .then((cat) => {
          replace((s) => applyCatalog(s, cat));
          setError(false);
        })
        .catch(() => setError(true));
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [replace]);
  return (
    <>
      {error && <div className="banner">{t.common.serverDown}</div>}
      <Outlet />
    </>
  );
}

/** Host screens: sign-in first, then the host's workspace from the server. */
export function HostGate() {
  const { replace, state } = useStore();
  const { t } = useT();
  const [signedIn, setSignedIn] = useState(() => !apiMode || hostToken.get() !== null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!apiMode || !hostToken.get()) return;
    call<HostSnapshot>('GET', 'api/host/state', undefined, { auth: true })
      .then((snap) => {
        replace((s) => applySnapshot(s, snap));
        setError(false);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiFailure && e.status === 401) setSignedIn(false);
        else setError(true);
      });
  }, [replace]);

  useEffect(() => {
    if (!signedIn) return;
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(load, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, [signedIn, load]);

  if (!signedIn) return <SignInScreen onSignedIn={() => setSignedIn(true)} />;
  // After browsing as a guest the state holds the public catalog: wait for the host's own data.
  if (apiMode && state.view !== 'host') return <div className="app"><main className="content"><p className="muted center">{t.common.loading}</p></main></div>;
  return (
    <>
      {error && <div className="banner">{t.common.serverDown}</div>}
      <Outlet />
    </>
  );
}
