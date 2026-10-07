import { useT } from '../../i18n';
import type { Property } from '../../domain/types';

export function PropertySwitch({ properties, value, onChange }: { properties: Property[]; value: Property; onChange: (slug: string) => void }) {
  const { lang } = useT();
  if (properties.length < 2) return <h2>{value.name[lang]}</h2>;
  return (
    <div className="chips">
      {properties.map((p) => (
        <button key={p.id} type="button" className="chip" aria-pressed={p.id === value.id} onClick={() => onChange(p.slug)}>
          {p.name[lang]}
        </button>
      ))}
    </div>
  );
}
