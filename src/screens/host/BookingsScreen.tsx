import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { addDays, todayIn } from '../../domain/dates';
import { bookingMoney } from '../../domain/ledger';
import { formatMoney } from '../../domain/money';
import type { Booking } from '../../domain/types';
import { useStore } from '../../data/store';
import { NoProperties } from '../../components/NoProperties';
import { useT } from '../../i18n';
import { PropertySwitch } from './PropertySwitch';
import { hostTabs } from './tabs';
import { useHostProperty } from './useHostProperty';

type Filter = 'pending' | 'arrivals' | 'departures' | 'upcoming' | 'all';
const FILTERS: Filter[] = ['pending', 'arrivals', 'departures', 'upcoming', 'all'];

export function BookingsScreen() {
  const { state } = useStore();
  const { t, lang, fmtRange } = useT();
  const { properties, property, select } = useHostProperty();
  const [filter, setFilter] = useState<Filter>('pending');

  if (!property) {
    return (
      <Screen title={t.host.tabBookings} tabs={hostTabs(t)}>
        <NoProperties />
      </Screen>
    );
  }

  const today = todayIn(property.timezone);
  const tomorrow = addDays(today, 1);
  const own = state.bookings.filter((b) => b.propertyId === property.id);
  const match: Record<Filter, (b: Booking) => boolean> = {
    pending: (b) => b.status === 'pending',
    arrivals: (b) => (b.checkIn === today || b.checkIn === tomorrow) && (b.status === 'confirmed' || b.status === 'pending'),
    departures: (b) => b.checkOut === today && b.status === 'checked_in',
    upcoming: (b) => b.checkIn >= today && b.status !== 'cancelled' && b.status !== 'no_show',
    all: () => true,
  };
  const list = own.filter(match[filter]).sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  return (
    <Screen title={t.host.tabBookings} tabs={hostTabs(t)}>
      <PropertySwitch properties={properties} value={property} onChange={select} />
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t.list[f]}
            <span className="count">{own.filter(match[f]).length}</span>
          </button>
        ))}
      </div>
      {filter === 'arrivals' && <p className="muted small">{t.list.arrivalsHint}</p>}
      {list.length === 0 && <p className="muted">{t.list.empty}</p>}
      {list.map((b) => {
        const unit = state.units.find((u) => u.id === b.unitId);
        const money = bookingMoney(b, state.payments);
        return (
          <Link key={b.id} to={`/host/b/${b.id}`} className="card accent" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="row between">
              <span className="strong" style={{ fontSize: 19 }}>{b.guestName}</span>
              <span className="row" style={{ gap: 6 }}>
                {b.status === 'pending' && b.guestReportedPaidAt && <span className="badge confirmed">{t.deposit.paidTag}</span>}
                <StatusBadge status={b.status} />
              </span>
            </div>
            <div className="row between muted small">
              <span>
                {unit?.name} · {fmtRange(b.checkIn, b.checkOut)} · {t.common.guests(b.guests)}
              </span>
              <span>{t.channel[b.channel]}</span>
            </div>
            <div className="row between small">
              <span>
                {t.detail.paid}: {formatMoney(money.paid, b.currency, lang)}
              </span>
              <span className="pricePill">{formatMoney(b.total, b.currency, lang)}</span>
            </div>
          </Link>
        );
      })}
    </Screen>
  );
}
