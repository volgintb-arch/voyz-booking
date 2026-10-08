import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { guestTrips } from '../../api/client';

/** Link from the bot: puts the booking (id + its token) on this phone and shows "My bookings". */
export function OpenTripScreen() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const token = params.get('t');
    if (id && token) guestTrips.add({ id, token });
    navigate('/guest/trips', { replace: true });
  }, [id, params, navigate]);
  return null;
}
