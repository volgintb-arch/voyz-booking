import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Field, Screen, SectionHead } from '../../components/Layout';
import { Stepper } from '../../components/Stepper';
import { parseMajor } from '../../domain/money';
import type { PropertyKind } from '../../domain/types';
import { useActions } from '../../data/actions';
import { useT } from '../../i18n';
import { hostTabs } from './tabs';

const KINDS: PropertyKind[] = ['yurt_camp', 'guest_house', 'glamping', 'resort'];

interface CategoryDraft {
  name: string;
  capacity: number;
  price: string;
  count: number;
  unitPrefix: string;
}

/** "Объект за 10 минут" (TZ §4, host 1): kind, name, room types and how many of each. */
export function NewPropertyScreen() {
  const { t } = useT();
  const actions = useActions();
  const navigate = useNavigate();
  const [kind, setKind] = useState<PropertyKind>('yurt_camp');
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [checkInTime, setCheckIn] = useState('14:00');
  const [checkOutTime, setCheckOut] = useState('11:00');
  const defaultUnit = (k: PropertyKind) => (k === 'guest_house' || k === 'resort' ? t.onboarding.roomPrefix : k === 'glamping' ? t.onboarding.domePrefix : t.onboarding.yurtPrefix);
  const [cats, setCats] = useState<CategoryDraft[]>([{ name: '', capacity: 4, price: '', count: 4, unitPrefix: t.onboarding.yurtPrefix }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (i: number, p: Partial<CategoryDraft>) => setCats((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError(t.onboarding.nameRequired);
    if (region.trim().length < 2) return setError(t.onboarding.regionRequired);
    let n = 0;
    const categories = [];
    for (const c of cats) {
      const price = parseMajor(c.price);
      if (!c.name.trim() || price === null) return setError(t.onboarding.categoryRequired);
      categories.push({
        name: c.name.trim(),
        capacity: c.capacity,
        baseOccupancy: Math.min(2, c.capacity),
        basePrice: price,
        extraGuestPrice: 0,
        units: Array.from({ length: c.count }, () => `${c.unitPrefix.trim() || defaultUnit(kind)} ${++n}`),
      });
    }
    setBusy(true);
    const r = await actions.createProperty({ kind, name: name.trim(), region: region.trim(), description: description.trim(), checkInTime, checkOutTime, categories });
    setBusy(false);
    if (!r.ok) return setError(r.code === 'offline' ? t.common.offline : t.common.serverDown);
    navigate('/host/property', { replace: true });
  };

  return (
    <Screen title={t.onboarding.title} back="/host" tabs={hostTabs(t)}>
      <p className="small">{t.onboarding.intro}</p>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="chips">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setCats((cs) => cs.map((c) => ({ ...c, unitPrefix: defaultUnit(k) })));
              }}
            >
              {t.kind[k]}
            </button>
          ))}
        </div>
        <Field label={t.onboarding.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t.onboarding.namePlaceholder} />
        </Field>
        <Field label={t.onboarding.region}>
          <input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={80} placeholder={t.onboarding.regionPlaceholder} />
        </Field>
        <Field label={t.onboarding.description}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <div className="grid2">
          <Field label={t.property.checkIn}>
            <input type="time" value={checkInTime} onChange={(e) => setCheckIn(e.target.value)} />
          </Field>
          <Field label={t.property.checkOut}>
            <input type="time" value={checkOutTime} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
        </div>

        <SectionHead>{t.onboarding.categories}</SectionHead>
        {cats.map((c, i) => (
          <div key={i} className="card accent">
            <Field label={t.onboarding.categoryName}>
              <input value={c.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder={t.onboarding.categoryPlaceholder} />
            </Field>
            <div className="grid2">
              <Field label={`${t.settings.basePrice}, KGS`}>
                <input value={c.price} onChange={(e) => patch(i, { price: e.target.value })} inputMode="decimal" placeholder="3500" />
              </Field>
              <Field label={t.onboarding.unitPrefix}>
                <input value={c.unitPrefix} onChange={(e) => patch(i, { unitPrefix: e.target.value })} />
              </Field>
            </div>
            <Stepper label={t.onboarding.count} value={c.count} min={1} max={50} onChange={(v) => patch(i, { count: v })} />
            <Stepper label={t.settings.capacity} value={c.capacity} min={1} max={20} onChange={(v) => patch(i, { capacity: v })} />
            {cats.length > 1 && (
              <button type="button" className="btn small danger" onClick={() => setCats((cs) => cs.filter((_, j) => j !== i))}>
                {t.common.delete}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn outline"
          onClick={() => setCats((cs) => [...cs, { name: '', capacity: 2, price: '', count: 1, unitPrefix: defaultUnit(kind) }])}
        >
          <Icon name="plus" /> {t.onboarding.addCategory}
        </button>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn block lime" disabled={busy}>
          {t.onboarding.create}
        </button>
        <p className="muted small">{t.onboarding.after}</p>
      </form>
    </Screen>
  );
}
