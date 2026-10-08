import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { rememberVisit } from '../../share/links';
import { addDays, isIsoDate, todayIn } from '../../domain/dates';

export interface StayParams {
  checkIn: string;
  checkOut: string;
  guests: number;
}

export function useStayParams(): [StayParams, (patch: Partial<StayParams>) => void, string] {
  const [params, setParams] = useSearchParams();
  useEffect(() => rememberVisit(params), [params]);
  const today = todayIn('Asia/Bishkek');
  const rawIn = params.get('in') ?? '';
  const rawOut = params.get('out') ?? '';
  const checkIn = isIsoDate(rawIn) ? rawIn : addDays(today, 1);
  const checkOut = isIsoDate(rawOut) ? rawOut : addDays(checkIn, 2);
  const guests = Math.min(12, Math.max(1, Number(params.get('g')) || 2));
  const stay = { checkIn, checkOut, guests };
  const set = (patch: Partial<StayParams>) => {
    const next = { ...stay, ...patch };
    if (patch.checkIn && next.checkOut <= next.checkIn) next.checkOut = addDays(next.checkIn, 1);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('in', next.checkIn);
        p.set('out', next.checkOut);
        p.set('g', String(next.guests));
        return p;
      },
      { replace: true },
    );
  };
  const query = `in=${checkIn}&out=${checkOut}&g=${guests}`;
  return [stay, set, query];
}
