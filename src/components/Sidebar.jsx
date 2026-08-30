import React, { useContext, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserContext } from '../context/UserContext';
import apiClient from '../utils/apiClient';
import { emitAuthTokenChanged } from '../utils/authEvents';
import bpsLogo from '../logo/BPS Logo.png';
import {
  getNavigationSections,
  isNavigationItemActive,
  resolveNavigationPath,
} from './Dashboard/navigation';

export const SIDEBAR_WIDTH = 232;
export const SIDEBAR_COLLAPSED_WIDTH = 76;

const Sidebar = ({
  collapsed = false,
  onToggleCollapse = () => {},
  variant = 'permanent',
  mobileOpen = false,
  onMobileClose = () => {},
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userData } = useContext(UserContext);
  const [loggingOut, setLoggingOut] = useState(false);
  const isTemporary = variant === 'temporary';
  const isCollapsed = isTemporary ? false : collapsed;
  const role = userData?.role;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Failed to logout', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      emitAuthTokenChanged();
      navigate('/login');
      setLoggingOut(false);
    }
  };

  const goTo = (path) => {
    navigate(path);
    if (isTemporary) onMobileClose();
  };

  const navigationSections = getNavigationSections(role);

  return (
    <>
      {isTemporary && mobileOpen && <button className="app-sidebar__scrim" type="button" aria-label="Close navigation" onClick={onMobileClose} />}
      <aside className={`app-sidebar ${isCollapsed ? 'is-collapsed' : ''} ${isTemporary ? `is-temporary ${mobileOpen ? 'is-open' : ''}` : ''}`} aria-label="Primary navigation">
        <div className="app-sidebar__brand">
          <img className="app-sidebar__logo" src={bpsLogo} alt="Bridges Physiotherapy Services" />
          {!isCollapsed && (
            <div className="app-sidebar__wordmark">
              <div>BRIDGES</div>
              <small>Physiotherapy Services</small>
            </div>
          )}
          {isTemporary ? (
            <button className="app-icon-button app-sidebar__toggle" type="button" aria-label="Close navigation" onClick={onMobileClose}><X size={17} /></button>
          ) : (
            <button className="app-icon-button app-sidebar__toggle" type="button" aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggleCollapse}>
              {isCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            </button>
          )}
        </div>
        <nav className="app-sidebar__nav">
          {navigationSections.map((section) => (
            <div className="app-sidebar__section" key={section.id}>
              {!isCollapsed && <div className="app-sidebar__section-label">{section.label}</div>}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = isNavigationItemActive(item, location.pathname);
                const slug = item.id || item.label.toLowerCase().replace(/\s+/g, '-');
                return (
                  <button
                    className={`app-sidebar__item ${isActive ? 'is-active' : ''} ${isCollapsed ? 'is-collapsed' : ''}`}
                    key={item.id}
                    type="button"
                    onClick={() => goTo(resolveNavigationPath(item, role))}
                    data-testid={`sidebar-nav-${item.legacyTestId || slug}`}
                    aria-label={item.label}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                    {!isCollapsed && <span className="app-sidebar__item-label">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="app-sidebar__divider" />
          <button className={`app-sidebar__item app-sidebar__logout ${isCollapsed ? 'is-collapsed' : ''}`} type="button" disabled={loggingOut} onClick={handleLogout} aria-label="Log out" title={isCollapsed ? 'Log out' : undefined}>
            <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
            {!isCollapsed && <span className="app-sidebar__item-label">{loggingOut ? 'Logging out…' : 'Log out'}</span>}
          </button>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
