import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, loadSession, saveLogin, saveUnit, clearSession } from '../api/client';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [retry, setRetry] = useState(0);
  const token = session.token;
  useEffect(() => {
    if (!token) { setPasswordStatus(null); return undefined; }
    let cancelled = false;
    setPasswordStatus(null);
    apiFetch('/api/account/password/status')
      .then(data => {
        if (typeof data?.mustChangePassword !== 'boolean') throw new Error('Parola durumu alınamadı.');
        if (!cancelled) setPasswordStatus({ token, required: data.mustChangePassword });
      })
      .catch(error => {
        if (!cancelled) setPasswordStatus({ token, error: error.message || 'Oturum kontrol edilemedi.' });
      });
    return () => { cancelled = true; };
  }, [token, retry]);

  const login = data => { saveLogin(data); setSession(loadSession()); };
  const logout = () => { clearSession(); setSession(loadSession()); setPasswordStatus(null); };
  const currentStatus = passwordStatus?.token === token ? passwordStatus : null;
  const mustChangePassword = currentStatus?.required === true;
  const authChecking = Boolean(token && !currentStatus);
  const authError = currentStatus?.error || '';
  const selectUnit = async unitCode => {
    const data = await apiFetch('/api/auth/select-unit', { method: 'POST', body: { unitCode } });
    saveUnit(data.token, { ...data.unit, permissions: data.permissions });
    setSession(loadSession());
    return data.unit;
  };
  const u = session.user;
  const isAdmin = u?.role === 'Admin';
  const can = (page, mode = 'read') => {
    if (!token || authChecking || authError || mustChangePassword) return false;
    if (isAdmin) return true;
    const p = session.unit?.permissions?.[page];
    return Boolean(p && (mode === 'write' ? p.write : p.read));
  };
  const user = u ? {
    id: u.id, fullName: u.fullName, title: u.title,
    name: `${u.title || ''} ${u.fullName}`.trim(),
    role: session.unit ? session.unit.unitRole : u.role,
  } : null;
  return <AuthContext.Provider value={{ user, token, units: session.units, unit: session.unit,
    isAdmin, can, login, logout, selectUnit, mustChangePassword, authChecking, authError,
    retryAuth: () => { setPasswordStatus(null); setRetry(n => n + 1); } }}>
    {children}
  </AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
