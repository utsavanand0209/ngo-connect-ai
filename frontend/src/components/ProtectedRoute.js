import React from 'react';
import { Navigate } from 'react-router-dom';
import { hasValidSession } from '../utils/auth';

export default function ProtectedRoute({ children }) {
  if (!hasValidSession()) return <Navigate to="/login" replace />;
  return children;
}
