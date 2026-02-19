import React from 'react';
import { Navigate } from 'react-router-dom';
import { getUserRole, hasValidSession } from '../utils/auth';

export default function UserRoute({ children }) {
  if (!hasValidSession()) return <Navigate to="/login" replace />;
  if (getUserRole() !== 'user') return <Navigate to="/dashboard" replace />;
  return children;
}
