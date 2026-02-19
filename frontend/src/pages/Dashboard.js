import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import UserDashboard from './UserDashboard';
import NgoDashboard from './NgoDashboard';
import AdminDashboard from './AdminDashboard';
import { getUserRole } from '../utils/auth';

export default function Dashboard() {
  const navigate = useNavigate();
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolvedRole = getUserRole();
    if (!resolvedRole) {
      navigate('/login');
      return;
    }
    setRole(resolvedRole);
    setLoading(false);
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
      return <Navigate to="/login" replace />;
  }
}
