import { useRef } from 'react';
import { addDays } from '../domain/dates';
import { useT } from '../i18n';
import { Icon } from './Icon';

interface Props {
  checkIn: string;
  checkOut: string;
  min?: string;
  onChange: (p: { checkIn?: string; checkOut?: string }) => void;
  labels: [string, string];
}

/** One date shown as text; a transparent native input on top opens the system picker. */
function DateSlot({ value, min, label, onPick }: { value: string; min?: string; label: string; onPick: (v: string) => void }) {
  const { fmtDate } = useT();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="dateSlot">
      <span>{fmtDate(value, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
      <input
        ref={ref}
        type="date"
        aria-label={label}
        min={min}
        value={value}
        onClick={() => {
          try {
            ref.current?.showPicker();
          } catch {
            // older WebViews open the picker on tap by themselves
          }
        }}
        onChange={(e) => e.target.value && onPick(e.target.value)}
      />
    </label>
  );
}

/** Voyz date pill: calendar icon, two dates, lime chevron. */
export function DateRange({ checkIn, checkOut, min, onChange, labels }: Props) {
  return (
    <div className="pillField">
      <Icon name="calendar" />
      <DateSlot value={checkIn} min={min} label={labels[0]} onPick={(v) => onChange({ checkIn: v })} />
      <span className="sep">—</span>
      <DateSlot value={checkOut} min={addDays(checkIn, 1)} label={labels[1]} onPick={(v) => onChange({ checkOut: v })} />
      <span className="roundBtn lime small" aria-hidden>
        <Icon name="chevron" size={18} />
      </span>
    </div>
  );
}
