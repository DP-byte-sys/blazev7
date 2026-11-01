import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { EnvBanner } from '../components/EnvBanner';
import { useAuth } from '../features/auth/AuthProvider';

const MAIN = [
  { to: '/', label: 'Overview', end: true },
  { to: '/tickets', label: 'Ticket queue' },
];
const ADMIN = [
  { to: '/categories', label: 'Categories' },
  { to: '/users', label: 'Users and roles' },
  { to: '/audit', label: 'Audit log' },
];

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <EnvBanner />
      <div className="topbar">
        <button
          type="button"
          className="btn"
          aria-expanded={open}
          aria-controls="sidebar"
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>
        <strong>Blaze</strong>
      </div>
      <div className="shell">
        <aside id="sidebar" className={`sidebar${open ? ' open' : ''}`}>
          <div className="brand">Blaze</div>
          <nav className="nav" aria-label="Main">
            {MAIN.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} onClick={close}>
                {i.label}
              </NavLink>
            ))}
            <div className="nav-label">Admin</div>
            {ADMIN.map((i) => (
              <NavLink key={i.to} to={i.to} onClick={close}>
                {i.label}
              </NavLink>
            ))}
            <div className="nav-label">Account</div>
            <NavLink to="/settings" onClick={close}>
              Settings / profile
            </NavLink>
          </nav>
          <div className="sidebar-user">
            <div>{profile?.display_name ?? 'Signed in'}</div>
            <div className="sidebar-role">{profile?.role}</div>
            <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </aside>
        <main id="main" className="content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
