import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Field, Screen } from '../../components/Layout';
import { nightsBetween } from '../../domain/dates';
import { formatMoney, parseMajor } from '../../domain/money';
import type { Channel } from '../../domain/types';
import { useActions } from '../../data/actions';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { hostTabs } from './tabs';

const OTA_CHANNELS: Channel[] = ['booking_com', 'airbnb', 'phone', 'walk_in'];

/** A Booking.com / Airbnb stripe on the board → a booking with the money (for Aynes). */
export function OtaBookingScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { state } = useStore();
  const actions = useActions();
  const { t, lang, fmtRange } = useT();
  const block = state.blocks.find((b) => b.id === id && b.reason === 'ical');
  const unit = state.units.find((u) => u.id === block?.unitId);
  const property = state.properties.find((p) => p.id === unit?.propertyId);
  const category = state.categories.find((c) => c.id === unit?.categoryId);
  const [channel, setChannel] = useState<Channel>(block?.label === 'Airbnb' ? 'airbnb' : 'booking_com');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(Math.min(2, category?.capacity ?? 2));
  const [total, setTotal] = useState('');
  const [commission, setCommission] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!block || !unit || !property) {
    return (
      <Screen title={t.ota.title} back="/host" tabs={hostTabs(t)}>
        <p className="muted">{t.ota.gone}</p>
      </Screen>
    );
  }

  const fmt = (n: number) => formatMoney(n, property.currency, lang);
  const totalMinor = parseMajor(total) ?? 0;
  const commissionMinor = commission.trim() ? (parseMajor(commission) ?? 0) : 0;
  const site = channel === 'airbnb' ? 'Airbnb' : channel === 'booking_com' ? 'Booking.com' : block.label;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t.book.nameRequired);
    if (!totalMinor) return setError(t.detail.badAmount);
    if (commissionMinor > totalMinor) return setError(t.ota.tooMuch);
    setBusy(true);
    const r = await actions.bookFromBlock(block.id, {
      guestName: name.trim(),
      guestPhone: phone.trim(),
      guests,
      channel,
      total: totalMinor,
      commission: commissionMinor,
      note: note.trim(),
    });
    setBusy(false);
    if (!r.ok) return setError(r.code === 'offline' ? t.common.offline : r.code === 'not_found' ? t.ota.gone : t.common.serverDown);
    navigate(`/host/b/${r.value.id}`, { replace: true });
  };

  return (
    <Screen title={t.ota.title} back={`/host?p=${property.slug}`} tabs={hostTabs(t)}>
      <div className="card accent">
        <span className="tag">{block.label}</span>
        <h3 className="title-caps">{property.name[lang]}</h3>
        <span className="muted">
          {category?.name[lang]} · {unit.name}
        </span>
        <span>
          {fmtRange(block.from, block.to)} · {t.common.nights(nightsBetween(block.from, block.to))}
        </span>
      </div>
      <p className="banner info">{t.ota.intro(site)}</p>

      <form className="stack" onSubmit={submit} noValidate>
        <div className="grid2">
          <Field label={t.ota.channel}>
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {OTA_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t.channel[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.search.guests}>
            <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
              {Array.from({ length: category?.capacity ?? 4 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t.book.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </Field>
        <Field label={t.book.phone} hint={t.ota.phoneHint}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="+996 …" />
        </Field>
        <Field label={`${t.ota.total}, ${property.currency}`} hint={t.ota.totalHint}>
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={`${t.ota.commission}, ${property.currency}`} hint={t.ota.commissionHint}>
          <input value={commission} onChange={(e) => setCommission(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
        {totalMinor > 0 && commissionMinor <= totalMinor && <p className="strong">{t.ota.youGet(fmt(totalMinor - commissionMinor))}</p>}
        <Field label={t.detail.note}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn lime block" disabled={busy}>
          {t.ota.submit}
        </button>
      </form>
    </Screen>
  );
}
