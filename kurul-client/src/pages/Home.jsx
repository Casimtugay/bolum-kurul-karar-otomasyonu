import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Paper,
  Skeleton,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import { COLORS } from '../components/Header';
import PageLayout from '../components/PageLayout';
import {
  AgendaList,
  DateBlock,
  SectionTitle,
  cardSx,
} from '../components/announcementUi';
import {
  formatDateTime,
  formatLongDate,
  isUpcoming,
  meetingLabel,
  parseDate,
} from '../components/dateUtils';
import { useAuth } from '../contexts/AuthContext';
import {
  getAnnouncements,
  getNotifications,
  markNotificationRead,
  refreshNotifications,
} from '../api/announcements';

// Kısayol kartları: kullanıcının yetkisine göre görünür.
function useShortcuts() {
  const { can, unit } = useAuth();

  return [
    {
      label: 'Kurul Kararları',
      text: 'Taslak, oylama ve imza aşamasındaki kararlar',
      path: '/dashboard',
      icon: DescriptionOutlinedIcon,
      visible: unit && can('oylama', 'read'),
    },
    {
      label: 'Yeni Karar',
      text: 'Toplantı seçip karar taslağı hazırlayın',
      path: '/yeni-karar',
      icon: NoteAddOutlinedIcon,
      visible: unit && can('yeni-karar', 'write'),
    },
    {
      label: 'Toplantı Duyuruları',
      text: 'Yaklaşan toplantılar ve gündem',
      path: '/duyurular',
      icon: CampaignOutlinedIcon,
      visible: unit && can('oylama', 'read'),
    },
    {
      label: 'Karar Arşivi',
      text: 'Sonuçlanmış kararlar ve tutanaklar',
      path: '/archive',
      icon: Inventory2OutlinedIcon,
      visible: unit && can('arsiv', 'read'),
    },
    {
      label: 'Kullanım Kılavuzu',
      text: 'Sistemin adım adım kullanımı',
      path: '/user-manual',
      icon: MenuBookOutlinedIcon,
      visible: true,
    },
  ].filter((item) => item.visible);
}

export default function Home() {
  const navigate = useNavigate();
  const { user, unit } = useAuth();
  const shortcuts = useShortcuts();

  const [announcements, setAnnouncements] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    getAnnouncements()
      .then((data) => {
        if (!cancelled) setAnnouncements(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setAnnouncements([]);
          setError(err.message || 'Duyurular yüklenemedi.');
        }
      });

    getNotifications()
      .then((data) => {
        if (!cancelled) {
          setNotifications(Array.isArray(data?.items) ? data.items : []);
        }
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      });

    return () => {
      cancelled = true;
    };
  }, [unit?.code]);

  // En yakın tarihli yaklaşan toplantı ilk sırada
  const upcoming = useMemo(
    () =>
      (announcements || [])
        .filter((item) => isUpcoming(item.meetingDate))
        .sort(
          (a, b) =>
            parseDate(a.meetingDate) - parseDate(b.meetingDate)
        ),
    [announcements]
  );

  const next = upcoming[0];
  const loading = announcements === null;

  const openNotification = async (item) => {
    if (!item.isRead) {
      try {
        await markNotificationRead(item.id);
        refreshNotifications();
      } catch {
        // Okundu işareti başarısız olsa da sayfa açılır.
      }
    }

    navigate(
      item.meetingId
        ? `/duyurular?meeting=${encodeURIComponent(item.meetingId)}`
        : '/duyurular'
    );
  };

  const boardName = unit?.boardName || '';
  const parentName = unit?.parentName || '';

  return (
    <PageLayout title="Ana Sayfa">
      {/* KARŞILAMA */}
      <Paper elevation={0} sx={{ ...cardSx, mb: 3 }}>
        <Typography
          sx={{
            color: COLORS.blue,
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: 1,
            mb: 0.5,
          }}
        >
          ANA SAYFA
        </Typography>

        <Typography
          component="h2"
          sx={{
            color: COLORS.title,
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          Hoş geldiniz, {user?.name}
        </Typography>

        {(boardName || parentName) && (
          <Typography sx={{ color: '#596779', mt: 0.5 }}>
            {[parentName, boardName].filter(Boolean).join(' · ')}
          </Typography>
        )}

        <Box sx={{ width: 60, height: 3, bgcolor: COLORS.blue, mt: 2, mb: 2 }} />

        <Typography sx={{ color: '#596779', lineHeight: 1.8, maxWidth: 760 }}>
          Yaklaşan toplantıları, gündemi ve bildirimlerinizi buradan takip
          edebilirsiniz. Diğer bölümlere soldaki menüden geçebilirsiniz.
        </Typography>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.6fr) minmax(0, 1fr)' },
          gap: 3,
          alignItems: 'start',
          mb: 3,
        }}
      >
        {/* YAKLAŞAN TOPLANTI */}
        <Paper elevation={0} sx={cardSx}>
          <SectionTitle
            action={
              <Button
                component={RouterLink}
                to="/duyurular"
                endIcon={<ArrowForwardIcon />}
                sx={{ color: COLORS.blue, fontWeight: 700, flexShrink: 0 }}
              >
                Tüm duyurular
              </Button>
            }
          >
            Yaklaşan Toplantı
          </SectionTitle>

          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading && (
            <>
              <Skeleton variant="rounded" height={64} sx={{ mb: 2 }} />
              <Skeleton variant="rounded" height={120} />
            </>
          )}

          {!loading && !next && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2.5,
                borderRadius: 2,
                bgcolor: COLORS.background,
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: COLORS.blueSoft,
                  color: COLORS.blue,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <EventAvailableOutlinedIcon />
              </Box>
              <Typography sx={{ color: '#596779' }}>
                Şu an duyurulmuş yaklaşan bir toplantı yok. Yeni bir toplantı
                yayımlandığında burada ve bildirimlerinizde görünecek.
              </Typography>
            </Box>
          )}

          {next && (
            <>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2.5 }}>
                <DateBlock value={next.meetingDate} size={72} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      color: COLORS.title,
                      fontWeight: 700,
                      fontSize: '1.15rem',
                    }}
                  >
                    {meetingLabel(next)}
                  </Typography>
                  <Typography sx={{ color: '#596779' }}>
                    {formatLongDate(next.meetingDate)}
                  </Typography>
                  {!next.isRead && (
                    <Chip
                      size="small"
                      label="Yeni"
                      sx={{
                        mt: 0.8,
                        bgcolor: COLORS.yellow,
                        color: COLORS.navy,
                        fontWeight: 800,
                      }}
                    />
                  )}
                </Box>
              </Box>

              <Typography
                sx={{
                  color: COLORS.blue,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: 1,
                  mb: 0.5,
                }}
              >
                GÜNDEM
              </Typography>

              <AgendaList items={next.agenda} />

              <Box sx={{ mt: 2.5, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  component={RouterLink}
                  to={`/duyurular?meeting=${next.meetingId}`}
                  variant="contained"
                  color="secondary"
                  sx={{ fontWeight: 800, px: 2.5 }}
                >
                  Toplantıyı aç
                </Button>

                {upcoming.length > 1 && (
                  <Chip
                    label={`+${upcoming.length - 1} toplantı daha`}
                    sx={{ bgcolor: COLORS.blueSoft, color: COLORS.blue, fontWeight: 700 }}
                  />
                )}
              </Box>
            </>
          )}
        </Paper>

        {/* BİLDİRİMLER */}
        <Paper elevation={0} sx={cardSx}>
          <SectionTitle>Bildirimler</SectionTitle>

          {notifications === null && (
            <>
              <Skeleton variant="rounded" height={56} sx={{ mb: 1 }} />
              <Skeleton variant="rounded" height={56} />
            </>
          )}

          {notifications && notifications.length === 0 && (
            <Typography sx={{ color: '#596779' }}>
              Henüz bildiriminiz yok.
            </Typography>
          )}

          {notifications &&
            notifications.slice(0, 5).map((item, index, list) => (
              <ButtonBase
                key={item.id}
                onClick={() => openNotification(item)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  gap: 1.2,
                  textAlign: 'left',
                  px: 1.2,
                  py: 1.4,
                  borderRadius: 1.5,
                  bgcolor: item.isRead ? 'transparent' : COLORS.blueSoft,
                  borderBottom:
                    index !== list.length - 1
                      ? `1px solid ${COLORS.border}`
                      : 'none',
                  '&:hover': { bgcolor: COLORS.blueSoft },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: item.isRead ? 'transparent' : COLORS.blue,
                    mt: 0.9,
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: '0.9rem',
                      fontWeight: item.isRead ? 500 : 700,
                      color: COLORS.title,
                    }}
                  >
                    {item.title}
                  </Typography>
                  {item.message && (
                    <Typography variant="body2" sx={{ color: '#596779' }}>
                      {item.message}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                    {formatDateTime(item.createdAt)}
                  </Typography>
                </Box>
              </ButtonBase>
            ))}
        </Paper>
      </Box>

      {/* KISAYOLLAR */}
      <Paper elevation={0} sx={cardSx}>
        <SectionTitle>Kısayollar</SectionTitle>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
              xl: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 2,
          }}
        >
          {shortcuts.map((item) => {
            const Icon = item.icon;

            return (
              <ButtonBase
                key={item.path}
                component={RouterLink}
                to={item.path}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 2,
                  textAlign: 'left',
                  p: 2,
                  borderRadius: 2,
                  border: `1px solid ${COLORS.border}`,
                  transition: 'border-color 150ms, background-color 150ms',
                  '&:hover': {
                    borderColor: COLORS.blue,
                    bgcolor: COLORS.blueSoft,
                  },
                }}
              >
                <Box
                  sx={{
                    width: 46,
                    height: 46,
                    borderRadius: 2,
                    bgcolor: COLORS.blueSoft,
                    color: COLORS.blue,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, color: COLORS.title }}>
                    {item.label}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#596779' }}>
                    {item.text}
                  </Typography>
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      </Paper>
    </PageLayout>
  );
}
