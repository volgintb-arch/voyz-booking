import { useState, type FormEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Link } from 'react-router-dom';
import { AccRow, Field, Screen } from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { addDays, nightsBetween, todayIn } from '../../domain/dates';
import { formatMoney, parseMajor } from '../../domain/money';
import type { Category, IcalChannel, PaymentMethod, Property } from '../../domain/types';
import { apiMode, call, hostToken } from '../../api/client';
import { aynesOf, useActions, type Result } from '../../data/actions';
import { useStore } from '../../data/store';
import { copyText } from '../../share/clipboard';
import { HelpLink } from '../../components/HelpLink';
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
  const saved = (r: Result) => toast.show(r.ok ? t.common.saved : r.code === 'offline' ? t.common.offline : t.common.serverDown);
  return (
    <Screen title={t.host.tabSettings} tabs={hostTabs(t)}>
      {apiMode && <AccountStrip />}
      {property ? (
        <>
          <PropertySwitch properties={properties} value={property} onChange={select} />
          <div className="actions">
            <Link to={`/host/property?p=${property.slug}`} className="btn lime">
              <Icon name="sliders" /> {t.edit.open}
            </Link>
            <Link to="/host/new-property" className="btn outline">
              <Icon name="plus" /> {t.onboarding.addProperty}
            </Link>
          </div>
          <div>
          <Link to="/host/help" className="articleCard">
            <span className="roundBtn lime small" aria-hidden>
              <Icon name="book" size={20} />
            </span>
            <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <b>{t.help.title}</b>
              <span className="muted small">{t.help.subtitle}</span>
            </span>
            <Icon name="chevron" />
          </Link>
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
            <Prices key={property.id} property={property} onSaved={saved} />
          </Section>
          <Section icon="wallet" title={t.payment.title}>
            <PaymentSettings key={property.id} property={property} onSaved={saved} />
          </Section>
          <Section icon="shield" title={t.settings.rules}>
            <Rules key={property.id} property={property} onSaved={saved} />
          </Section>
          <Section icon="calendar" title={t.settings.closed}>
            <ClosedDates key={property.id} property={property} />
          </Section>
          <Section icon="grid" title={t.settings.ical}>
            <Ical key={property.id} property={property} notify={toast.show} />
          </Section>
          <Section icon="sparkle" title={t.settings.aynes}>
            <Aynes key={property.id} property={property} />
          </Section>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{t.host.noProperties}</p>
          <Link to="/host/new-property" className="btn lime">
            <Icon name="plus" /> {t.onboarding.addProperty}
          </Link>
        </>
      )}
      <Section icon="user" title={apiMode ? t.settings.account : t.settings.demo}>
        {apiMode ? <Account /> : <Demo />}
      </Section>
      {toast.node}
    </Screen>
  );
}

function CategoryPrices({ category, onSaved }: { category: Category; onSaved: (r: Result) => void }) {
  const actions = useActions();
  const { t, lang } = useT();
  const [base, setBase] = useState(String(category.basePrice / 100));
  const [extra, setExtra] = useState(String(category.extraGuestPrice / 100));
  const [minNights, setMinNights] = useState(String(category.minNights));
  const [capacity, setCapacity] = useState(String(category.capacity));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const basePrice = parseMajor(base);
    const extraGuestPrice = parseMajor(extra);
    const mn = Number(minNights);
    const cap = Number(capacity);
    if (basePrice === null || extraGuestPrice === null || !(mn >= 1) || !(cap >= 1)) return;
    onSaved(await actions.updateCategory(category.id, { basePrice, extraGuestPrice, minNights: Math.floor(mn), capacity: Math.floor(cap) }));
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

function Prices({ property, onSaved }: { property: Property; onSaved: (r: Result) => void }) {
  const { state } = useStore();
  const actions = useActions();
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

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const minor = parseMajor(price);
    if (!name.trim() || minor === null || to < from) return;
    const r = await actions.addSeason(property.id, {
      categoryId: categoryId || null,
      name: name.trim(),
      from,
      to,
      price: minor,
      minNights: Number(minNights) >= 1 ? Math.floor(Number(minNights)) : null,
    });
    onSaved(r);
    if (!r.ok) return;
    setName('');
    setPrice('');
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
            <button type="button" className="roundBtn small" aria-label={t.common.delete} onClick={async () => onSaved(await actions.removeSeason(s.id))}>
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

function Rules({ property, onSaved }: { property: Property; onSaved: (r: Result) => void }) {
  const actions = useActions();
  const { t } = useT();
  const [percent, setPercent] = useState(String(property.cancellation.prepaymentPercent));
  const [days, setDays] = useState(String(property.cancellation.freeCancelDays));
  const [nonRefundable, setNonRefundable] = useState(property.cancellation.nonRefundable);
  const [methods, setMethods] = useState<PaymentMethod[]>(property.paymentMethods);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const p = Math.min(100, Math.max(0, Math.floor(Number(percent) || 0)));
    const d = Math.max(0, Math.floor(Number(days) || 0));
    onSaved(
      await actions.updateProperty(property.id, {
        cancellation: { prepaymentPercent: p, freeCancelDays: d, nonRefundable },
        paymentMethods: methods.length > 0 ? methods : ['cash'],
      }),
    );
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
  const { state } = useStore();
  const actions = useActions();
  const { t, fmtRange } = useT();
  const units = state.units.filter((u) => u.propertyId === property.id);
  const today = todayIn(property.timezone);
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 1));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const blocks = state.blocks.filter((b) => b.reason === 'closed' && units.some((u) => u.id === b.unitId));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (nightsBetween(from, to) < 1) return setError(t.property.badDates);
    const result = await actions.addBlock({ unitId, from, to, label: reason.trim() || t.host.legend.closed });
    if (!result.ok) {
      return setError(
        result.code === 'dates_taken' ? `${t.create.conflict} ${(result.conflicts ?? []).map((c) => c.label).join(', ')}` : t.common.serverDown,
      );
    }
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
          <button type="button" className="roundBtn small" aria-label={t.common.delete} onClick={() => void actions.removeBlock(b.id)}>
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

function Ical({ property, notify }: { property: Property; notify: (text: string) => void }) {
  const { state } = useStore();
  const actions = useActions();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const { t, fmtInstant } = useT();
  const units = state.units.filter((u) => u.propertyId === property.id);
  const channels = state.icalChannels.filter((c) => units.some((u) => u.id === c.unitId));
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [platform, setPlatform] = useState<IcalChannel['platform']>('booking_com');
  const [url, setUrl] = useState('');
  const platformName = (p: IcalChannel['platform']) => (p === 'booking_com' ? 'Booking.com' : p === 'airbnb' ? 'Airbnb' : t.settings.other);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/\S+$/.test(url.trim())) return;
    const r = await actions.addIcalChannel({ unitId, platform, importUrl: url.trim() });
    if (r.ok) setUrl('');
  };

  return (
    <>
      <p className="small">{t.settings.icalWhy}</p>
      <HelpLink article="ota-sync" />
      <strong>{t.settings.exportTitle}</strong>
      <p className="muted small">{t.settings.exportHint}</p>
      {units.map((u) => {
        const link = state.icalUrls?.[u.id];
        return (
          <div key={u.id} className="stack" style={{ gap: 4 }}>
            <span className="small strong">{u.name}</span>
            {link ? (
              <div className="linkBox">
                <code>{link.replace(/^https?:\/\//, '')}</code>
                <button
                  type="button"
                  className="roundBtn lime small"
                  aria-label={t.promo.copy}
                  onClick={async () => notify((await copyText(link)) ? t.promo.copied : t.promo.copyFailed)}
                >
                  <Icon name="copy" size={18} />
                </button>
              </div>
            ) : (
              <span className="muted small">{t.settings.exportAfterServer}</span>
            )}
          </div>
        );
      })}
      <strong style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>{t.settings.importTitle}</strong>
      <p className="muted small">{t.settings.importHint}</p>
      {channels.map((c) => (
        <div key={c.id} className="row between small">
          <span>
            <strong>{units.find((u) => u.id === c.unitId)?.name}</strong> · {platformName(c.platform)} ·{' '}
            {c.lastSyncAt ? t.settings.lastSync(fmtInstant(c.lastSyncAt)) : t.settings.never}
          </span>
          <button type="button" className="roundBtn small" aria-label={t.common.delete} onClick={() => void actions.removeIcalChannel(c.id)}>
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
      {apiMode ? (
        <div className="stack">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              className="btn small outline"
              onClick={async () => {
                const r = await actions.syncIcal(c.id);
                setSyncMsg(r.ok ? t.settings.synced : t.common.serverDown);
              }}
            >
              {t.settings.syncNow} · {units.find((u) => u.id === c.unitId)?.name}
            </button>
          ))}
          {syncMsg && <p className="small">{syncMsg}</p>}
        </div>
      ) : (
        <p className="muted small">{t.settings.serverNote}</p>
      )}
    </>
  );
}

function Aynes({ property }: { property: Property }) {
  const { state, flush, syncing, online } = useStore();
  const actions = useActions();
  const { t, fmtInstant } = useT();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const aynes = aynesOf(state, property.id);
  const outbox = state.outbox;
  const waiting = outbox.filter((o) => o.status !== 'sent').length;

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (!/^fsk_[A-Za-z0-9_-]{8,}$/.test(k)) return setError(t.settings.badKey);
    const r = await actions.connectAynes(property.id, k, aynes.shareGuestName);
    if (!r.ok) return setError(t.common.serverDown);
    setKey('');
    setError(null);
  };

  return (
    <>
      <p className="small">{t.settings.aynesIntro}</p>
      <HelpLink article="aynes" />
      {aynes.connected ? (
        <>
          <div className="row between">
            <span className="strong small">{t.settings.connected(aynes.keyHint ?? '')}</span>
            <button
              type="button"
              className="btn small danger"
              onClick={() => void actions.disconnectAynes(property.id)}
            >
              {t.settings.disconnect}
            </button>
          </div>
          <p className="muted small">
            {t.settings.aynesMapping} <b>{property.slug}</b>
          </p>
        </>
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
          onChange={(e) => void actions.setShareGuestName(property.id, e.target.checked)}
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
        <button type="button" className="btn small lime" disabled={!aynes.connected || !online || syncing || (!apiMode && waiting === 0)} onClick={() => void (apiMode ? actions.flushOutbox(property.id) : flush())}>
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

function useLogout() {
  const { reset } = useStore();
  return async () => {
    await call('POST', 'api/auth/logout', {}, { auth: true }).catch(() => undefined);
    hostToken.set(null);
    reset();
    window.location.hash = '#/';
  };
}

/** Who is signed in, with a visible way out (demo or Telegram account). */
function AccountStrip() {
  const { state } = useStore();
  const { t } = useT();
  const logout = useLogout();
  return (
    <div className="accountStrip">
      <span>
        {t.settings.signedInShort} <b>{state.host?.name ?? ''}</b>
      </span>
      <button type="button" className="btn small outline" onClick={logout}>
        {t.settings.logout}
      </button>
    </div>
  );
}

function Account() {
  const { state } = useStore();
  const { t } = useT();
  const logout = useLogout();
  return (
    <>
      <p className="small">{t.settings.signedInAs(state.host?.name ?? '')}</p>
      <button type="button" className="btn small danger" onClick={logout}>
        {t.settings.logout}
      </button>
    </>
  );
}
