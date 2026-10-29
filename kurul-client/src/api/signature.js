import { apiFetch } from './client';

// Profilde kayıtlı imza ("İmzam" sayfası ve imzalama penceresi).
export const getMySignature = () => apiFetch('/api/account/signature');

export const saveMySignature = (image) =>
  apiFetch('/api/account/signature', { method: 'PUT', body: { image } });

export const deleteMySignature = () =>
  apiFetch('/api/account/signature', { method: 'DELETE' });
