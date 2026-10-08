import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StoreProvider } from './data/store';
import { BookScreen } from './screens/guest/BookScreen';
import { DoneScreen } from './screens/guest/DoneScreen';
import { OpenTripScreen } from './screens/guest/OpenTripScreen';
import { PayScreen } from './screens/guest/PayScreen';
import { PropertyScreen } from './screens/guest/PropertyScreen';
import { SearchScreen } from './screens/guest/SearchScreen';
import { TripsScreen } from './screens/guest/TripsScreen';
import { BoardScreen } from './screens/host/BoardScreen';
import { BookingDetailScreen } from './screens/host/BookingDetailScreen';
import { BookingsScreen } from './screens/host/BookingsScreen';
import { NewBookingScreen } from './screens/host/NewBookingScreen';
import { PosterScreen } from './screens/host/PosterScreen';
import { PromoScreen } from './screens/host/PromoScreen';
import { SettingsScreen } from './screens/host/SettingsScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { GuestGate, HostGate } from './screens/gates';
import { NewPropertyScreen } from './screens/host/NewPropertyScreen';
import { OtaBookingScreen } from './screens/host/OtaBookingScreen';
import { ArticleScreen, HelpScreen } from './screens/host/HelpScreen';
import { EditPropertyScreen } from './screens/host/EditPropertyScreen';

// Hash routing: works the same on GitHub Pages, in the iOS/Android shell
// (file-like origin) and inside a Telegram Mini App.
export function App() {
  return (
    <ErrorBoundary>
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<WelcomeScreen />} />
          <Route element={<GuestGate />}>
            <Route path="/guest" element={<SearchScreen />} />
            <Route path="/guest/p/:slug" element={<PropertyScreen />} />
            <Route path="/guest/p/:slug/book/:categoryId" element={<BookScreen />} />
            <Route path="/guest/pay/:id" element={<PayScreen />} />
            <Route path="/guest/done/:id" element={<DoneScreen />} />
            <Route path="/guest/trips" element={<TripsScreen />} />
            <Route path="/guest/open/:id" element={<OpenTripScreen />} />
          </Route>
          <Route element={<HostGate />}>
            <Route path="/host" element={<BoardScreen />} />
            <Route path="/host/bookings" element={<BookingsScreen />} />
            <Route path="/host/b/:id" element={<BookingDetailScreen />} />
            <Route path="/host/ota/:id" element={<OtaBookingScreen />} />
            <Route path="/host/help" element={<HelpScreen />} />
            <Route path="/host/help/:id" element={<ArticleScreen />} />
            <Route path="/host/new" element={<NewBookingScreen />} />
            <Route path="/host/settings" element={<SettingsScreen />} />
            <Route path="/host/promo" element={<PromoScreen />} />
            <Route path="/host/poster" element={<PosterScreen />} />
            <Route path="/host/new-property" element={<NewPropertyScreen />} />
            <Route path="/host/property" element={<EditPropertyScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </StoreProvider>
    </ErrorBoundary>
  );
}
