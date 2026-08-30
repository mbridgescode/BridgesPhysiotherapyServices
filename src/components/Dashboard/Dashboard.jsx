import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Sidebar, { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH } from '../Sidebar';
import { Button } from '../../ui';
import Home from './Home';
import Settings from './Settings';
import Reports from './Reports';
import ProfitLoss from './ProfitLoss';
import Appointments from './Appointments';
import Patients from './Patients';
import PatientDetails from './PatientDetails';
import Invoices from './Invoices';
import Payments from './Payments';
import AuditLog from './AuditLog';
import Admin from './Admin';
import Communications from './Communications';
import apiClient from '../../utils/apiClient';
import { emitAuthTokenChanged } from '../../utils/authEvents';

const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1200);
  const navigate = useNavigate();

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 1200);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileDrawerOpen(false);
  }, [isMobile]);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const userResponse = await apiClient.get('/api/users/me');
        if (active) setUserData(userResponse.data.user);
      } catch (error) {
        console.error('Error fetching user data:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        emitAuthTokenChanged();
        navigate('/login');
      }
    };
    fetchData();
    return () => { active = false; };
  }, [navigate]);

  if (!userData) {
    return <div className="app-loading" aria-label="Loading dashboard"><div className="app-spinner" /></div>;
  }

  const drawerWidth = isMobile ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH);
  const greeting = userData?.name || userData?.username ? `Hi, ${userData.name || userData.username}` : 'Dashboard';

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
              <Button className="app-mobile-menu" variant="ghost" size="sm" type="button" aria-label="Open navigation" onClick={() => setMobileDrawerOpen(true)}>
                <Menu size={18} />
              </Button>
              <strong>{greeting}</strong>
              <span aria-hidden="true" style={{ width: 40 }} />
            </header>
          )}
          <Routes>
            <Route index element={<Home userData={userData} />} />
            <Route path="appointments" element={<Appointments userData={userData} />} />
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
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
