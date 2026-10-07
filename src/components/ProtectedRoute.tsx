import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isTokenExpired, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isTokenExpired) {
      logout('Your session has expired after 24 hours. Please log in again.');
      navigate('/login?expired=true', { replace: true, state: { from: location.pathname } });
    }
  }, [isTokenExpired, logout, navigate, location.pathname]);

  if (!isAuthenticated || isTokenExpired) {
    return <Navigate to="/login?expired=true" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
