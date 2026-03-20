import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Shield, LayoutDashboard, Activity, ClipboardList,
  LogOut, Menu, X
} from 'lucide-react';
import StatusBadge from '../StatusBadge/StatusBadge';
import { useAdmin } from '../../context/AdminContext';
import { checkBackendHealth } from '../../services/api';
import './Layout.css';

const adminNavItems = [
  { to: '/dashboard', icon: <LayoutDashboard />, label: 'Dashboard' },
  { to: '/history',   icon: <ClipboardList />,   label: 'Audit Logs'  },
  { to: '/sessions',  icon: <Activity />,         label: 'Sessions'    },
];

// Routes that should show the full admin sidebar
const ADMIN_ROUTES = ['/dashboard', '/history', '/sessions'];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(null);
  const location = useLocation();
  const { logout, isAuthenticated } = useAdmin();

  const isAdminRoute = ADMIN_ROUTES.some((r) => location.pathname.startsWith(r));
  const showSidebar = isAuthenticated && isAdminRoute;

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const ok = await checkBackendHealth();
      if (active) setBackendOnline(ok);
    };
    check();
    const iv = setInterval(check, 10000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  const pageTitles = {
    '/dashboard': 'Dashboard',
    '/history':   'Audit Logs',
    '/sessions':  'Session Monitor',
    '/auth':      'Authentication',
    '/admin/login': 'Admin Login',
  };
  const pageTitle = pageTitles[location.pathname] || 'SmartLock';

  /* ── Public-only (door lock) layout — no sidebar */
  if (!showSidebar) {
    return (
      <div className="layout-public">
        <main className="layout-public-main">{children}</main>
      </div>
    );
  }

  /* ── Admin layout — full sidebar */
  return (
    <div className="layout">
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon"><Shield size={20} /></div>
          <div>
            <h1>SmartLock</h1>
            <span className="brand-sub">Admin Panel</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-row">
            <span>Backend</span>
            {backendOnline === null ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>checking…</span>
            ) : (
              <StatusBadge status={backendOnline ? 'online' : 'offline'} />
            )}
          </div>
          <button
            className="nav-link"
            onClick={logout}
            style={{ marginTop: '0.75rem', color: 'var(--danger)' }}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      <div className="layout-main">
        <header className="layout-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              className="mobile-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span className="header-title">{pageTitle}</span>
          </div>
          <div className="header-actions">
            <StatusBadge status={backendOnline ? 'online' : 'offline'} />
          </div>
        </header>

        <main className="layout-content">{children}</main>
      </div>
    </div>
  );
}
