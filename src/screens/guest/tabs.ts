import type { Tab } from '../../components/Layout';
import type { Dict } from '../../i18n/ru';

export const guestTabs = (t: Dict): Tab[] => [
  { to: '/guest', icon: 'search', label: t.search.tabSearch, end: true, also: ['/guest/p/'] },
  { to: '/guest/trips', icon: 'list', label: t.search.tabTrips, also: ['/guest/pay/', '/guest/done/', '/guest/open/'] },
  { to: '/', icon: 'user', label: t.welcome.switchRole, short: t.welcome.roleShort, end: true },
];
