import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import UserDashboard from './UserDashboard';
import NgoDashboard from './NgoDashboard';
import AdminDashboard from './AdminDashboard';

export default function Dashboard() {
  const navigate = useNavigate();
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setRole(payload.role);
      } catch (err) {
        console.error('Failed to decode token, redirecting to login.');
        navigate('/login');
      } finally {
        setLoading(false);
      }
    } else {
      navigate('/login');
    }
  }, [navigate]);

  if (loading) {
    return <div className="p-6 text-center">Loading Dashboard...</div>;
  }

  switch (role) {
    case 'admin':
      return <Navigate to="/admin" replace />;
    case 'ngo':
      return <NgoDashboard />;
    case 'user':
      return <UserDashboard />;
    default:
      // Redirect to login if role is not recognized
      navigate('/login');
      return null;
  }
}
