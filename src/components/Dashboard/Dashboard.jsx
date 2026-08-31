import React, { lazy, Suspense, useContext, useEffect, useState } from 'react';
import { CalendarDays, Home as HomeIcon, Menu, MoreHorizontal, Users } from 'lucide-react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from '../Sidebar';
import { Button } from '../../ui';
import { AppointmentsProvider } from '../../context/AppointmentsContext';
import { UserContext } from '../../context/UserContext';
import { emitAuthTokenChanged } from '../../utils/authEvents';
import bpsLogo from '../../logo/BPS Logo.png';
import WorkspaceNavigation from './WorkspaceNavigation';
import { getNavigationItemForPath } from './navigation';

const Home = lazy(() => import('./Home'));
const Schedule = lazy(() => import('./Schedule'));
const Settings = lazy(() => import('./Settings'));
const Reports = lazy(() => import('./Reports'));
const ProfitLoss = lazy(() => import('./ProfitLoss'));
const Patients = lazy(() => import('./Patients'));
const PatientDetails = lazy(() => import('./PatientDetails'));
const Invoices = lazy(() => import('./Invoices'));
const Payments = lazy(() => import('./Payments'));
const AuditLog = lazy(() => import('./AuditLog'));
const Admin = lazy(() => import('./Admin'));
const Communications = lazy(() => import('./Communications'));

const DashboardRouteLoading = () => (
  <div className="app-loading app-loading--content" aria-label="Loading workspace">
    <div className="app-spinner" />
  </div>
);

const Dashboard = () => {
  const { userData, loading: userLoading, error: userError } = useContext(UserContext);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1200);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 1200);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileDrawerOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!userLoading && userError) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      emitAuthTokenChanged();
      navigate('/login');
    }
  }, [navigate, userError, userLoading]);

  if (userLoading || !userData) {
    return <div className="app-loading" aria-label="Loading dashboard"><div className="app-spinner" /></div>;
  }

  const drawerWidth = isMobile ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH);
  const greeting = userData?.name || userData?.username ? `Hi, ${userData.name || userData.username}` : 'Dashboard';
  const activeNavigationItem = getNavigationItemForPath(location.pathname, userData?.role);
  const appointmentsEnabled = location.pathname === '/dashboard/appointments';
  const isBottomActive = (path) => path === '/dashboard'
    ? location.pathname === '/dashboard'
    : location.pathname.startsWith(path);

  return (
    <div className="app-layout" style={{ '--sidebar-width': `${drawerWidth}px` }}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((previous) => !previous)}
        variant={isMobile ? 'temporary' : 'permanent'}
        mobileOpen={mobileDrawerOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
      />
      <main className={`app-main ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="app-content">
          {isMobile && (
            <header className="app-mobile-header">
              <div className="app-mobile-header__brand">
                <img src={bpsLogo} alt="" className="app-mobile-header__logo" />
                <div>
                  <strong>BRIDGES</strong>
                  <span>Clinic workspace</span>
                </div>
              </div>
              <div className="app-mobile-header__context">
                <span>{activeNavigationItem?.label || 'Clinic workspace'}</span>
                <strong>{greeting}</strong>
              </div>
              <Button className="app-mobile-menu" variant="ghost" size="sm" type="button" aria-label="Open navigation" onClick={() => setMobileDrawerOpen(true)}>
                <Menu size={18} />
              </Button>
            </header>
          )}
          <WorkspaceNavigation userData={userData} />
          <AppointmentsProvider
            enabled={appointmentsEnabled}
            deferInitialLoad={location.pathname === '/dashboard/appointments'}
          >
            <Suspense fallback={<DashboardRouteLoading />}>
              <Routes>
                <Route index element={<Home userData={userData} />} />
                <Route path="appointments" element={<Schedule userData={userData} />} />
                <Route path="patients" element={<Patients userData={userData} />} />
                <Route path="patients/:id" element={<PatientDetails />} />
                <Route path="invoices" element={<Invoices userData={userData} />} />
                <Route path="payments" element={<Payments userData={userData} />} />
                <Route path="reports" element={<Reports />} />
                <Route path="profit-loss" element={<ProfitLoss />} />
                <Route path="settings" element={<Settings />} />
                <Route path="communications" element={<Communications />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="admin" element={<Admin />} />
                <Route path="billing" element={<Navigate to="/dashboard/invoices" replace />} />
                <Route path="insights" element={<Navigate to="/dashboard/reports" replace />} />
                <Route
                  path="administration"
                  element={<Navigate to={userData.role === 'admin' ? '/dashboard/admin' : '/dashboard/settings'} replace />}
                />
                <Route path="*" element={<Navigate to="." replace />} />
              </Routes>
            </Suspense>
          </AppointmentsProvider>
          {isMobile && (
            <nav className="app-mobile-bottom-nav" aria-label="Quick navigation">
              <button className={`app-mobile-bottom-nav__item ${isBottomActive('/dashboard') ? 'is-active' : ''}`} type="button" onClick={() => navigate('/dashboard')}>
                <HomeIcon size={18} strokeWidth={1.8} />
                <span>Today</span>
              </button>
              <button className={`app-mobile-bottom-nav__item ${isBottomActive('/dashboard/appointments') ? 'is-active' : ''}`} type="button" onClick={() => navigate('/dashboard/appointments')}>
                <CalendarDays size={18} strokeWidth={1.8} />
                <span>Schedule</span>
              </button>
              <button className={`app-mobile-bottom-nav__item ${isBottomActive('/dashboard/patients') ? 'is-active' : ''}`} type="button" onClick={() => navigate('/dashboard/patients')}>
                <Users size={18} strokeWidth={1.8} />
                <span>Patients</span>
              </button>
              <button className="app-mobile-bottom-nav__item" type="button" onClick={() => setMobileDrawerOpen(true)}>
                <MoreHorizontal size={18} strokeWidth={1.8} />
                <span>More</span>
              </button>
            </nav>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
