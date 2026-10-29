import React from 'react';
import { Box, ButtonBase, Paper, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';

import { useAuth } from '../contexts/AuthContext';
import { COLORS } from './Header';

const DASHBOARD_PATHS = [
  '/dashboard',
  '/bolum-kurulu-dashboard',
  '/bilgisayar-abd-dashboard',
  '/bilisim-abd-dashboard',
];

// Üniversite sayfasındaki sol menü kartı. Bağlantılar kullanıcının yetkisine göre görünür.
// Kullanım kılavuzu üst çubukta olduğundan burada tekrarlanmaz; işlem kayıtları yalnızca yöneticiye açıktır.
export default function SideMenu() {
  const { can, unit } = useAuth();
  const { pathname } = useLocation();

  const items = [
    {
      label: 'Ana Sayfa',
      path: '/home',
      icon: HomeOutlinedIcon,
      visible: Boolean(unit),
      active: pathname === '/home',
    },
    {
      label: 'Toplantı Duyuruları',
      path: '/duyurular',
      icon: CampaignOutlinedIcon,
      visible: unit && can('oylama', 'read'),
      active: pathname === '/duyurular',
    },
    {
      label: 'Kurul Kararları',
      path: '/dashboard',
      icon: DescriptionOutlinedIcon,
      visible: unit && can('oylama', 'read'),
      active: DASHBOARD_PATHS.includes(pathname) || pathname.startsWith('/oylama/'),
    },
    {
      label: 'Yeni Karar',
      path: '/yeni-karar',
      icon: NoteAddOutlinedIcon,
      visible: unit && can('yeni-karar', 'write'),
      active: pathname === '/yeni-karar',
    },
    {
      label: 'Karar Arşivi',
      path: '/archive',
      icon: Inventory2OutlinedIcon,
      visible: unit && can('arsiv', 'read'),
      active: pathname === '/archive',
    },
    {
      label: 'Kullanıcılar',
      path: '/users',
      icon: PeopleIcon,
      visible: unit && can('users', 'read'),
      active: pathname === '/users',
    },
    {
      label: 'Roller',
      path: '/roles',
      icon: SecurityOutlinedIcon,
      visible: unit && can('roles', 'read'),
      active: pathname === '/roles',
    },
    {
      label: 'İşlem Kayıtları',
      path: '/logs',
      icon: AssignmentOutlinedIcon,
      visible: unit && can('logs', 'read'),
      active: pathname === '/logs',
    },
  ].filter((item) => item.visible);

  // Oturum yokken (ör. giriş ekranından açılan kılavuz) boş kutu gösterilmez.
  if (items.length === 0) return null;

  return (
    <Paper
      component="aside"
      aria-label="Yan menü"
      elevation={0}
      sx={{
        borderRadius: 2,
        px: 1.5,
        py: 1,
        boxShadow: '0 2px 10px rgba(15,31,79,0.05)',
        alignSelf: 'start',
      }}
    >
      <Box component="nav">
        {items.map((item, index) => {
          const Icon = item.icon;

          return (
            <ButtonBase
              key={item.path}
              component={RouterLink}
              to={item.path}
              aria-current={item.active ? 'page' : undefined}
              sx={{
                width: '100%',
                justifyContent: 'flex-start',
                gap: 1.5,
                px: 1.5,
                py: 1.9,
                textAlign: 'left',
                color: COLORS.title,
                borderBottom:
                  index !== items.length - 1
                    ? `1px solid ${COLORS.blue}`
                    : 'none',
                bgcolor: item.active ? COLORS.blueSoft : 'transparent',
                transition: 'background-color 150ms',
                '&:hover': { bgcolor: COLORS.blueSoft },
                '&.Mui-focusVisible': {
                  outline: `2px solid ${COLORS.blue}`,
                  outlineOffset: -2,
                },
              }}
            >
              <Icon sx={{ fontSize: 20, color: COLORS.blue }} />
              <Typography
                component="span"
                sx={{
                  fontSize: '0.92rem',
                  fontWeight: item.active ? 700 : 500,
                  lineHeight: 1.4,
                }}
              >
                {item.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Paper>
  );
}
