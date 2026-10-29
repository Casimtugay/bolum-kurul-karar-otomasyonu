import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Container, Paper, TextField, Typography } from '@mui/material';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api/client';

export default function ChangePassword() {
  const { mustChangePassword, logout } = useAuth();
  const navigate = useNavigate();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const setField = key => event => setForm(prev => ({ ...prev, [key]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    if (lock.current) return;
    setError('');
    if (!form.newPassword.trim() || form.newPassword.length < 8 || form.newPassword.length > 128) {
      setError('Yeni parola 8–128 karakter olmalıdır.'); return;
    }
    if (form.newPassword !== form.confirmPassword) { setError('Yeni parola ile tekrarı eşleşmiyor.'); return; }
    if (form.currentPassword === form.newPassword) { setError('Yeni parola mevcut paroladan farklı olmalıdır.'); return; }
    lock.current = true; setBusy(true);
    try {
      await apiFetch('/api/account/password', { method: 'POST', body: form });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      logout();
      navigate('/', { replace: true, state: { passwordChanged: true } });
    } catch (e) { setError(e.message || 'Parola değiştirilemedi.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
    <Header title="Parola Değiştir" onBackClick={mustChangePassword ? undefined : () => navigate('/home')} backText="ANA SAYFAYA DÖN" />
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: '12px', borderTop: '5px solid #c88a2b' }}>
        <Typography variant="h6" sx={{ color: '#003366', fontWeight: 'bold', mb: 2 }}>Parolanızı değiştirin</Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          {mustChangePassword ? 'Hesabınız için yeni bir parola belirlemeniz gerekiyor. Mevcut parola alanına size verilen geçici parolayı yazın.' : 'Parolanız değişince tüm açık oturumlarınız kapanır. Yeni parolanızla tekrar giriş yapabilirsiniz.'}
        </Alert>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Mevcut parola" type="password" autoComplete="current-password" required disabled={busy} value={form.currentPassword} onChange={setField('currentPassword')} />
          <TextField label="Yeni parola" type="password" autoComplete="new-password" required disabled={busy} value={form.newPassword} onChange={setField('newPassword')} helperText="8–128 karakter; mevcut parolanızdan farklı olmalı." />
          <TextField label="Yeni parola (tekrar)" type="password" autoComplete="new-password" required disabled={busy} value={form.confirmPassword} onChange={setField('confirmPassword')} />
          <Button type="submit" variant="contained" disabled={busy} sx={{ bgcolor: '#003366', py: 1.5 }}>{busy ? 'Kaydediliyor…' : 'PAROLAYI DEĞİŞTİR'}</Button>
        </Box>
      </Paper>
    </Container>
  </Box>;
}
