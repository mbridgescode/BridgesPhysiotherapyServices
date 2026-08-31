import {
  BarChart3,
  CalendarDays,
  Home,
  Mail,
  Settings2,
  Users,
  WalletCards,
} from 'lucide-react';

export const ALL_ROLES = ['admin', 'therapist', 'receptionist'];

export const primaryNavigation = [
  {
    id: 'today',
    label: 'Today',
    icon: Home,
    path: '/dashboard',
    legacyTestId: 'home',
    roles: ALL_ROLES,
    exact: true,
    section: 'workspace',
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: CalendarDays,
    path: '/dashboard/appointments',
    legacyTestId: 'appointments',
    roles: ALL_ROLES,
    section: 'workspace',
  },
  {
    id: 'patients',
    label: 'Patients',
    icon: Users,
    path: '/dashboard/patients',
    roles: ALL_ROLES,
    section: 'workspace',
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: WalletCards,
    path: '/dashboard/invoices',
    legacyTestId: 'invoices',
    matchPaths: ['/dashboard/invoices', '/dashboard/payments'],
    roles: ['admin', 'receptionist'],
    section: 'finance',
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: BarChart3,
    path: '/dashboard/reports',
    legacyTestId: 'reports',
    matchPaths: ['/dashboard/reports', '/dashboard/profit-loss'],
    roles: ['admin'],
    section: 'finance',
  },
  {
    id: 'communications',
    label: 'Communications',
    icon: Mail,
    path: '/dashboard/communications',
    roles: ALL_ROLES,
    section: 'clinic',
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: Settings2,
    path: '/dashboard/admin',
    legacyTestId: 'admin',
    rolePaths: {
      therapist: '/dashboard/settings',
    },
    matchPaths: ['/dashboard/admin', '/dashboard/settings', '/dashboard/audit'],
    roles: ['admin', 'therapist'],
    section: 'clinic',
  },
];

const sectionDefinitions = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'finance', label: 'Finance' },
  { id: 'clinic', label: 'Clinic' },
];

const administrationTabs = [
  { label: 'Users', path: '/dashboard/admin', roles: ['admin'] },
  { label: 'Clinic settings', path: '/dashboard/settings', roles: ['admin', 'therapist'] },
  { label: 'Audit log', path: '/dashboard/audit', roles: ['admin'] },
];

export const workspaceDefinitions = [
  {
    id: 'billing',
    label: 'Billing',
    description: 'Invoices, payments and receipts in one financial workspace.',
    paths: ['/dashboard/invoices', '/dashboard/payments'],
    tabs: [
      { label: 'Invoices', path: '/dashboard/invoices', roles: ['admin', 'receptionist'] },
      { label: 'Payments', path: '/dashboard/payments', roles: ['admin', 'receptionist'] },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'Operational performance and financial health.',
    paths: ['/dashboard/reports', '/dashboard/profit-loss'],
    tabs: [
      { label: 'Reports', path: '/dashboard/reports', roles: ['admin'] },
      { label: 'Profit & loss', path: '/dashboard/profit-loss', roles: ['admin'] },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    description: 'People, clinic setup and accountability controls.',
    paths: ['/dashboard/admin', '/dashboard/settings', '/dashboard/audit'],
    tabs: administrationTabs,
  },
];

export const getVisibleNavigation = (role) => primaryNavigation.filter(
  (item) => !item.roles || !role || item.roles.includes(role),
);

export const getNavigationSections = (role) => {
  const visibleItems = getVisibleNavigation(role);

  return sectionDefinitions
    .map((section) => ({
      ...section,
      items: visibleItems.filter((item) => item.section === section.id),
    }))
    .filter((section) => section.items.length > 0);
};

export const resolveNavigationPath = (item, role) => item.rolePaths?.[role] || item.path;

export const isNavigationItemActive = (item, pathname) => {
  if (item.exact) {
    return pathname === item.path;
  }

  const matchPaths = item.matchPaths || [item.path];
  return matchPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
};

export const getNavigationItemForPath = (pathname, role) => getVisibleNavigation(role)
  .find((item) => isNavigationItemActive(item, pathname));

export const getWorkspaceForPath = (pathname) => workspaceDefinitions.find(
  (workspace) => workspace.paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  ),
);

export const getWorkspaceTabs = (workspace, role) => (workspace?.tabs || []).filter(
  (tab) => !tab.roles || !role || tab.roles.includes(role),
);
