import type { Tab } from '../../components/Layout';
import type { Dict } from '../../i18n/ru';

export const hostTabs = (t: Dict): Tab[] => [
  { to: '/host', icon: 'grid', label: t.host.tabBoard, end: true, also: ['/host/promo', '/host/poster', '/host/ota/'] },
  { to: '/host/bookings', icon: 'list', label: t.host.tabBookings, also: ['/host/b/'] },
  { to: '/host/new', icon: 'plus', label: t.host.tabNew, end: true },
  { to: '/host/settings', icon: 'sliders', label: t.host.tabSettings, also: ['/host/property', '/host/new-property'] },
  { to: '/', icon: 'user', label: t.welcome.switchRole, short: t.welcome.roleShort, end: true },
];
