import type { BookingStatus } from '../domain/types';
import { useT } from '../i18n';

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useT();
  return <span className={`badge ${status}`}>{t.status[status]}</span>;
}
