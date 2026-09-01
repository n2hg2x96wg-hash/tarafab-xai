import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { DemoBanner } from './DemoBanner';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <DemoBanner />
        <Topbar />
        <main className="animate-fade-in flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
        <Footer />
        <MobileBottomNav />
      </div>
    </div>
  );
}
