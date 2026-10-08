import { useState, type FormEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Link } from 'react-router-dom';
import { AccRow, Field, Screen } from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { addDays, nightsBetween, todayIn } from '../../domain/dates';
import { formatMoney, parseMajor } from '../../domain/money';
import type { Category, IcalChannel, PaymentMethod, Property } from '../../domain/types';
import {
  addBlock,
  addIcalChannel,
  addSeason,
  removeBlock,
  removeIcalChannel,
  removeSeason,
  updateCategory,
  updateProperty,
} from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { PaymentSettings } from './PaymentSettings';
import { PropertySwitch } from './PropertySwitch';
import { hostTabs } from './tabs';
import { useHostProperty } from './useHostProperty';

const ALL_METHODS: PaymentMethod[] = ['qr', 'card', 'transfer', 'cash'];

function Section({ title, icon, children, open }: { title: string; icon: IconName; children: ReactNode; open?: boolean }) {
  return (
    <AccRow icon={icon} title={title} open={open}>
      {children}
    </AccRow>
  );
}

export function SettingsScreen() {
  const { t } = useT();
  const { properties, property, select } = useHostProperty();
  const toast = useToast();
  return (
    <Screen title={t.host.tabSettings} back="/" tabs={hostTabs(t)}>
      {property ? (
        <>
          <PropertySwitch properties={properties} value={property} onChange={select} />
          <div>
          <Link to={`/host/promo?p=${property.slug}`} className="promo" style={{ minHeight: 64 }}>
            <strong>
              {t.promo.title}
              <span className="muted">{t.promo.subtitle}</span>
            </strong>
            <span className="roundBtn lime">
              <Icon name="share" />
            </span>
          </Link>
          <Section icon="sliders" title={t.settings.prices}>
            <Prices key={property.id} property={property} onSaved={() => toast.show(t.common.saved)} />
          </Section>
          <Section icon="wallet" title={t.payment.title}>
            <PaymentSettings key={property.id} property={property} onSaved={() => toast.show(t.common.saved)} />
          </Section>
          <Section icon="shield" title={t.settings.rules}>
            <Rules key={property.id} property={property} onSaved={() => toast.show(t.common.saved)} />
          </Section>
          <Section icon="calendar" title={t.settings.closed}>
            <ClosedDates key={property.id} property={property} />
          </Section>
          <Section icon="grid" title={t.settings.ical}>
            <Ical key={property.id} property={property} />
          </Section>
          </div>
        </>
      ) : (
        <p className="muted">{t.host.noProperties}</p>
      )}
      <Section icon="sparkle" title={t.settings.aynes} open>
        <Aynes />
      </Section>
      <Section icon="user" title={t.settings.demo}>
        <Demo />
      </Section>
      {toast.node}
    </Screen>
  );
}

function CategoryPrices({ category, onSaved }: { category: Category; onSaved: () => void }) {
  const { update } = useStore();
  const { t, lang } = useT();
  const [base, setBase] = useState(String(category.basePrice / 100));
  const [extra, setExtra] = useState(String(category.extraGuestPrice / 100));
  const [minNights, setMinNights] = useState(String(category.minNights));
  const [capacity, setCapacity] = useState(String(category.capacity));
  const save = (e: FormEvent) => {
    e.preventDefault();
    const basePrice = parseMajor(base);
    const extraGuestPrice = parseMajor(extra);
    const mn = Number(minNights);
    const cap = Number(capacity);
    if (basePrice === null || extraGuestPrice === null || !(mn >= 1) || !(cap >= 1)) return;
    update((s) =>
      updateCategory(s, category.id, {
        basePrice,
        extraGuestPrice,
        minNights: Math.floor(mn),
        capacity: Math.floor(cap),
        baseOccupancy: Math.min(category.baseOccupancy, Math.floor(cap)),
      }),
    );
    onSaved();
  };
  return (
    <form className="card" onSubmit={save}>
      <strong>{category.name[lang]}</strong>
      <div className="grid2">
        <Field label={t.settings.basePrice}>
          <input value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={t.settings.extraGuest(category.baseOccupancy)}>
          <input value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={t.settings.minNights}>
          <input value={minNights} onChange={(e) => setMinNights(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label={t.settings.capacity}>
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <button type="submit" className="btn small lime">
        {t.common.save}
      </button>
    </form>
  );
}

function Prices({ property, onSaved }: { property: Property; onSaved: () => void }) {
  const { state, update } = useStore();
  const { t, lang, fmtRange } = useT();
  const categories = state.categories.filter((c) => c.propertyId === property.id);
  const seasons = state.seasons.filter((s) => s.propertyId === property.id).sort((a, b) => a.from.localeCompare(b.from));
  const today = todayIn(property.timezone);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 30));
  const [price, setPrice] = useState('');
  const [minNights, setMinNights] = useState('');

  const add = (e: FormEvent) => {
    e.preventDefault();
    const minor = parseMajor(price);
    if (!name.trim() || minor === null || to < from) return;
    const label = name.trim();
    update((s) =>
      addSeason(s, {
        propertyId: property.id,
        categoryId: categoryId || null,
        name: { ru: label, ky: label, en: label },
        from,
        to,
        price: minor,
        minNights: Number(minNights) >= 1 ? Math.floor(Number(minNights)) : null,
      }),
    );
    setName('');
    setPrice('');
    onSaved();
  };

  return (
    <>
      {categories.map((c) => (
        <CategoryPrices key={c.id} category={c} onSaved={onSaved} />
      ))}
      <strong style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>{t.settings.seasons}</strong>
      {seasons.length === 0 && <p className="muted small">{t.settings.noSeasons}</p>}
      {seasons.map((s) => (
        <div key={s.id} className="row between small">
          <span>
            <strong>{s.name[lang]}</strong> · {fmtRange(s.from, s.to)} · {categories.find((c) => c.id === s.categoryId)?.name[lang] ?? t.settings.allCategories}
            {s.minNights ? ` · ${t.settings.minNights.toLowerCase()} ${s.minNights}` : ''}
          </span>
          <span className="row">
            <span className="strong">{formatMoney(s.price, property.currency, lang)}</span>
            <button type="button" className="roundBtn small" aria-label={t.common.delete} onClick={() => update((st) => removeSeason(st, s.id))}>
              ×
            </button>
          </span>
        </div>
      ))}
      <form className="stack" onSubmit={add}>
        <div className="grid2">
          <Field label={t.settings.seasonName}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </Field>
          <Field label={t.create.category}>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t.settings.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name[lang]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.settings.from}>
            <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </Field>
          <Field label={t.settings.to}>
            <input type="date" min={from} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </Field>
          <Field label={t.settings.basePrice}>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label={t.settings.minNights}>
            <input value={minNights} onChange={(e) => setMinNights(e.target.value)} inputMode="numeric" placeholder="—" />
          </Field>
        </div>
        <button type="submit" className="btn small lime">
          {t.settings.addSeason}
        </button>
      </form>
    </>
  );
}

function Rules({ property, onSaved }: { property: Property; onSaved: () => void }) {
  const { update } = useStore();
  const { t } = useT();
  const [percent, setPercent] = useState(String(property.cancellation.prepaymentPercent));
  const [days, setDays] = useState(String(property.cancellation.freeCancelDays));
  const [nonRefundable, setNonRefundable] = useState(property.cancellation.nonRefundable);
  const [methods, setMethods] = useState<PaymentMethod[]>(property.paymentMethods);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const p = Math.min(100, Math.max(0, Math.floor(Number(percent) || 0)));
    const d = Math.max(0, Math.floor(Number(days) || 0));
    update((s) =>
      updateProperty(s, property.id, {
        cancellation: { prepaymentPercent: p, freeCancelDays: d, nonRefundable },
        paymentMethods: methods.length > 0 ? methods : ['cash'],
      }),
    );
    onSaved();
  };
  const toggle = (m: PaymentMethod) => setMethods((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));
  return (
    <form className="stack" onSubmit={save}>
      <div className="grid2">
        <Field label={t.settings.prepaymentPercent}>
          <input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label={t.settings.freeCancelDays}>
          <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" disabled={nonRefundable} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={nonRefundable} onChange={(e) => setNonRefundable(e.target.checked)} />
        <span>{t.settings.nonRefundable}</span>
      </label>
      <span className="muted small">{t.settings.paymentMethods}</span>
      <div className="chips">
        {ALL_METHODS.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={methods.includes(m)} onClick={() => toggle(m)}>
            {t.method[m]}
          </button>
        ))}
      </div>
      <button type="submit" className="btn small lime">
        {t.common.save}
      </button>
    </form>
  );
}

function ClosedDates({ property }: { property: Property }) {
  const { state, update } = useStore();
  const { t, fmtRange } = useT();
  const units = state.units.filter((u) => u.propertyId === property.id);
  const today = todayIn(property.timezone);
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 1));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const blocks = state.blocks.filter((b) => b.reason === 'closed' && units.some((u) => u.id === b.unitId));

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (nightsBetween(from, to) < 1) return setError(t.property.badDates);
    const result = addBlock(state, { unitId, from, to, reason: 'closed', label: reason.trim() || t.host.legend.closed });
    if (!result.ok) return setError(`${t.create.conflict} ${result.conflicts.map((c) => c.label).join(', ')}`);
    update(() => result.state);
    setError(null);
    setReason('');
  };

  return (
    <>
      {blocks.length === 0 && <p className="muted small">{t.settings.noBlocks}</p>}
      {blocks.map((b) => (
        <div key={b.id} className="row between small">
          <span>
            <strong>{units.find((u) => u.id === b.unitId)?.name}</strong> · {fmtRange(b.from, b.to)} · {b.label}
          </span>
          <button type="button" className="roundBtn small" aria-label={t.common.delete} onClick={() => update((s) => removeBlock(s, b.id))}>
            ×
          </button>
        </div>
      ))}
      <form className="stack" onSubmit={add}>
        <div className="grid2">
          <Field label={t.create.unit}>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.settings.reason}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={40} />
          </Field>
          <Field label={t.settings.blockFrom}>
            <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </Field>
          <Field label={t.settings.blockTo}>
            <input type="date" min={addDays(from, 1)} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </Field>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn small lime">
          {t.settings.closeDates}
        </button>
      </form>
    </>
  );
}

function Ical({ property }: { property: Property }) {
  const { state, update } = useStore();
  const { t, fmtInstant } = useT();
  const units = state.units.filter((u) => u.propertyId === property.id);
  const channels = state.icalChannels.filter((c) => units.some((u) => u.id === c.unitId));
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [platform, setPlatform] = useState<IcalChannel['platform']>('booking_com');
  const [url, setUrl] = useState('');
  const platformName = (p: IcalChannel['platform']) => (p === 'booking_com' ? 'Booking.com' : p === 'airbnb' ? 'Airbnb' : t.settings.other);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/\S+$/.test(url.trim())) return;
    update((s) => addIcalChannel(s, { unitId, platform, importUrl: url.trim() }));
    setUrl('');
  };

  return (
    <>
      <strong>{t.settings.exportTitle}</strong>
      <p className="muted small">{t.settings.exportHint}</p>
      {units.map((u) => (
        <div key={u.id} className="stack" style={{ gap: 2 }}>
          <span className="small strong">{u.name}</span>
          <code className="small" style={{ wordBreak: 'break-all' }}>{`https://api.voyz.kg/ical/${property.slug}/${u.id}.ics`}</code>
        </div>
      ))}
      <strong style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>{t.settings.importTitle}</strong>
      <p className="muted small">{t.settings.importHint}</p>
      {channels.map((c) => (
        <div key={c.id} className="row between small">
          <span>
            <strong>{units.find((u) => u.id === c.unitId)?.name}</strong> · {platformName(c.platform)} ·{' '}
            {c.lastSyncAt ? t.settings.lastSync(fmtInstant(c.lastSyncAt)) : t.settings.never}
          </span>
          <button type="button" className="roundBtn small" aria-label={t.common.delete} onClick={() => update((s) => removeIcalChannel(s, c.id))}>
            ×
          </button>
        </div>
      ))}
      <form className="stack" onSubmit={add}>
        <div className="grid2">
          <Field label={t.create.unit}>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.settings.platform}>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as IcalChannel['platform'])}>
              <option value="booking_com">Booking.com</option>
              <option value="airbnb">Airbnb</option>
              <option value="other">{t.settings.other}</option>
            </select>
          </Field>
        </div>
        <Field label={t.settings.importUrl}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" placeholder="https://…" />
        </Field>
        <button type="submit" className="btn small lime">
          {t.common.add}
        </button>
      </form>
      <p className="muted small">{t.settings.serverNote}</p>
    </>
  );
}

function Aynes() {
  const { state, update, flush, syncing, online } = useStore();
  const { t, fmtInstant } = useT();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { aynes, outbox } = state;
  const waiting = outbox.filter((o) => o.status !== 'sent').length;

  const connect = (e: FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (!/^fsk_[A-Za-z0-9_-]{8,}$/.test(k)) return setError(t.settings.badKey);
    update((s) => ({ ...s, aynes: { ...s.aynes, connected: true, keyHint: k.slice(-4) } }));
    setKey('');
    setError(null);
  };

  return (
    <>
      <p className="small">{t.settings.aynesIntro}</p>
      {aynes.connected ? (
        <div className="row between">
          <span className="strong small">{t.settings.connected(aynes.keyHint ?? '')}</span>
          <button
            type="button"
            className="btn small danger"
            onClick={() => update((s) => ({ ...s, aynes: { ...s.aynes, connected: false, keyHint: null } }))}
          >
            {t.settings.disconnect}
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={connect}>
          <Field label={t.settings.key} hint={t.settings.keyHint}>
            <input value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="fsk_…" />
          </Field>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn small">
            {t.settings.connect}
          </button>
        </form>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={aynes.shareGuestName}
          onChange={(e) => update((s) => ({ ...s, aynes: { ...s.aynes, shareGuestName: e.target.checked } }))}
        />
        <span>
          {t.settings.shareName}
          <br />
          <span className="muted small">{t.settings.shareNameHint}</span>
        </span>
      </label>
      <div className="row between" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
        <strong>
          {t.settings.queue} {waiting > 0 ? `· ${waiting}` : ''}
        </strong>
        <button type="button" className="btn small lime" disabled={!aynes.connected || !online || syncing || waiting === 0} onClick={() => void flush()}>
          {t.settings.sendNow}
        </button>
      </div>
      {outbox.length === 0 && <p className="muted small">{t.settings.queueEmpty}</p>}
      {[...outbox]
        .reverse()
        .slice(0, 20)
        .map((o) => (
          <details key={o.id}>
            <summary className="small">
              <span className={o.status === 'failed' ? 'danger' : o.status === 'sent' ? '' : 'strong'}>{t.settings.outbox[o.status]}</span> · PUT{' '}
              <code>{o.path.replace('/api/v1/bookings/', '…/')}</code> · {fmtInstant(o.createdAt)}
            </summary>
            <pre className="json">{JSON.stringify(o.body, null, 2)}</pre>
          </details>
        ))}
    </>
  );
}

function Demo() {
  const { reset } = useStore();
  const { t } = useT();
  return (
    <>
      <p className="muted small">{t.common.demo}</p>
      <button type="button" className="btn small danger" onClick={() => window.confirm(t.settings.resetConfirm) && reset()}>
        {t.settings.reset}
      </button>
    </>
  );
}
