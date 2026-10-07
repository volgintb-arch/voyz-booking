import { Field } from '../../components/Layout';
import { todayIn, addDays } from '../../domain/dates';
import { useT } from '../../i18n';
import type { StayParams } from './params';

export function StayPicker({ stay, onChange }: { stay: StayParams; onChange: (p: Partial<StayParams>) => void }) {
  const { t } = useT();
  const today = todayIn('Asia/Bishkek');
  return (
    <div className="card">
      <div className="grid2">
        <Field label={t.search.checkIn}>
          <input type="date" min={today} value={stay.checkIn} onChange={(e) => e.target.value && onChange({ checkIn: e.target.value })} />
        </Field>
        <Field label={t.search.checkOut}>
          <input
            type="date"
            min={addDays(stay.checkIn, 1)}
            value={stay.checkOut}
            onChange={(e) => e.target.value && onChange({ checkOut: e.target.value })}
          />
        </Field>
      </div>
      <Field label={t.search.guests}>
        <select value={stay.guests} onChange={(e) => onChange({ guests: Number(e.target.value) })}>
          {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {t.common.guests(n)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
