import { Icon } from './Icon';

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="pillField" role="group" aria-label={label}>
      <Icon name="people" />
      <span className="label">{label}</span>
      <div className="stepper">
        <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Icon name="minus" size={18} />
        </button>
        <output>{value}</output>
        <button type="button" className="plus" aria-label="+" disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}
