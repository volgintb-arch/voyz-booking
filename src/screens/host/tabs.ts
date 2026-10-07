import type { Tab } from '../../components/Layout';
import type { Dict } from '../../i18n/ru';

export const hostTabs = (t: Dict): Tab[] => [
  { to: '/host', icon: 'grid', label: t.host.tabBoard, end: true },
  { to: '/host/bookings', icon: 'list', label: t.host.tabBookings },
  { to: '/host/new', icon: 'plus', label: t.host.tabNew },
  { to: '/host/settings', icon: 'sliders', label: t.host.tabSettings },
  { to: '/', icon: 'user', label: t.welcome.switchRole, end: true },
];
