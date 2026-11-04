import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../lib/api';
import { useAuth } from './AuthContext';

export const homeFor = (role: Role) => `/${role}`;

export function RequireRole({ role }: { role: Role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="p-8 text-muted">Loading your account…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}

// Login, activate and reset pages: signed-in users go straight to their own dashboard.
export function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-muted">Loading…</p>;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
