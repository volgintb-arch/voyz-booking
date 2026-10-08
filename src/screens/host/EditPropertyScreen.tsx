import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { AccRow, Field, Screen } from '../../components/Layout';
import { Stepper } from '../../components/Stepper';
import { useToast } from '../../components/Toast';
import { parseMajor } from '../../domain/money';
import type { AmenityCode, Category, Property, PropertyKind, Unit } from '../../domain/types';
import { useActions, type Result } from '../../data/actions';
import { useStore } from '../../data/store';
import { useT } from '../../i18n';
import { PropertySwitch } from './PropertySwitch';
import { hostTabs } from './tabs';
import { useHostProperty } from './useHostProperty';

const KINDS: PropertyKind[] = ['yurt_camp', 'guest_house', 'glamping', 'resort'];
const AMENITIES: AmenityCode[] = ['breakfast', 'shower', 'heating', 'wifi', 'parking', 'horse', 'sauna', 'beach'];

/** Everything about the property itself: info, amenities, room types and units. */
export function EditPropertyScreen() {
  const { t } = useT();
  const toast = useToast();
  const { properties, property, select } = useHostProperty();
  const report = (r: Result<unknown>) =>
    toast.show(r.ok ? t.common.saved : r.code === 'conflict' ? t.edit.hasBookings : r.code === 'offline' ? t.common.offline : t.common.serverDown);

  if (!property) {
    return (
      <Screen title={t.edit.title} back="/host/settings" tabs={hostTabs(t)}>
        <Link className="btn lime" to="/host/new-property">
          <Icon name="plus" /> {t.onboarding.addProperty}
        </Link>
      </Screen>
    );
  }

  return (
    <Screen title={t.edit.title} back={`/host/settings?p=${property.slug}`} tabs={hostTabs(t)}>
      <PropertySwitch properties={properties} value={property} onChange={select} />
      <div>
        <AccRow icon="list" title={t.edit.info} open>
          <InfoForm key={property.id} property={property} onDone={report} />
        </AccRow>
        <AccRow icon="sparkle" title={t.property.amenities}>
          <Amenities key={property.id} property={property} onDone={report} />
        </AccRow>
        <AccRow icon="grid" title={t.property.rooms} open>
          <Rooms key={property.id} property={property} onDone={report} />
        </AccRow>
      </div>
      <Link to="/host/new-property" className="btn outline">
        <Icon name="plus" /> {t.onboarding.addProperty}
      </Link>
      {toast.node}
    </Screen>
  );
}

function InfoForm({ property, onDone }: { property: Property; onDone: (r: Result) => void }) {
  const { t, lang } = useT();
  const actions = useActions();
  const [kind, setKind] = useState(property.kind);
  const [name, setName] = useState(property.name[lang]);
  const [region, setRegion] = useState(property.region[lang]);
  const [description, setDescription] = useState(property.description[lang]);
  const [checkIn, setCheckIn] = useState(property.checkInTime);
  const [checkOut, setCheckOut] = useState(property.checkOutTime);
  const [lat, setLat] = useState(property.lat ? String(property.lat) : '');
  const [lng, setLng] = useState(property.lng ? String(property.lng) : '');

  // The host writes in one language; the other two keep their text unless it was the same.
  const localized = (old: Property['name'], value: string) => {
    const v = value.trim();
    return { ru: lang === 'ru' || old.ru === old[lang] ? v : old.ru, ky: lang === 'ky' || old.ky === old[lang] ? v : old.ky, en: lang === 'en' || old.en === old[lang] ? v : old.en };
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || region.trim().length < 2) return onDone({ ok: false, code: 'bad_request' });
    const la = Number(lat.replace(',', '.'));
    const ln = Number(lng.replace(',', '.'));
    onDone(
      await actions.updateProperty(property.id, {
        kind,
        name: localized(property.name, name),
        region: localized(property.region, region),
        description: localized(property.description, description),
        checkInTime: checkIn,
        checkOutTime: checkOut,
        ...(lat && lng && Number.isFinite(la) && Number.isFinite(ln) ? { lat: la, lng: ln } : {}),
      }),
    );
  };

  return (
    <form className="stack" onSubmit={save}>
      <div className="chips">
        {KINDS.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t.kind[k]}
          </button>
        ))}
      </div>
      <Field label={t.onboarding.name}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label={t.onboarding.region}>
        <input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={80} />
      </Field>
      <Field label={t.onboarding.description}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </Field>
      <div className="grid2">
        <Field label={t.property.checkIn}>
          <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label={t.property.checkOut}>
          <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <div className="grid2">
        <Field label={t.edit.lat}>
          <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="41.85" />
        </Field>
        <Field label={t.edit.lng}>
          <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="75.12" />
        </Field>
      </div>
      <p className="muted small">{t.edit.coordsHint}</p>
      <p className="muted small">{t.edit.langHint}</p>
      <button type="submit" className="btn small lime">
        {t.common.save}
      </button>
    </form>
  );
}

function Amenities({ property, onDone }: { property: Property; onDone: (r: Result) => void }) {
  const { t } = useT();
  const actions = useActions();
  const toggle = async (a: AmenityCode) => {
    const next = property.amenities.includes(a) ? property.amenities.filter((x) => x !== a) : [...property.amenities, a];
    onDone(await actions.updateProperty(property.id, { amenities: next }));
  };
  return (
    <div className="chips" style={{ flexWrap: 'wrap' }}>
      {AMENITIES.map((a) => (
        <button key={a} type="button" className="chip" aria-pressed={property.amenities.includes(a)} onClick={() => toggle(a)}>
          {t.amenity[a]}
        </button>
      ))}
    </div>
  );
}

function Rooms({ property, onDone }: { property: Property; onDone: (r: Result) => void }) {
  const { state } = useStore();
  const { t } = useT();
  const actions = useActions();
  const categories = state.categories.filter((c) => c.propertyId === property.id);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState(2);
  const [count, setCount] = useState(1);

  const addCategory = async (e: FormEvent) => {
    e.preventDefault();
    const p = parseMajor(price);
    if (!name.trim() || p === null) return onDone({ ok: false, code: 'bad_request' });
    const r = await actions.addCategory(property.id, {
      name: name.trim(),
      capacity,
      baseOccupancy: Math.min(2, capacity),
      basePrice: p,
      extraGuestPrice: 0,
      minNights: 1,
      units: Array.from({ length: count }, (_, i) => `${name.trim()} ${i + 1}`),
    });
    onDone(r);
    if (r.ok) {
      setName('');
      setPrice('');
    }
  };

  return (
    <>
      <p className="muted small">{t.edit.pricesHint}</p>
      {categories.map((c) => (
        <CategoryCard key={c.id} category={c} units={state.units.filter((u) => u.categoryId === c.id)} onDone={onDone} />
      ))}
      <form className="card" onSubmit={addCategory}>
        <strong>{t.onboarding.addCategory}</strong>
        <div className="grid2">
          <Field label={t.onboarding.categoryName}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.onboarding.categoryPlaceholder} />
          </Field>
          <Field label={`${t.settings.basePrice}, ${property.currency}`}>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <Stepper label={t.settings.capacity} value={capacity} min={1} max={20} onChange={setCapacity} />
        <Stepper label={t.onboarding.count} value={count} min={1} max={50} onChange={setCount} />
        <button type="submit" className="btn small lime">
          <Icon name="plus" size={18} /> {t.common.add}
        </button>
      </form>
    </>
  );
}

function CategoryCard({ category, units, onDone }: { category: Category; units: Unit[]; onDone: (r: Result) => void }) {
  const { t, lang } = useT();
  const actions = useActions();
  const [name, setName] = useState(category.name[lang]);
  const [capacity, setCapacity] = useState(category.capacity);
  const [base, setBase] = useState(category.baseOccupancy);
  const [newUnit, setNewUnit] = useState('');

  const save = async () =>
    onDone(
      await actions.updateCategory(category.id, {
        name: name.trim() || category.name[lang],
        capacity,
        baseOccupancy: Math.min(base, capacity),
        basePrice: category.basePrice,
        extraGuestPrice: category.extraGuestPrice,
        minNights: category.minNights,
      }),
    );

  // Continue the existing numbering: "Юрта 5" → "Юрта 6".
  const last = units.at(-1)?.name ?? name.trim();
  const m = /^(.*?)(\d+)\s*$/.exec(last);
  const suggested = m ? `${m[1]}${Number(m[2]) + 1}` : `${last} ${units.length + 1}`;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = newUnit.trim() || suggested;
    const r = await actions.addUnit(category.id, n);
    onDone(r);
    if (r.ok) setNewUnit('');
  };

  return (
    <div className="card accent">
      <Field label={t.onboarding.categoryName}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <Stepper label={t.settings.capacity} value={capacity} min={1} max={20} onChange={setCapacity} />
      <Stepper label={t.edit.baseOccupancy} value={Math.min(base, capacity)} min={1} max={capacity} onChange={setBase} />
      <button type="button" className="btn small lime" onClick={save}>
        {t.common.save}
      </button>

      <span className="section-title">{t.edit.units(units.length)}</span>
      {units.map((u) => (
        <UnitRow key={u.id} unit={u} onDone={onDone} />
      ))}
      <form className="row" onSubmit={add}>
        <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder={suggested} maxLength={40} />
        <button type="submit" className="roundBtn lime" aria-label={t.common.add}>
          <Icon name="plus" />
        </button>
      </form>
      <button
        type="button"
        className="btn small danger"
        onClick={async () => window.confirm(t.edit.confirmDeleteCategory) && onDone(await actions.removeCategory(category.id))}
      >
        {t.edit.deleteCategory}
      </button>
    </div>
  );
}

function UnitRow({ unit, onDone }: { unit: Unit; onDone: (r: Result) => void }) {
  const { t } = useT();
  const actions = useActions();
  const [name, setName] = useState(unit.name);
  return (
    <div className="row">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          if (name.trim() && name.trim() !== unit.name) onDone(await actions.renameUnit(unit.id, name.trim()));
        }}
        maxLength={40}
        aria-label={t.create.unit}
      />
      <button
        type="button"
        className="roundBtn small"
        aria-label={t.common.delete}
        onClick={async () => window.confirm(t.edit.confirmDeleteUnit(unit.name)) && onDone(await actions.removeUnit(unit.id))}
      >
        ×
      </button>
    </div>
  );
}
