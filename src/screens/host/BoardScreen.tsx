import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Layout';
import { holdsUnit } from '../../domain/availability';
import { addDays, nightsBetween, todayIn } from '../../domain/dates';
import { boardTone, bookingMoney, type BoardTone } from '../../domain/ledger';
import type { IsoDate } from '../../domain/types';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { PropertySwitch } from './PropertySwitch';
import { hostTabs } from './tabs';
import { useHostProperty } from './useHostProperty';

interface Bar {
  key: string;
  start: IsoDate;
  span: number;
  tone: BoardTone;
  label: string;
  bookingId: string | null;
}

const WINDOWS = [14, 30];
const TONES: BoardTone[] = ['paid', 'confirmed', 'pending', 'stay', 'ical', 'closed'];

export function BoardScreen() {
  const { state } = useStore();
  const { t, lang, fmtDate } = useT();
  const navigate = useNavigate();
  const { properties, property, select } = useHostProperty();
  const [days, setDays] = useState(14);
  const [offset, setOffset] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    wrapRef.current?.scrollTo({ left: 0 });
  }, [property?.id]);

  if (!property) {
    return (
      <Screen title={t.host.tabBoard} back="/" tabs={hostTabs(t)}>
        <p className="muted">{t.host.noProperties}</p>
      </Screen>
    );
  }

  const today = todayIn(property.timezone);
  const from = addDays(today, offset);
  const to = addDays(from, days);
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const categories = state.categories.filter((c) => c.propertyId === property.id);

  const barsFor = (unitId: string): Bar[] => {
    const clip = (start: IsoDate, end: IsoDate) => {
      const s = start < from ? from : start;
      const e = end > to ? to : end;
      return { s, span: nightsBetween(s, e) };
    };
    const fromBookings = state.bookings
      .filter((b) => b.unitId === unitId && holdsUnit(b) && b.checkIn < to && b.checkOut > from)
      .map((b): Bar => {
        const { s, span } = clip(b.checkIn, b.checkOut);
        return { key: b.id, start: s, span, tone: boardTone(b, bookingMoney(b, state.payments)), label: b.guestName, bookingId: b.id };
      });
    const fromBlocks = state.blocks
      .filter((bl) => bl.unitId === unitId && bl.from < to && bl.to > from)
      .map((bl): Bar => {
        const { s, span } = clip(bl.from, bl.to);
        return { key: bl.id, start: s, span, tone: bl.reason === 'ical' ? 'ical' : 'closed', label: bl.label, bookingId: null };
      });
    return [...fromBookings, ...fromBlocks];
  };

  const isWeekend = (d: IsoDate) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    return wd === 0 || wd === 6;
  };

  return (
    <Screen title={t.host.tabBoard} back="/" tabs={hostTabs(t)}>
      <div className="row" style={{ alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PropertySwitch properties={properties} value={property} onChange={select} />
        </div>
        <Link to={`/host/promo?p=${property.slug}`} className="roundBtn lime" aria-label={t.promo.title} title={t.promo.title}>
          <Icon name="share" />
        </Link>
      </div>
      <div className="row between">
        <div className="row">
          <button type="button" className="roundBtn small" aria-label="-7" onClick={() => setOffset((o) => o - 7)}>
            <Icon name="back" size={18} />
          </button>
          <button type="button" className="chip" onClick={() => setOffset(-1)}>
            {t.host.today}
          </button>
          <button type="button" className="roundBtn small" aria-label="+7" onClick={() => setOffset((o) => o + 7)}>
            <Icon name="chevron" size={18} />
          </button>
        </div>
        <div className="chips">
          {WINDOWS.map((w) => (
            <button key={w} type="button" className="chip" aria-pressed={days === w} onClick={() => setDays(w)}>
              {t.host.days(w)}
            </button>
          ))}
        </div>
      </div>

      <div className="board-wrap" ref={wrapRef}>
        <table className="board">
          <thead>
            <tr>
              <th className="unit" />
              {dates.map((d) => (
                <th key={d} className={`${d === today ? 'today' : ''} ${isWeekend(d) ? 'weekend' : ''}`}>
                  <span>
                    {fmtDate(d, { weekday: 'short' })}
                    <br />
                    {fmtDate(d, { day: 'numeric' })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <CategoryRows key={c.id} name={c.name[lang]} colSpan={days + 1}>
                {state.units
                  .filter((u) => u.categoryId === c.id)
                  .map((u) => {
                    const bars = barsFor(u.id);
                    const covered = new Set<IsoDate>();
                    for (const b of bars) for (let i = 1; i < b.span; i++) covered.add(addDays(b.start, i));
                    return (
                      <tr key={u.id}>
                        <th className="unit" scope="row">
                          {u.name}
                        </th>
                        {dates.map((d) => {
                          if (covered.has(d)) return null;
                          const bar = bars.find((b) => b.start === d);
                          const cls = `cell ${isWeekend(d) ? 'weekend' : ''} ${d === today ? 'today' : ''}`;
                          if (bar) {
                            return (
                              <td key={d} className={cls} colSpan={bar.span}>
                                <button
                                  type="button"
                                  className={`bar ${bar.tone}`}
                                  onClick={() => bar.bookingId && navigate(`/host/b/${bar.bookingId}`)}
                                  title={bar.label}
                                >
                                  {bar.label}
                                </button>
                              </td>
                            );
                          }
                          return (
                            <td
                              key={d}
                              className={cls}
                              onClick={() => navigate(`/host/new?p=${property.slug}&unit=${u.id}&in=${d}`)}
                              aria-label={`${u.name} ${d}`}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
              </CategoryRows>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        {TONES.map((tone) => (
          <span key={tone}>
            <i className={`bar ${tone}`} />
            {t.host.legend[tone]}
          </span>
        ))}
      </div>
      <p className="muted small">{t.host.tapHint}</p>
    </Screen>
  );
}

function CategoryRows({ name, colSpan, children }: { name: string; colSpan: number; children: ReactNode }) {
  return (
    <>
      <tr className="cat">
        <td colSpan={colSpan}>{name}</td>
      </tr>
      {children}
    </>
  );
}
