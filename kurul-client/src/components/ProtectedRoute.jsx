import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { rememberReturnPath } from '../api/client';

export function ProtectedRoute({ children, need, requireUnit = true, allowPasswordChange = false }) {
  const { token, user, unit, can, mustChangePassword, authChecking, authError, retryAuth, logout } = useAuth();
  const location = useLocation();
  const target = location.pathname + location.search;
  if (!token || !user) {
    rememberReturnPath(target);
    return <Navigate to="/" replace />;
  }
  if (authChecking) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress aria-label="Oturum kontrol ediliyor" /></Box>;
  if (authError) return <Box sx={{ p: 4 }}>
    <Alert severity="error">{authError}</Alert>
    <Button onClick={retryAuth}>Tekrar dene</Button><Button onClick={logout}>Çıkış yap</Button>
  </Box>;
  if (mustChangePassword && !allowPasswordChange) return <Navigate to="/parola-degistir" replace />;
  if (requireUnit && !unit) {
    rememberReturnPath(target);
    return <Navigate to="/select-unit" replace />;
  }
  if (need) {
    const list = Array.isArray(need) ? need : [need];
    const allowed = list.some(n => { const [page, mode] = n.split(':'); return can(page, mode); });
    if (!allowed) return <Navigate to="/yetkisiz-erisim" replace />;
  }
  return children;
}
export default ProtectedRoute;
