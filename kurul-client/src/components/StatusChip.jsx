import React from 'react';
import { Chip } from '@mui/material';

// Karar durumu rozeti: Taslak -> Oylamada -> İmza Bekliyor -> İmzalandı (veya Reddedildi)
const STATUS = {
  Taslak: { label: 'Taslak', bg: '#e2e8f0', color: '#334155' },
  Oylamada: { label: 'Oylamada', bg: '#dbeafe', color: '#1d4ed8' },
  ImzaBekliyor: { label: 'İmza Bekliyor', bg: '#fef3c7', color: '#b45309' },
  Imzalandi: { label: 'İmzalandı', bg: '#dcfce7', color: '#15803d' },
  IptalEdildi: { label: 'İptal edildi', bg: '#ffedd5', color: '#9a3412' },
  Reddedildi: { label: 'Reddedildi', bg: '#fee2e2', color: '#b91c1c' },
};

export default function StatusChip({ status = 'Taslak' }) {
  const s = STATUS[status] || { label: status || 'Bilinmiyor', bg: '#e2e8f0', color: '#334155' };
  return <Chip size="small" label={s.label} sx={{ bgcolor: s.bg, color: s.color, fontWeight: 'bold' }} />;
}