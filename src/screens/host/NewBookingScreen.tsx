import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Field, Screen } from '../../components/Layout';
import { conflictsFor } from '../../domain/availability';
import { addDays, isIsoDate, nightsBetween, nowWithOffset, todayIn } from '../../domain/dates';
import { formatMoney, parseMajor, percentOf } from '../../domain/money';
import { quoteStay } from '../../domain/pricing';
import type { Channel } from '../../domain/types';
import { createBooking } from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { PropertySwitch } from './PropertySwitch';
import { hostTabs } from './tabs';
import { useHostProperty } from './useHostProperty';

const CHANNELS: Channel[] = ['whatsapp', 'telegram', 'instagram', 'phone', 'walk_in', 'booking_com', 'airbnb'];

export function NewBookingScreen() {
  const { state, update } = useStore();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { properties, property, select } = useHostProperty();

  const units = state.units.filter((u) => u.propertyId === property?.id);
  const today = property ? todayIn(property.timezone) : '';
  const qIn = params.get('in') ?? '';
  const [unitId, setUnitId] = useState(() => units.find((u) => u.id === params.get('unit'))?.id ?? units[0]?.id ?? '');
  const [checkIn, setCheckIn] = useState(isIsoDate(qIn) ? qIn : today);
  const [checkOut, setCheckOut] = useState(addDays(isIsoDate(qIn) ? qIn : today, 1));
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [total, setTotal] = useState<string | null>(null); // null = follow the price list
  const [confirmNow, setConfirmNow] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!property) {
    return (
      <Screen title={t.create.title} back="/host" tabs={hostTabs(t)}>
        <p className="muted">{t.host.noProperties}</p>
      </Screen>
    );
  }

  // Switching property resets the unit to one that belongs to it.
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  const category = state.categories.find((c) => c.id === unit?.categoryId);
  const validDates = nightsBetween(checkIn, checkOut) > 0;
  const quote = category && validDates ? quoteStay(category, state.seasons, checkIn, checkOut, guests, property.cancellation) : null;
  const conflicts = unit && validDates ? conflictsFor(unit.id, checkIn, checkOut, state.bookings, state.blocks) : [];
  const fmt = (n: number) => formatMoney(n, property.currency, lang);
  const totalMinor = total === null ? (quote?.total ?? 0) : parseMajor(total);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!unit || !category) return;
    if (!validDates) return setError(t.property.badDates);
    if (!name.trim()) return setError(t.book.nameRequired);
    if (totalMinor === null) return setError(t.detail.badAmount);
    const result = createBooking(
      state,
      {
        propertyId: property.id,
        unitId: unit.id,
        categoryId: category.id,
        checkIn,
        checkOut,
        guests,
        guestName: name.trim(),
        guestPhone: phone.trim(),
        channel,
        status: confirmNow ? 'confirmed' : 'pending',
        currency: property.currency,
        total: totalMinor,
        prepaymentDue: percentOf(totalMinor, property.cancellation.prepaymentPercent),
        nonRefundablePrepayment: property.cancellation.nonRefundable,
        note: note.trim(),
        createdBy: 'host',
        source: null,
      },
      nowWithOffset(property.timezone),
    );
    if (!result.ok) return setError(t.create.conflict);
    update(() => result.state);
    navigate(`/host/b/${result.booking.id}`, { replace: true });
  };

  return (
    <Screen title={t.create.title} back="/host" tabs={hostTabs(t)}>
      <PropertySwitch properties={properties} value={property} onChange={select} />
      <form className="stack" onSubmit={submit} noValidate>
        <Field label={t.create.unit}>
          <select value={unit?.id ?? ''} onChange={(e) => setUnitId(e.target.value)}>
            {state.categories
              .filter((c) => c.propertyId === property.id)
              .map((c) => (
                <optgroup key={c.id} label={c.name[lang]}>
                  {units
                    .filter((u) => u.categoryId === c.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
        </Field>
        <div className="grid2">
          <Field label={t.search.checkIn}>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setCheckIn(v);
                if (checkOut <= v) setCheckOut(addDays(v, 1));
              }}
            />
          </Field>
          <Field label={t.search.checkOut}>
            <input type="date" min={addDays(checkIn, 1)} value={checkOut} onChange={(e) => e.target.value && setCheckOut(e.target.value)} />
          </Field>
        </div>
        {conflicts.length > 0 && (
          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            <p className="error strong">{t.create.conflict}</p>
            {conflicts.map((c) => (
              <p key={c.id} className="small">
                {c.kind === 'booking' ? `${c.id} · ${c.label}` : `${c.label} (${t.create.conflictBlock})`}
              </p>
            ))}
          </div>
        )}
        <div className="grid2">
          <Field label={t.search.guests}>
            <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
              {Array.from({ length: category?.capacity ?? 4 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.detail.channel}>
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t.channel[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t.book.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label={t.book.phone}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="+996 …" />
        </Field>
        <Field label={`${t.create.total}, ${property.currency}`} hint={quote ? t.create.byPrices(fmt(quote.total)) : undefined}>
          <input
            value={total ?? (quote ? String(quote.total / 100) : '')}
            onChange={(e) => setTotal(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label={t.detail.note}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} />
          <span>{t.create.confirmNow}</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn block" disabled={conflicts.length > 0 || !validDates}>
          {t.create.submit}
        </button>
        <p className="muted small">{t.create.hint}</p>
      </form>
    </Screen>
  );
}
