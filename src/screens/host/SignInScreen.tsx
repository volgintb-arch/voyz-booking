import { useEffect, useRef, useState } from 'react';
import { ApiFailure, call, hostToken } from '../../api/client';
import { Cover } from '../../components/Cover';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Layout';
import { useT } from '../../i18n';

interface Options {
  telegram: boolean;
  dev: boolean;
}

/** "Войти через Telegram" (D-007): the bot confirms, the app polls for the session. */
export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useT();
  const [options, setOptions] = useState<Options | null>(null);
  const [waiting, setWaiting] = useState<{ code: string; botUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const finish = (token: string) => {
    hostToken.set(token);
    onSignedIn();
  };

  useEffect(() => {
    call<Options>('GET', 'api/auth/options').then(setOptions).catch(() => setError(t.common.serverDown));
    // Inside a Telegram Mini App the user is already known.
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      call<{ token: string }>('POST', 'api/auth/telegram/webapp', { initData })
        .then((r) => finish(r.token))
        .catch(() => undefined);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError(null);
    try {
      const r = await call<{ code: string; botUrl: string | null }>('POST', 'api/auth/telegram/start', {});
      if (!r.botUrl) return setError(t.signIn.noBot);
      setWaiting({ code: r.code, botUrl: r.botUrl });
      window.open(r.botUrl, '_blank');
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try {
          const p = await call<{ status: string; token?: string }>('GET', `api/auth/telegram/poll?code=${encodeURIComponent(r.code)}`);
          if (p.status === 'ok' && p.token) {
            if (timer.current) clearInterval(timer.current);
            finish(p.token);
          }
        } catch (e) {
          if (e instanceof ApiFailure && e.code === 'not_found') {
            if (timer.current) clearInterval(timer.current);
            setWaiting(null);
            setError(t.signIn.expired);
          }
        }
      }, 2000);
    } catch {
      setError(t.common.serverDown);
    }
  };

  const demo = async () => {
    try {
      finish((await call<{ token: string }>('POST', 'api/auth/dev', {})).token);
    } catch {
      setError(t.common.serverDown);
    }
  };

  return (
    <Screen title={t.signIn.title} back="/">
      <div className="hero">
        <Cover kind="guest_house" hue={28} />
        <div className="wordmark">
          VOYZ
          <small>{t.signIn.forHosts}</small>
        </div>
      </div>
      <p className="center">{t.signIn.intro}</p>
      {waiting ? (
        <div className="card accent center" style={{ alignItems: 'center' }}>
          <p className="strong">{t.signIn.waiting}</p>
          <p className="muted small">{t.signIn.waitingHint}</p>
          <a className="btn lime block" href={waiting.botUrl} target="_blank" rel="noreferrer">
            {t.signIn.openAgain}
          </a>
        </div>
      ) : (
        <button type="button" className="btn lime block" onClick={start} disabled={options?.telegram === false}>
          <Icon name="chat" /> {t.signIn.telegram}
        </button>
      )}
      {options?.dev && (
        <button type="button" className="btn outline block" onClick={demo}>
          {t.signIn.demo}
        </button>
      )}
      {error && <p className="error center">{error}</p>}
      <p className="muted small center">{t.signIn.why}</p>
    </Screen>
  );
}
