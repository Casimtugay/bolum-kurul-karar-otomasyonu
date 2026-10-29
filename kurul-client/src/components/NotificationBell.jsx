import React, { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/announcements';
import { formatDateTime } from './announcementUi';

const NAVY = '#0f1f4f';
const BLUE = '#1b4a94';
const YELLOW = '#fcc419';
const SOFT = '#e3eefb';
const BORDER = '#dfe5ed';

// Üst çubuktaki zil: okunmamış sayısı ve son bildirimler. Tıklayınca ilgili toplantı açılır.
export default function NotificationBell({ scope }) {
  const navigate = useNavigate();

  const [data, setData] = useState({ unreadCount: 0, items: [] });
  const [anchor, setAnchor] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await getNotifications();

      if (result && Array.isArray(result.items)) {
        setData({
          unreadCount: Number(result.unreadCount) || 0,
          items: result.items.slice(0, 8),
        });
        setError('');
      }
    } catch (err) {
      setError(err?.message || 'Bildirimler alınamadı.');
    }
  }, []);

  useEffect(() => {
    load();

    const timer = setInterval(load, 60000);
    window.addEventListener('notifications:refresh', load);

    return () => {
      clearInterval(timer);
      window.removeEventListener('notifications:refresh', load);
    };
  }, [load, scope]);

  const open = Boolean(anchor);

  const handleOpenItem = async (item) => {
    if (!item.isRead) {
      try {
        await markNotificationRead(item.id);
      } catch (err) {
        // Hata görünür kalsın diye menü açık bırakılır; kullanıcı tekrar deneyebilir.
        setError(err?.message || 'Bildirim okundu olarak işaretlenemedi.');
        return;
      }
      setError('');
      load();
    }

    setAnchor(null);

    navigate(
      item.decisionId
        ? `/oylama/${encodeURIComponent(item.decisionId)}`
        : item.meetingId
        ? `/duyurular?meeting=${encodeURIComponent(item.meetingId)}`
        : item.announcementId
          ? `/duyurular?announce=${encodeURIComponent(item.announcementId)}`
          : '/duyurular'
    );
  };

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead();
      setError('');
    } catch (err) {
      setError(err?.message || 'Bildirimler okundu olarak işaretlenemedi.');
      return;
    }
    load();
  };

  return (
    <>
      <IconButton
        id="header-bell-button"
        aria-label={`Bildirimler${
          data.unreadCount ? `, ${data.unreadCount} okunmamış` : ''
        }`}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.45)',
          borderRadius: 2,
          '&:hover': { bgcolor: '#1a2f6b', borderColor: '#fff' },
        }}
      >
        <Badge
          badgeContent={data.unreadCount}
          max={99}
          sx={{
            '& .MuiBadge-badge': {
              bgcolor: YELLOW,
              color: NAVY,
              fontWeight: 800,
            },
          }}
        >
          <NotificationsNoneOutlinedIcon />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          list: { 'aria-labelledby': 'header-bell-button', sx: { py: 0 } },
          paper: {
            sx: {
              mt: 1,
              width: 380,
              maxWidth: 'calc(100vw - 32px)',
              borderRadius: 2,
              overflow: 'hidden',
              border: `1px solid ${BORDER}`,
              boxShadow: '0 10px 30px rgba(15,31,79,0.18)',
            },
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            bgcolor: NAVY,
            borderBottom: `3px solid ${YELLOW}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography sx={{ color: '#fff', fontWeight: 700 }}>
            Bildirimler
          </Typography>

          {data.unreadCount > 0 && (
            <Button
              size="small"
              onClick={handleReadAll}
              sx={{
                color: YELLOW,
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'none',
                minWidth: 0,
              }}
            >
              Tümünü okundu say
            </Button>
          )}
        </Box>

        {error && (
          <Box
            role="alert"
            sx={{ px: 2, py: 1.2, bgcolor: '#fdecea', color: '#8a1c13', fontSize: '0.82rem' }}
          >
            {error}
          </Box>
        )}

        {data.items.length === 0 && !error && (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" sx={{ color: '#596779' }}>
              Henüz bildiriminiz yok.
            </Typography>
          </Box>
        )}

        {data.items.map((item) => (
          <MenuItem
            key={item.id}
            onClick={() => handleOpenItem(item)}
            sx={{
              display: 'block',
              whiteSpace: 'normal',
              py: 1.4,
              borderBottom: `1px solid ${BORDER}`,
              bgcolor: item.isRead ? 'transparent' : SOFT,
              '&:hover': { bgcolor: SOFT },
            }}
          >
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              {!item.isRead && (
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: BLUE,
                    mt: 0.8,
                    flexShrink: 0,
                  }}
                />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: '0.86rem',
                    fontWeight: item.isRead ? 500 : 700,
                    color: NAVY,
                  }}
                >
                  {item.title}
                </Typography>
                {item.message && (
                  <Typography
                    variant="body2"
                    sx={{ color: '#596779', fontSize: '0.8rem', mt: 0.2 }}
                  >
                    {item.message}
                  </Typography>
                )}
                <Typography
                  variant="caption"
                  sx={{ color: '#94a3b8', display: 'block', mt: 0.4 }}
                >
                  {formatDateTime(item.createdAt)}
                </Typography>
              </Box>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
