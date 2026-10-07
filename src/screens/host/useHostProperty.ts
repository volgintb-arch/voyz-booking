import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../data/store';
import type { Property } from '../../domain/types';

/** Host's properties and the one currently selected (?p=slug), remembered in the URL. */
export function useHostProperty(): { properties: Property[]; property: Property | undefined; select: (slug: string) => void } {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const properties = state.properties.filter((p) => p.ownerId === state.hostId);
  const slug = params.get('p');
  const property = properties.find((p) => p.slug === slug) ?? properties[0];
  const select = (s: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('p', s);
        return next;
      },
      { replace: true },
    );
  return { properties, property, select };
}
