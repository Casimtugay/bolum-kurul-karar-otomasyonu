import { useEffect } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  ButtonBase,
  Fade,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import PeopleIcon from '@mui/icons-material/People';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NAVY, YELLOW } from '../styles/adminTheme';

export default function QuickMenuModal({ open, onClose }) {
  const { can, unit, mustChangePassword } = useAuth();
  const navigate = useNavigate();

  // ESC tuşuna basıldığında kapatma
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleNavigate = (path) => {
    onClose();
    navigate(path);
  };

  // Kurul Otomasyonu Kısayolları (Yetkiye göre filtrelenir)
  const shortcuts = [
    {
      label: 'Yeni Karar Yaz',
      path: '/yeni-karar',
      icon: NoteAddOutlinedIcon,
      visible: Boolean(unit && can('yeni-karar', 'write')),
    },
    {
      label: 'Kurul Kararları',
      path: '/dashboard',
      icon: DescriptionOutlinedIcon,
      visible: Boolean(unit && can('oylama', 'read')),
    },
    {
      label: 'Karar Arşivi',
      path: '/archive',
      icon: Inventory2OutlinedIcon,
      visible: Boolean(unit && can('arsiv', 'read')),
    },
    {
      label: 'Toplantı Duyuruları',
      path: '/duyurular',
      icon: CampaignOutlinedIcon,
      visible: Boolean(unit && can('oylama', 'read')),
    },
    {
      label: 'Kurul Kullanıcıları',
      path: '/users',
      icon: PeopleIcon,
      visible: Boolean(unit && can('users', 'read')),
    },
    {
      label: 'Roller ve Yetkiler',
      path: '/roles',
      icon: SecurityOutlinedIcon,
      visible: Boolean(unit && can('roles', 'read')),
    },
    {
      label: 'İşlem Kayıtları',
      path: '/logs',
      icon: AssignmentOutlinedIcon,
      visible: Boolean(unit && can('logs', 'read')),
    },
    {
      label: 'Kullanım Kılavuzu',
      path: '/user-manual',
      icon: MenuBookOutlinedIcon,
      visible: !mustChangePassword,
    },
  ].filter((item) => item.visible);

  return (
    <Dialog
      fullScreen
      open={Boolean(open)}
      onClose={onClose}
      TransitionComponent={Fade}
      transitionDuration={200}
      aria-labelledby="quick-menu-title"
      sx={{
        zIndex: 99999,
        '& .MuiDialog-paper': {
          bgcolor: '#0a1633 !important',
          backgroundImage: `radial-gradient(circle at 50% 25%, #102554 0%, ${NAVY} 60%, #070f24 100%)`,
          color: '#ffffff',
          m: 0,
          p: { xs: 2.5, sm: 4, md: 6 },
          overflowY: 'auto',
        },
      }}
    >
      <Box sx={{ maxWidth: 1100, mx: 'auto', width: '100%', pt: { xs: 2, md: 3 } }}>
        {/* Üst Kısım: Başlık ve Kapatma Butonu */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: { xs: 4, md: 6 },
            pb: 2,
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 4,
                height: 28,
                bgcolor: YELLOW,
                borderRadius: 1,
              }}
            />
            <Box>
              <Typography
                id="quick-menu-title"
                component="h2"
                sx={{
                  fontSize: { xs: '1.25rem', sm: '1.6rem' },
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  color: '#ffffff',
                }}
              >
                Hızlı Menü
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                Erişmek istediğiniz işlemi seçin
              </Typography>
            </Box>
          </Box>

          <IconButton
            onClick={onClose}
            aria-label="Hızlı menüyü kapat"
            sx={{
              bgcolor: 'rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              borderRadius: '50%',
              p: 1.2,
              transition: 'all 150ms ease',
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                transform: 'rotate(90deg)',
              },
            }}
          >
            <CloseIcon fontSize="medium" />
          </IconButton>
        </Box>

        {/* Izgara (Grid) Kısayol Butonları */}
        <Box
          role="menu"
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            gap: { xs: 2, sm: 3 },
          }}
        >
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <ButtonBase
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1.5,
                  p: 3,
                  borderRadius: 3,
                  bgcolor: 'rgba(255, 255, 255, 0.04)',
                  border: '1.5px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  transition: 'all 200ms ease',
                  minHeight: 120,
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.09)',
                    borderColor: YELLOW,
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                    '& .quick-icon': {
                      color: YELLOW,
                      transform: 'scale(1.1)',
                    },
                    '& .quick-label': {
                      color: YELLOW,
                    },
                  },
                }}
              >
                <Box
                  className="quick-icon"
                  sx={{
                    color: '#cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 200ms ease',
                  }}
                >
                  <Icon sx={{ fontSize: 34 }} />
                </Box>
                <Typography
                  className="quick-label"
                  sx={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    transition: 'color 200ms ease',
                  }}
                >
                  {item.label}
                </Typography>
              </ButtonBase>
            );
          })}
        </Box>

        {/* ESC Bilgisi */}
        <Box sx={{ mt: 5, textAlign: 'right' }}>
          <Typography sx={{ color: '#64748b', fontSize: '0.8rem' }}>
            ESC tuşu ile kapatabilirsiniz
          </Typography>
        </Box>
      </Box>
    </Dialog>
  );
}