import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getWorkspaceForPath, getWorkspaceTabs } from './navigation';

const WorkspaceNavigation = ({ userData }) => {
  const location = useLocation();
  const workspace = getWorkspaceForPath(location.pathname);

  if (!workspace) {
    return null;
  }

  const tabs = getWorkspaceTabs(workspace, userData?.role);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <section className="app-workspace-bar" aria-label={`${workspace.label} workspace`}>
      <div className="app-workspace-bar__copy">
        <span className="app-workspace-bar__eyebrow">Workspace</span>
        <strong>{workspace.label}</strong>
        <span>{workspace.description}</span>
      </div>
      <nav className="app-workspace-tabs" aria-label={`${workspace.label} sections`}>
        {tabs.map((tab) => (
          <NavLink
            className={({ isActive }) => `app-workspace-tab ${isActive ? 'is-active' : ''}`}
            end
            key={tab.path}
            to={tab.path}
            data-testid={`workspace-tab-${tab.path.split('/').pop()}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </section>
  );
};

export default WorkspaceNavigation;
