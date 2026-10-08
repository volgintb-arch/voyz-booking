import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Field, Screen } from '../../components/Layout';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { nightsBetween } from '../../domain/dates';
import { bookingMoney } from '../../domain/ledger';
import { formatMoney, parseMajor } from '../../domain/money';
import type { BookingStatus, PaymentKind, PaymentMethod } from '../../domain/types';
import { bookingPath } from '../../integrations/aynes';
import { aynesOf, useActions, type Result } from '../../data/actions';
import { NEXT_STATUSES } from '../../data/state';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { hostTabs } from './tabs';

const KINDS: PaymentKind[] = ['prepayment', 'payment', 'refund'];
const METHODS: PaymentMethod[] = ['cash', 'qr', 'card', 'transfer', 'ota'];
const DEPOSIT_METHODS: PaymentMethod[] = ['qr', 'transfer', 'card', 'cash'];

export function BookingDetailScreen() {
  const { id } = useParams();
  const { state } = useStore();
  const actions = useActions();
  const { t, lang, fmtRange, fmtInstant } = useT();
  const toast = useToast();
  const [showPay, setShowPay] = useState(false);
  const [kind, setKind] = useState<PaymentKind>('payment');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('qr');

  const booking = state.bookings.find((b) => b.id === id);
  const property = state.properties.find((p) => p.id === booking?.propertyId);
  if (!booking || !property) {
    return (
      <Screen title={t.detail.notFound} back="/host/bookings" tabs={hostTabs(t)}>
        <p className="muted">{t.detail.notFound}</p>
      </Screen>
    );
  }

  const unit = state.units.find((u) => u.id === booking.unitId);
  const category = state.categories.find((c) => c.id === booking.categoryId);
  const payments = state.payments.filter((p) => p.bookingId === booking.id);
  const money = bookingMoney(booking, state.payments);
  const fmt = (n: number) => formatMoney(n, booking.currency, lang);
  const report = (r: Result<unknown>, success: string) =>
    toast.show(r.ok ? success : r.code === 'offline' ? t.common.offline : r.code === 'conflict' ? t.detail.staleState : t.common.serverDown);

  const setStatus = async (status: BookingStatus) => {
    if (status === 'cancelled' && !window.confirm(t.detail.confirmCancel)) return;
    report(await actions.setStatus(booking.id, status), t.status[status]);
  };

  const openPay = () => {
    const suggested = money.paid < booking.prepaymentDue ? booking.prepaymentDue - money.paid : money.balance;
    setKind(money.paid < booking.prepaymentDue ? 'prepayment' : 'payment');
    setAmount(String(suggested / 100));
    setShowPay(true);
  };

  const submitPay = async (e: FormEvent) => {
    e.preventDefault();
    const minor = parseMajor(amount);
    if (!minor) return setPayError(t.detail.badAmount);
    const r = await actions.addPayment(booking.id, { kind, method, provider: provider.trim() || null, amount: minor });
    report(r, t.common.saved);
    if (r.ok) {
      setShowPay(false);
      setPayError(null);
    }
  };

  const dates = fmtRange(booking.checkIn, booking.checkOut);
  const text = t.detail.confirmText(booking.guestName, property.name[lang], dates, booking.id);
  const phoneDigits = booking.guestPhone.replace(/\D/g, '');
  const outboxItem = state.outbox.find((o) => o.path === bookingPath(booking.id) && o.status !== 'sent');
  const aynesLabel = !aynesOf(state, property.id).connected ? t.detail.aynesOff : outboxItem ? t.detail.aynesWaiting : t.detail.aynesSent;

  return (
    <Screen title={t.detail.title(booking.id)} back={`/host/bookings?p=${property.slug}`} tabs={hostTabs(t)}>
      <div className="card accent">
        <div className="row between">
          <h2 className="title-caps">{booking.guestName}</h2>
          <StatusBadge status={booking.status} />
        </div>
        <dl className="kv">
          <dt>{t.detail.unit}</dt>
          <dd>
            {unit?.name} · {category?.name[lang]}
          </dd>
          <dt>{t.detail.dates}</dt>
          <dd>
            {dates} · {t.common.nights(nightsBetween(booking.checkIn, booking.checkOut))}
          </dd>
          <dt>{t.detail.guest}</dt>
          <dd>
            {t.common.guests(booking.guests)}
            {booking.guestPhone && (
              <>
                {' · '}
                <a href={`tel:${booking.guestPhone}`}>{booking.guestPhone}</a>
              </>
            )}
          </dd>
          <dt>{t.detail.channel}</dt>
          <dd>
            {t.channel[booking.channel]}
            {booking.source && booking.source !== 'direct' ? ` · ${t.promo.viaLink(t.promo.source[booking.source])}` : ''}
          </dd>
          {booking.note && (
            <>
              <dt>{t.detail.note}</dt>
              <dd>{booking.note}</dd>
            </>
          )}
        </dl>
        <p className="muted small">
          {aynesLabel} · {t.detail.version(booking.version)}
        </p>
      </div>

      {booking.status === 'cancelled' && booking.cancelReason === 'hold_expired' && (
        <p className="banner">{t.deposit.expired}</p>
      )}

      {booking.status === 'pending' && money.paid < booking.prepaymentDue && (
        <div className={`card ${booking.guestReportedPaidAt ? 'accent' : ''}`}>
          <span className="section-title">{t.deposit.title}</span>
          <p className="price">{fmt(booking.prepaymentDue - money.paid)}</p>
          {booking.holdUntil && <p className="small">{t.deposit.until(fmtInstant(booking.holdUntil))}</p>}
          {booking.guestReportedPaidAt ? (
            <p className="banner info">{t.deposit.reported(fmtInstant(booking.guestReportedPaidAt))}</p>
          ) : (
            <p className="muted small">{t.deposit.waiting}</p>
          )}
          <div className="chips">
            {DEPOSIT_METHODS.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={depositMethod === m} onClick={() => setDepositMethod(m)}>
                {t.method[m]}
              </button>
            ))}
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn lime"
              onClick={async () => report(await actions.confirmDeposit(booking.id, depositMethod), t.deposit.received)}
            >
              {t.deposit.receivedBtn}
            </button>
            {booking.holdUntil && (
              <button type="button" className="btn outline" onClick={async () => report(await actions.extendHold(booking.id, 12), t.common.saved)}>
                {t.deposit.extend(12)}
              </button>
            )}
          </div>
        </div>
      )}

      {NEXT_STATUSES[booking.status].length > 0 && (
        <div className="actions">
          {NEXT_STATUSES[booking.status].map((s) => (
            <button key={s} type="button" className={`btn ${s === 'cancelled' || s === 'no_show' ? 'danger' : s === 'confirmed' ? 'lime' : ''}`} onClick={() => setStatus(s)}>
              {t.statusAction[s]}
            </button>
          ))}
        </div>
      )}

      <div className="panel">
        <span className="section-title" style={{ color: 'var(--lime)' }}>{t.detail.money}</span>
        <dl className="kv">
          <dt>{t.detail.total}</dt>
          <dd className="strong">{fmt(booking.total)}</dd>
          <dt>{t.detail.prepaymentDue}</dt>
          <dd>{fmt(booking.prepaymentDue)}</dd>
          <dt>{t.detail.paid}</dt>
          <dd>{fmt(money.paid)}</dd>
          {money.refunded > 0 && (
            <>
              <dt>{t.detail.refunded}</dt>
              <dd>{fmt(money.refunded)}</dd>
            </>
          )}
          <dt>{t.detail.balance}</dt>
          <dd>
            <span className="pricePill">{fmt(money.balance)}</span>
          </dd>
        </dl>
        <div className="divider" />
        <span className="section-title" style={{ color: 'var(--lime)' }}>{t.detail.payments}</span>
        {payments.length === 0 && <p className="muted small">{t.detail.noPayments}</p>}
        {payments.map((p) => (
          <div key={p.id} className="row between small">
            <span>
              {t.paymentKind[p.kind]} · {t.method[p.method]}
              {p.provider ? ` (${p.provider})` : ''} · {fmtInstant(p.paidAt)}
            </span>
            <span className="strong" style={{ color: p.kind === 'refund' ? '#ff8a7a' : 'var(--lime)' }}>
              {p.kind === 'refund' ? '−' : ''}
              {fmt(p.amount)}
            </span>
          </div>
        ))}
        {!showPay && (
          <button type="button" className="btn lime" onClick={openPay}>
            {t.detail.addPayment}
          </button>
        )}
        {showPay && (
          <form className="stack" onSubmit={submitPay}>
            <div className="chips">
              {KINDS.map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {t.paymentKind[k]}
                </button>
              ))}
            </div>
            <div className="chips">
              {METHODS.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={method === m} onClick={() => setMethod(m)}>
                  {t.method[m]}
                </button>
              ))}
            </div>
            <Field label={`${t.detail.amount}, ${booking.currency}`}>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </Field>
            {method !== 'cash' && (
              <Field label={t.detail.provider}>
                <input value={provider} onChange={(e) => setProvider(e.target.value)} />
              </Field>
            )}
            {payError && <p className="error">{payError}</p>}
            <div className="actions">
              <button type="submit" className="btn lime">
                {t.common.save}
              </button>
              <button type="button" className="btn white" onClick={() => setShowPay(false)}>
                {t.common.cancel}
              </button>
            </div>
          </form>
        )}
      </div>

      {booking.status !== 'cancelled' && phoneDigits.length >= 9 && (
        <div className="card">
          <span className="section-title">{t.detail.message}</span>
          <div className="actions">
            <a className="btn outline" href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            <a className="btn outline" href={`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              Telegram
            </a>
          </div>
        </div>
      )}
      {toast.node}
    </Screen>
  );
}
