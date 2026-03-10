import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getTokenPayload } from '../utils/auth';

export default function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [desktopAccountOpen, setDesktopAccountOpen] = useState(false);
  const desktopMenuRef = useRef(null);
  const desktopAccountRef = useRef(null);
  const location = useLocation();

  const handleAuthChange = () => {
    const payload = getTokenPayload();
    setIsAuthenticated(Boolean(payload));
    setUserRole(payload?.role || '');
  };

  useEffect(() => {
    handleAuthChange(); // Initial check
    window.addEventListener('authChange', handleAuthChange);
    window.addEventListener('storage', handleAuthChange); // Listen for changes across tabs
    return () => {
      window.removeEventListener('authChange', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  useEffect(() => {
    setIsOpen(false);
    setDesktopMenuOpen(false);
    setDesktopAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(target)) {
        setDesktopMenuOpen(false);
      }
      if (desktopAccountRef.current && !desktopAccountRef.current.contains(target)) {
        setDesktopAccountOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setDesktopMenuOpen(false);
        setDesktopAccountOpen(false);
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('authChange'));
    setIsOpen(false);
    window.location.href = '/login';
  };

  const roleBadgeClass =
    userRole === 'admin'
      ? 'nav-role-badge nav-role-badge--admin'
      : userRole === 'ngo'
        ? 'nav-role-badge nav-role-badge--ngo'
        : 'nav-role-badge nav-role-badge--user';

  const roleLabel =
    userRole === 'admin' ? 'Admin' : userRole === 'ngo' ? 'NGO' : 'User';

  const menuLinks = useMemo(() => {
    if (!isAuthenticated) return [];

    if (userRole === 'admin') {
      return [
        { to: '/admin', label: 'Dashboard' },
        { to: '/admin/verifications', label: 'Verifications' },
        { to: '/admin/flagged-content', label: 'Moderation' },
        { to: '/admin/users', label: 'Users' },
        { to: '/admin/analytics', label: 'Analytics' },
        { to: '/admin/notifications', label: 'Notifications' },
        { to: '/admin/requests', label: 'Requests' },
        { to: '/admin/categories', label: 'Categories' }
      ];
    }

    const links = [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/discover', label: 'NGOs' },
      { to: '/map', label: 'Map' },
      { to: '/campaigns', label: 'Campaigns' },
      { to: '/messages', label: 'Messages' },
      { to: '/innovation-center', label: 'Innovation' },
      { to: '/chatbot', label: 'Chatbot' }
    ];

    if (userRole === 'user') {
      links.splice(4, 0, { to: '/volunteer-opportunities', label: 'Volunteer' });
      links.splice(5, 0, { to: '/donate', label: 'Donate' });
      links.push({ to: '/insights', label: 'Insights' });
      links.push({ to: '/profile', label: 'My Profile' });
    }

    if (userRole === 'ngo') {
      links.push({ to: '/ngo/profile', label: 'My NGO Profile' });
    }

    return links;
  }, [isAuthenticated, userRole]);

  const accountLinks = useMemo(() => {
    if (!isAuthenticated) return [];
    if (userRole === 'admin') {
      return [
        { to: '/admin', label: 'Admin Home' },
        { to: '/admin/analytics', label: 'Platform Analytics' }
      ];
    }

    const links = [{ to: '/dashboard', label: 'My Dashboard' }];
    if (userRole === 'user') {
      links.push({ to: '/profile', label: 'My Profile' });
      links.push({ to: '/recommendations', label: 'Recommendations' });
    } else if (userRole === 'ngo') {
      links.push({ to: '/ngo/profile', label: 'NGO Profile' });
      links.push({ to: '/campaigns/create', label: 'Create Campaign' });
    }
    return links;
  }, [isAuthenticated, userRole]);

  const navLinkClass = (to) =>
    `nav-dropdown-link ${
      location.pathname === to
        ? 'bg-slate-100 text-slate-900'
        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
    }`;

  const primaryLinks = useMemo(() => {
    if (!isAuthenticated) return [];
    if (userRole === 'admin') {
      return [
        { to: '/admin', label: 'Control Room' },
        { to: '/admin/verifications', label: 'Verifications' },
        { to: '/admin/analytics', label: 'Analytics' }
      ];
    }
    if (userRole === 'ngo') {
      return [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/campaigns', label: 'Campaigns' },
        { to: '/map', label: 'Map' }
      ];
    }
    return [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/discover', label: 'Discover' },
      { to: '/map', label: 'Map' }
    ];
  }, [isAuthenticated, userRole]);

  return (
    <nav className="nav-pro">
      <div className="nav-inner">
        <div className="nav-row">
          <div className="flex items-center gap-3 md:gap-5">
            <Link to="/" className="nav-brand">
              <span className="nav-brand-mark">NC</span>
              <span className="nav-brand-text text-display">NGO Connect</span>
            </Link>
            {isAuthenticated && (
              <div className="hidden lg:flex items-center gap-1">
                {primaryLinks.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`nav-link-inline ${location.pathname === item.to ? 'bg-slate-100 text-slate-900' : ''}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
            {isAuthenticated && (
              <div className="relative hidden md:block" ref={desktopMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setDesktopMenuOpen((prev) => !prev);
                    setDesktopAccountOpen(false);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={desktopMenuOpen}
                  className="nav-btn"
                >
                  Menu
                  <svg className={`h-4 w-4 text-slate-500 transition-transform ${desktopMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.163l3.71-3.933a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {desktopMenuOpen && (
                  <div className="menu-popover absolute left-0 mt-2" role="menu">
                    {menuLinks.map((item) => (
                      <Link key={item.to} to={item.to} className={navLinkClass(item.to)} role="menuitem">
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-3 text-sm font-medium">
            {isAuthenticated ? (
              <>
                <span className={roleBadgeClass}>{roleLabel}</span>
                <div className="relative" ref={desktopAccountRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setDesktopAccountOpen((prev) => !prev);
                      setDesktopMenuOpen(false);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={desktopAccountOpen}
                    className="nav-btn"
                  >
                    Account
                    <svg className={`h-4 w-4 text-slate-500 transition-transform ${desktopAccountOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.163l3.71-3.933a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {desktopAccountOpen && (
                    <div className="menu-popover absolute right-0 mt-2" role="menu">
                      {accountLinks.map((item) => (
                        <Link key={item.to} to={item.to} className={navLinkClass(item.to)} role="menuitem">
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="nav-btn ml-1"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-link-inline">Login</Link>
                <Link to="/register" className="nav-btn">
                  Register
                </Link>
              </>
            )}
          </div>
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
              aria-controls="mobile-menu"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              {!isOpen ? (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden" id="mobile-menu">
          <div className="px-3 pt-3 pb-4 space-y-2 bg-white/95 border-t border-slate-200 shadow-lg">
            {isAuthenticated && menuLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`${navLinkClass(item.to)} text-base`}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <>
                <div className="border-t border-slate-200 my-2" />
                {accountLinks.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`${navLinkClass(item.to)} text-base`}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                <button
                  onClick={handleLogout}
                  className="w-full text-left rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900">Login</Link>
                <Link to="/register" className="rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900">Register</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
