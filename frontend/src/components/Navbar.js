import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleAuthChange = () => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserRole(payload.role);
      } catch (e) {
        console.error('Failed to parse token:', e);
        setUserRole('');
      }
    } else {
      setUserRole('');
    }
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

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('authChange'));
    window.location.href = '/login';
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-lg font-semibold text-gray-900 tracking-tight">
              NGO Connect
            </Link>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link to="/discover" className="text-gray-600 hover:text-gray-900 transition-colors">NGOs</Link>
              <Link to="/map" className="text-gray-600 hover:text-gray-900 transition-colors">Map</Link>
              <Link to="/campaigns" className="text-gray-600 hover:text-gray-900 transition-colors">Campaigns</Link>
              {userRole === 'user' && (
                <Link to="/volunteer-opportunities" className="text-gray-600 hover:text-gray-900 transition-colors">Volunteer</Link>
              )}
              {userRole === 'user' && (
                <Link to="/donate" className="text-gray-600 hover:text-gray-900 transition-colors">Donate</Link>
              )}
              <Link to="/chatbot" className="text-gray-600 hover:text-gray-900 transition-colors">Chatbot</Link>
              {userRole === 'user' && (
                <Link to="/insights" className="text-gray-600 hover:text-gray-900 transition-colors">Insights</Link>
              )}
              {isAuthenticated && (userRole === 'user' || userRole === 'ngo') && (
                <Link to="/messages" className="text-gray-600 hover:text-gray-900 transition-colors">Messages</Link>
              )}
              {isAuthenticated && userRole === 'ngo' && (
                <Link to="/ngo/profile" className="text-gray-600 hover:text-gray-900 transition-colors">
                  My NGO Profile
                </Link>
              )}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-sm font-medium">
            {isAuthenticated ? (
              <>
                {userRole === 'admin' ? (
                  <Link to="/admin" className="text-gray-600 hover:text-gray-900 transition-colors">Admin</Link>
                ) : (
                  <Link to="/dashboard" className="text-gray-600 hover:text-gray-900 transition-colors">Dashboard</Link>
                )}
                <button
                  onClick={handleLogout}
                  className="ml-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-600 hover:text-gray-900 transition-colors">Login</Link>
                <Link to="/register" className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:border-gray-400 hover:text-gray-900 transition-colors">
                  Register
                </Link>
              </>
            )}
          </div>
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
          <div className="px-3 pt-3 pb-4 space-y-2">
            <Link to="/discover" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">NGOs</Link>
            <Link to="/map" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Map</Link>
            <Link to="/campaigns" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Campaigns</Link>
            {userRole === 'user' && (
              <Link to="/volunteer-opportunities" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Volunteer</Link>
            )}
            {userRole === 'user' && (
              <Link to="/donate" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Donate</Link>
            )}
            <Link to="/chatbot" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Chatbot</Link>
            {userRole === 'user' && (
              <Link to="/insights" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Insights</Link>
            )}
            {isAuthenticated && (userRole === 'user' || userRole === 'ngo') && (
              <Link to="/messages" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Messages</Link>
            )}
            {isAuthenticated && userRole === 'ngo' && (
              <Link to="/ngo/profile" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">
                My NGO Profile
              </Link>
            )}
            {isAuthenticated ? (
              <>
                {userRole === 'admin' ? (
                  <Link to="/admin" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Admin</Link>
                ) : (
                  <Link to="/dashboard" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Dashboard</Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full text-left text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Login</Link>
                <Link to="/register" className="text-gray-700 hover:text-gray-900 block px-2 py-2 text-base font-medium">Register</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
