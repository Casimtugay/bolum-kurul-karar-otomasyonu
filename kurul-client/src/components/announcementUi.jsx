import React from 'react';
import { Box, Typography } from '@mui/material';

import { COLORS } from './Header';

// "2026-11-03" → yerel saat dilimi kaymadan Date
export const parseDate = (value) => {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

export const formatDate = (value) => {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';
};

export const formatLongDate = (value) => {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
      })
    : '';
};

export const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
};

// Bugün veya sonrası
export const isUpcoming = (value) => {
  const date = parseDate(value);
  if (!date) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date >= today;
};

export const meetingLabel = (item) =>
  `${item.meetingYear}/${item.meetingNo}. Toplantı`;

// Üniversite sitesindeki gibi açık mavi kutuda gün / ay
export function DateBlock({ value, size = 64 }) {
  const date = parseDate(value);
  if (!date) return null;

  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 2,
        bgcolor: COLORS.blueSoft,
        color: COLORS.blue,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      <Typography sx={{ fontSize: size * 0.42, fontWeight: 800, lineHeight: 1 }}>
        {date.getDate()}
      </Typography>
      <Typography
        sx={{
          fontSize: size * 0.19,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          mt: 0.4,
        }}
      >
        {date.toLocaleDateString('tr-TR', { month: 'short' })}
      </Typography>
    </Box>
  );
}

// Numaralı gündem maddeleri
export function AgendaList({ items = [], dense = false }) {
  if (!items.length) {
    return (
      <Typography variant="body2" sx={{ color: '#596779' }}>
        Bu toplantı için gündem maddesi eklenmemiş.
      </Typography>
    );
  }

  return (
    <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {items.map((item, index) => (
        <Box
          component="li"
          key={item.id ?? index}
          sx={{
            display: 'flex',
            gap: 1.5,
            py: dense ? 0.8 : 1.2,
            borderBottom:
              index !== items.length - 1
                ? `1px solid ${COLORS.border}`
                : 'none',
          }}
        >
          <Box
            sx={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: '50%',
              bgcolor: COLORS.blueSoft,
              color: COLORS.blue,
              fontSize: '0.78rem',
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              mt: 0.1,
            }}
          >
            {index + 1}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: '0.93rem',
                color: COLORS.title,
                overflowWrap: 'anywhere',
              }}
            >
              {item.title}
            </Typography>
            {item.description && (
              <Typography
                variant="body2"
                sx={{ color: '#596779', mt: 0.3, overflowWrap: 'anywhere' }}
              >
                {item.description}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// Beyaz içerik kartı
export const cardSx = {
  bgcolor: '#fff',
  borderRadius: 3,
  boxShadow: '0 2px 10px rgba(15,31,79,0.05)',
  p: { xs: 2.5, md: 3.5 },
};

// Başlık + 60px mavi alt çizgi
export function SectionTitle({ children, action }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
        mb: 2.5,
      }}
    >
      <Box>
        <Typography
          component="h2"
          sx={{
            color: COLORS.title,
            fontSize: { xs: '1.25rem', md: '1.5rem' },
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          {children}
        </Typography>
        <Box sx={{ width: 60, height: 3, bgcolor: COLORS.blue, mt: 1 }} />
      </Box>
      {action}
    </Box>
  );
}
