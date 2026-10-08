import { useEffect, useState, type MouseEvent } from 'react';
import { apiMode, call, guestTrips } from '../api/client';
import type { GuestView } from '../api/types';
import { useT } from '../i18n';
import { Icon } from './Icon';

/**
 * "Follow in Telegram": the guest has no account, so the bot is how they hear that
 * the host confirmed. The link is fetched up front — a plain <a> opens Telegram
 * everywhere (browser, native shell), unlike window.open after an await.
 */
export function FollowInTelegram({ view, onReturn }: { view: GuestView; onReturn?: () => void }) {
  const { t, lang } = useT();
  const [url, setUrl] = useState<string | null>(null);
  const { booking, telegram } = view;
  const active = booking.status === 'pending' || booking.status === 'confirmed';
  const wanted = apiMode && telegram.available && !telegram.linked && active;

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    call<{ url: string }>('POST', `api/public/bookings/${encodeURIComponent(booking.id)}/telegram`, { lang }, { guestToken: guestTrips.token(booking.id) ?? '' })
      .then((r) => alive && setUrl(r.url))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [wanted, booking.id, lang]);

  // Back from Telegram: show "updates arrive in Telegram".
  useEffect(() => {
    if (!wanted || !onReturn) return;
    const back = () => document.visibilityState === 'visible' && onReturn();
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [wanted, onReturn]);

  if (!apiMode || !telegram.available || !active) return null;
  if (telegram.linked) {
    return (
      <p className="muted small row" style={{ gap: 6 }}>
        <Icon name="check" size={16} /> {t.follow.linked}
      </p>
    );
  }
  if (!url) return null;
  const open = (e: MouseEvent) => {
    const tg = window.Telegram?.WebApp;
    if (tg?.initData && tg.openTelegramLink) {
      e.preventDefault();
      tg.openTelegramLink(url);
    }
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <a className="btn outline block" href={url} target="_blank" rel="noreferrer" onClick={open}>
        <Icon name="chat" /> {t.follow.button}
      </a>
      <span className="muted tiny center">{t.follow.hint}</span>
    </div>
  );
}
