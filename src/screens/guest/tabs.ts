import type { Tab } from '../../components/Layout';
import type { Dict } from '../../i18n/ru';

export const guestTabs = (t: Dict): Tab[] => [
  { to: '/guest', icon: 'search', label: t.search.tabSearch, end: true },
  { to: '/guest/trips', icon: 'list', label: t.search.tabTrips },
  { to: '/', icon: 'user', label: t.welcome.switchRole, end: true },
];
