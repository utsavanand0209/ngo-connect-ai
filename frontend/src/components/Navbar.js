import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState('');

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
    <nav className="bg-blue-600 text-white shadow p-4 flex gap-6 items-center flex-wrap">
      <Link to="/" className="font-bold text-lg">NGO Connect</Link>
      <Link to="/ngos" className="hover:underline">NGOs</Link>
      <Link to="/campaigns" className="hover:underline">Campaigns</Link>
      <Link to="/chatbot" className="hover:underline">Chatbot</Link>
      {isAuthenticated && userRole === 'ngo' && <Link to="/ngo/profile" className="hover:underline">My NGO Profile</Link>}
      {isAuthenticated && userRole === 'admin' && <Link to="/admin" className="hover:underline">Admin Panel</Link>}
      <div className="ml-auto flex gap-4 items-center">
        {isAuthenticated ? (
          <>
            <Link to="/dashboard" className="hover:underline">Dashboard</Link>
            <button
              onClick={handleLogout}
              className="hover:underline cursor-pointer"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="hover:underline">Login</Link>
            <Link to="/register" className="hover:underline">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
