import React from 'react';
import { Navigate } from 'react-router-dom';

export default function UserRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" />;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.role !== 'user') return <Navigate to="/dashboard" />;
  } catch (err) {
    return <Navigate to="/login" />;
  }
  return children;
}
