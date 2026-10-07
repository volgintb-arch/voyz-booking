import { DateRange } from '../../components/DateRange';
import { Stepper } from '../../components/Stepper';
import { todayIn } from '../../domain/dates';
import { useT } from '../../i18n';
import type { StayParams } from './params';

export function StayPicker({ stay, onChange }: { stay: StayParams; onChange: (p: Partial<StayParams>) => void }) {
  const { t } = useT();
  return (
    <div className="stack">
      <DateRange
        checkIn={stay.checkIn}
        checkOut={stay.checkOut}
        min={todayIn('Asia/Bishkek')}
        onChange={onChange}
        labels={[t.search.checkIn, t.search.checkOut]}
      />
      <Stepper label={t.search.guests} value={stay.guests} min={1} max={10} onChange={(guests) => onChange({ guests })} />
    </div>
  );
}
