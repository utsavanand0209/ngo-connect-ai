import React from 'react';
import { Navigate } from 'react-router-dom';
import { getUserRole, hasValidSession } from '../utils/auth';

export default function AdminRoute({ children }) {
  if (!hasValidSession()) return <Navigate to="/login" replace />;
  if (getUserRole() !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}
