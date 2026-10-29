import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import {
  Box,
  Typography,
  Button,
  ButtonBase,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LockResetIcon from '@mui/icons-material/LockReset';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GridViewIcon from '@mui/icons-material/GridView';
import NotificationBell from './NotificationBell';
import SearchIcon from '@mui/icons-material/Search';
import SearchModal from './SearchModal';
import QuickMenuModal from './QuickMenuModal';

import { useAuth } from '../contexts/AuthContext';
import { getCurrentUnit } from '../data/units';
import { getUnitDisplayName } from '../data/templateData';
import { ShellContext } from './ShellContext';

// Selçuk Üniversitesi web sitesiyle uyumlu renkler
export const COLORS = {
  navy: '#0f1f4f',
  navyLight: '#1a2f6b',
  blue: '#1b4a94',
  blueSoft: '#e3eefb',
  yellow: '#fcc419',
  yellowHover: '#f0b400',
  background: '#f2f4f8',
  border: '#dfe5ed',
  title: '#27385a',
  text: '#334155',
};

const ROLE_LABELS = {
  Admin: 'Yönetici',
  Baskan: 'Başkan',
  Sekreter: 'Sekreter',
  Uye: 'Üye',
  OyKullanmayan: 'Kurul görevlisi',
};

const DASHBOARD_PATHS = [
  '/dashboard',
  '/bolum-kurulu-dashboard',
  '/bilgisayar-abd-dashboard',
  '/bilisim-abd-dashboard',
];

// AppShell içindeyken sayfaların kendi <Header> çağrısı yalnızca başlık / geri
// bilgisini kabuğa bildirir; asıl üst çubuğu kabuk bir kez çizer. Böylece sayfa
// değişse bile üst çubuk ve sol menü yerinde kalır.
export default function Header(props) {
  const shell = useContext(ShellContext);
  const { title, onBackClick, backText } = props;
  

  useLayoutEffect(() => {
    if (!shell) return undefined;
    shell.register({ title, backText, hasBack: Boolean(onBackClick) });
    return () => shell.unregister();
  }, [shell, title, backText, Boolean(onBackClick)]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (shell) shell.handlerRef.current = onBackClick || null;
  });

  if (shell) return null;
  return <HeaderView {...props} />;
}

export function HeaderView({
  title,
  onBackClick,
  backText,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const {
    user,
    unit,
    token,
    logout,
    can,
    mustChangePassword,
    authChecking,
    authError,
    units = [],
    selectUnit,
  } = useAuth();

  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [anchorEl, setAnchorEl] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [unitAnchor, setUnitAnchor] = useState(null);
  const [unitBusy, setUnitBusy] = useState(false);
  const [unitError, setUnitError] = useState('');
  const [branding, setBranding] = useState(null);

  const unitCode = unit?.code;
  const accountMenuOpen = Boolean(anchorEl);
  const unitMenuOpen = Boolean(unitAnchor);

  const sessionReady = Boolean(
    token &&
    user &&
    !mustChangePassword &&
    !authChecking &&
    !authError
  );

  useEffect(() => {
    let cancelled = false;

    setBranding(null);

    if (!unitCode || !sessionReady) {
      return undefined;
    }

    getCurrentUnit()
      .then((data) => {
        if (!cancelled && data.code === unitCode) {
          setBranding({ token, data });
        }
      })
      .catch(() => {
        // Kurul logosu alınamazsa üniversite logosu gösterilir.
      });

    return () => {
      cancelled = true;
    };
  }, [unitCode, token, sessionReady]);

  useEffect(() => {
    setAnchorEl(null);
    setQuickOpen(false);
    setUnitAnchor(null);
  }, [pathname]);

  const currentBranding =
    branding?.token === token &&
    branding?.data.code === unitCode
      ? branding.data
      : null;

  const roleLabel =
    user?.role === 'Admin'
      ? 'Yönetici'
      : unit?.duty || ROLE_LABELS[user?.role] || 'Hesabım';

  // Sol üstte gösterilen kurul bilgisi (ör. Teknoloji Fakültesi / Bilgisayar Mühendisliği Bölüm Kurulu)
  const boardName = currentBranding?.boardName || unit?.boardName || '';
  const parentName = currentBranding?.parentName || unit?.parentName || '';
  const hasUnit = Boolean(sessionReady && unit && boardName);

  const closeAccount = () => setAnchorEl(null);
  const closeQuick = () => setQuickOpen(false);
  const closeUnit = () => {
    if (!unitBusy) setUnitAnchor(null);
  };

  // Listeden başka bir kurul seçilince sunucudan yeni oturum alınır ve kurul paneline geçilir.
  const handleSwitchUnit = async (code) => {
    if (unitBusy) return;

    if (code === unit?.code) {
      setUnitAnchor(null);
      return;
    }

    setUnitBusy(true);
    setUnitError('');

    try {
      await selectUnit(code);
      setUnitAnchor(null);
      navigate('/home');
    } catch (error) {
      setUnitError(error?.message || 'Kurul değiştirilemedi.');
    } finally {
      setUnitBusy(false);
    }
  };

  const go = (path) => {
    closeAccount();
    closeQuick();
    closeUnit();
    navigate(path);
  };

  const handleLogout = () => {
    closeAccount();
    logout();
    navigate('/', { replace: true });
  };

  const homePath = !token
    ? '/'
    : mustChangePassword
      ? '/parola-degistir'
      : unit
        ? '/home'
        : '/select-unit';

  // top: true olanlar üst çubukta da görünür, hepsi HIZLI MENÜ'de yer alır.
  const navigation = [
    {
      label: 'Kararlar',
      path: '/dashboard',
      icon: HomeOutlinedIcon,
      top: true,
      visible: sessionReady && unit && can('oylama', 'read'),
      active:
        DASHBOARD_PATHS.includes(pathname) ||
        pathname.startsWith('/oylama/') ||
        pathname === '/tutanak' ||
        pathname.startsWith('/tutanak/'),
    },
    {
  label: 'Duyurular',
  path: '/duyurular',
  icon: CampaignOutlinedIcon,
  top: true,
  visible: sessionReady && unit && can('oylama', 'read'),
  active: pathname === '/duyurular',
},
    {
      label: 'Yeni Karar',
      path: '/yeni-karar',
      icon: NoteAddOutlinedIcon,
      top: true,
      visible: sessionReady && unit && can('yeni-karar', 'write'),
      active: pathname === '/yeni-karar',
    },
    {
      label: 'Karar Arşivi',
      path: '/archive',
      icon: Inventory2OutlinedIcon,
      top: true,
      visible: sessionReady && unit && can('arsiv', 'read'),
      active: pathname === '/archive',
    },
    {
      label: 'Kullanıcılar',
      path: '/users',
      icon: PeopleIcon,
      visible: sessionReady && unit && can('users', 'read'),
      active: pathname === '/users',
    },
    {
      label: 'Roller',
      path: '/roles',
      icon: SecurityOutlinedIcon,
      visible: sessionReady && unit && can('roles', 'read'),
      active: pathname === '/roles',
    },
    {
      label: 'İşlem Kayıtları',
      path: '/logs',
      icon: AssignmentOutlinedIcon,
      visible: sessionReady && unit && can('logs', 'read'),
      active: pathname === '/logs',
    },
    {
      label: 'Kullanım Kılavuzu',
      path: '/user-manual',
      icon: MenuBookOutlinedIcon,
      top: true,
      visible: !mustChangePassword,
      active: pathname === '/user-manual',
    },
  ].filter((item) => item.visible);

  const topLinks = navigation.filter((item) => item.top);

  const menuItemSx = {
    py: 1.4,
    color: COLORS.navy,
    fontWeight: 600,
    fontSize: '0.88rem',
    '&:hover': { bgcolor: COLORS.blueSoft },
    '&.Mui-selected, &.Mui-selected:hover': {
      bgcolor: COLORS.blueSoft,
      fontWeight: 700,
    },
  };

  const menuPaperSx = {
    mt: 1,
    minWidth: 240,
    maxWidth: 'calc(100vw - 32px)',
    borderRadius: 2,
    overflow: 'hidden',
    border: `1px solid ${COLORS.border}`,
    boxShadow: '0 10px 30px rgba(15,31,79,0.18)',
  };

  return (
    <Box component="header" sx={{ width: '100%', bgcolor: '#fff' }}>
      {/* LACİVERT ÜST ÇUBUK */}
      <Box
        sx={{
          minHeight: 96,
          bgcolor: COLORS.navy,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: { xs: 2, md: 4 },
        }}
      >
        {/* Sol taraf: logo + çalışılan kurul */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1, md: 2 },
            minWidth: 0,
          }}
        >
        <ButtonBase
          component={RouterLink}
          to={homePath}
          aria-label="Selçuk Üniversitesi — başlangıç sayfası"
          sx={{
            display: 'flex',
            alignItems: 'center',
            py: 0.5,
            pr: 1.5,
            flexShrink: 0,
            borderRadius: 1,
            '&.Mui-focusVisible': {
              outline: `3px solid ${COLORS.yellow}`,
              outlineOffset: 2,
            },
          }}
        >
          <Box
            component="img"
            src="/selcukuni.png"
            alt="Selçuk Üniversitesi"
            sx={{
             height: { xs: 52, sm: 68, md: 72 }, 
              width: 'auto',
              maxWidth: { xs: 220, sm: 300, md: 360 },
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </ButtonBase>

        {hasUnit ? (
          <>
            <Button
              id="header-unit-button"
              aria-controls={unitMenuOpen ? 'header-unit-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={unitMenuOpen ? 'true' : undefined}
              onClick={(event) => setUnitAnchor(event.currentTarget)}
              startIcon={<AccountBalanceOutlinedIcon />}
              endIcon={<KeyboardArrowDownIcon />}
              sx={{
                color: '#fff',
                bgcolor: unitMenuOpen ? COLORS.navyLight : 'transparent',
                border: '1px solid rgba(255,255,255,0.45)',
                borderRadius: 2,
                px: { xs: 1, md: 1.5 },
                py: 0.6,
                minWidth: 0,
                maxWidth: { xs: 190, sm: 340, lg: 460 },
                textTransform: 'none',
                textAlign: 'left',
                '&:hover': {
                  bgcolor: COLORS.navyLight,
                  borderColor: '#fff',
                },
                '&.Mui-focusVisible': {
                  outline: `2px solid ${COLORS.yellow}`,
                  outlineOffset: 2,
                },
                '& .MuiButton-startIcon, & .MuiButton-endIcon': {
                  color: '#fff',
                },
                '& .MuiButton-startIcon': {
                  display: { xs: 'none', sm: 'inline-flex' },
                },
              }}
            >
              <Box sx={{ textAlign: 'left', minWidth: 0 }}>
                {parentName && (
                  <Typography
                    component="div"
                    sx={{
                      fontSize: '0.68rem',
                      color: COLORS.yellow,
                      fontWeight: 600,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {parentName}
                  </Typography>
                )}
                <Typography
                  component="div"
                  sx={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {boardName}
                </Typography>
              </Box>
            </Button>

            <Menu
              id="header-unit-menu"
              anchorEl={unitAnchor}
              open={unitMenuOpen}
              onClose={closeUnit}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                list: {
                  'aria-labelledby': 'header-unit-button',
                  sx: { py: 0 },
                },
                paper: { sx: { ...menuPaperSx, minWidth: 300 } },
              }}
            >
              <Box
                sx={{
                  px: 2,
                  py: 2,
                  bgcolor: COLORS.navy,
                  borderBottom: `3px solid ${COLORS.yellow}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: COLORS.yellow, fontWeight: 700 }}
                >
                  ÇALIŞTIĞINIZ KURUL
                </Typography>
                {parentName && (
                  <Typography
                    variant="body2"
                    sx={{ color: 'rgba(255,255,255,0.8)', mt: 0.5 }}
                  >
                    {parentName}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 700, color: '#fff', overflowWrap: 'anywhere' }}
                >
                  {boardName}
                </Typography>
              </Box>

              {units.length > 1 && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    px: 2,
                    pt: 1.5,
                    pb: 0.5,
                    color: '#64748b',
                    fontWeight: 700,
                  }}
                >
                  KURUL DEĞİŞTİR
                </Typography>
              )}

              {unitError && (
                <Typography
                  variant="caption"
                  sx={{ display: 'block', px: 2, py: 1, color: '#b42318' }}
                >
                  {unitError}
                </Typography>
              )}

              {units.map((item) => {
                const isCurrent = item.code === unit?.code;

                return (
                  <MenuItem
                    key={item.code}
                    selected={isCurrent}
                    disabled={unitBusy}
                    onClick={() => handleSwitchUnit(item.code)}
                    sx={{
                      ...menuItemSx,
                      whiteSpace: 'normal',
                      lineHeight: 1.5,
                      alignItems: 'flex-start',
                    }}
                  >
                    <ListItemIcon sx={{ color: COLORS.blue, mt: 0.3 }}>
                      {isCurrent ? (
                        <CheckRoundedIcon fontSize="small" />
                      ) : (
                        <SwapHorizIcon fontSize="small" />
                      )}
                    </ListItemIcon>
                    {getUnitDisplayName(item)}
                  </MenuItem>
                );
              })}
            </Menu>
          </>
        ) : (
          <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'left' }}>
            <Typography
              component="div"
              sx={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: 0.5, lineHeight: 1.2 }}
            >
              Kurul Kararı
            </Typography>
            <Typography
              component="div"
              sx={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: 0.5, lineHeight: 1.2 }}
            >
              Otomasyonu
            </Typography>
          </Box>
        )}
        </Box>

        {/* Sağ taraf: bağlantılar, hızlı menü, hesap */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1, md: 1.5 },
            minWidth: 0,
          }}
        >
          <Box
            component="nav"
            aria-label="Ana menü"
            sx={{
              display: { xs: 'none', lg: 'flex' },
              alignItems: 'center',
              mr: 1.5,
            }}
          >
            {topLinks.map((item, index) => (
              <React.Fragment key={item.path}>
                {index > 0 && (
                  <Box
                    aria-hidden
                    sx={{
                      width: '1px',
                      height: 16,
                      bgcolor: 'rgba(255,255,255,0.45)',
                    }}
                  />
                )}
                <ButtonBase
                  component={RouterLink}
                  to={item.path}
                  aria-current={item.active ? 'page' : undefined}
                  sx={{
                    px: 1.75,
                    py: 1,
                    color: item.active ? COLORS.yellow : '#fff',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    '&:hover': { color: COLORS.yellow },
                    '&.Mui-focusVisible': {
                      outline: `2px solid ${COLORS.yellow}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  {item.label}
                </ButtonBase>
              </React.Fragment>
            ))}
          </Box>

          {navigation.length > 0 && (
            <Button
              id="header-quick-button"
              aria-haspopup="dialog"
              aria-expanded={quickOpen ? 'true' : undefined}
              onClick={() => setQuickOpen(true)}
              startIcon={<GridViewIcon sx={{ fontSize: '18px !important' }} />}
              sx={{
                bgcolor: COLORS.yellow,
                color: COLORS.navy,
                borderRadius: '999px',
                px: { xs: 1.5, sm: 2.25 },
                py: 0.8,
                minWidth: 0,
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: 0.4,
                boxShadow: 'none',
                '&:hover': { bgcolor: COLORS.yellowHover },
                '&.Mui-focusVisible': {
                  outline: '2px solid #fff',
                  outlineOffset: 2,
                },
              }}
            >
              HIZLI MENÜ
            </Button>
          )}

          {/* KULLANICI PROFİLİ VE BİLDİRİM ZİLİ */}
          {token && user ? (
            <>
            {/* ARAMA BUTONU */}
          <IconButton
            onClick={() => setSearchOpen(true)}
            sx={{
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.45)',
              borderRadius: 2,
              p: 1,
              mr: 1,
              '&:hover': {
                bgcolor: COLORS.navyLight,
                borderColor: '#fff',
              },
            }}
            title="Arama Yap"
          >
            <SearchIcon sx={{ fontSize: 20 }} />
          </IconButton>
            
              {/* BİLDİRİM ZİLİ (Hızlı Menü ile Profil Butonu Arasında) */}
              <NotificationBell scope={unitCode} />
              <Button
                id="header-account-button"
                aria-controls={
                  accountMenuOpen ? 'header-account-menu' : undefined
                }
                aria-haspopup="true"
                aria-expanded={accountMenuOpen ? 'true' : undefined}
                onClick={(event) => setAnchorEl(event.currentTarget)}
                startIcon={<AccountCircleOutlinedIcon />}
                endIcon={<KeyboardArrowDownIcon />}
                sx={{
                  color: '#fff',
                  bgcolor: accountMenuOpen
                    ? COLORS.navyLight
                    : 'transparent',
                  border: '1px solid rgba(255,255,255,0.45)',
                  borderRadius: 2,
                  px: { xs: 1, md: 1.5 },
                  py: 0.6,
                  minWidth: 0,
                  flexShrink: 0,
                  textTransform: 'none',
                  '&:hover': {
                    bgcolor: COLORS.navyLight,
                    borderColor: '#fff',
                  },
                  '&.Mui-focusVisible': {
                    outline: `2px solid ${COLORS.yellow}`,
                    outlineOffset: 2,
                  },
                  '& .MuiButton-startIcon, & .MuiButton-endIcon': {
                    color: '#fff',
                  },
                  '& .MuiButton-startIcon': {
                    display: { xs: 'none', sm: 'inline-flex' },
                  },
                }}
              >
                <Box sx={{ textAlign: 'left', minWidth: 0 }}>
                  <Typography
                    component="div"
                    sx={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      maxWidth: { xs: 90, sm: 200 },
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {user.name}
                  </Typography>

                  <Typography
                    component="div"
                    sx={{
                      fontSize: '0.68rem',
                      color: COLORS.yellow,
                      mt: 0.1,
                    }}
                  >
                    {roleLabel}
                  </Typography>
                </Box>
              </Button>

              <Menu
                id="header-account-menu"
                anchorEl={anchorEl}
                open={accountMenuOpen}
                onClose={closeAccount}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                  list: {
                    'aria-labelledby': 'header-account-button',
                    sx: { py: 0 },
                  },
                  paper: { sx: menuPaperSx },
                }}
              >
                <Box
                  sx={{
                    px: 2,
                    py: 2,
                    bgcolor: COLORS.navy,
                    borderBottom: `3px solid ${COLORS.yellow}`,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      color: '#fff',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {user.name}
                  </Typography>

                  <Typography
                    variant="caption"
                    sx={{ color: COLORS.yellow }}
                  >
                    {roleLabel}
                  </Typography>
                </Box>

                <MenuItem
                  onClick={() => go('/parola-degistir')}
                  sx={menuItemSx}
                >
                  <ListItemIcon sx={{ color: COLORS.blue }}>
                    <LockResetIcon fontSize="small" />
                  </ListItemIcon>
                  Parolamı Değiştir
                </MenuItem>

                <MenuItem
                  onClick={() => go('/imzam')}
                  sx={menuItemSx}
                >
                  <ListItemIcon sx={{ color: COLORS.blue }}>
                    <DrawOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  İmzam
                </MenuItem>

                <Divider />

                <MenuItem
                  onClick={handleLogout}
                  sx={{
                    ...menuItemSx,
                    color: '#b42318',
                    '&:hover': { bgcolor: '#fff1f0' },
                  }}
                >
                  <ListItemIcon sx={{ color: 'inherit' }}>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  Güvenli Çıkış
                </MenuItem>
              </Menu>
            </>
          ) : (
            <IconButton
              component={RouterLink}
              to="/"
              aria-label="Giriş yap"
              sx={{
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.45)',
                '&:hover': { bgcolor: COLORS.navyLight },
              }}
            >
              <AccountCircleOutlinedIcon />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* TAM EKRAN ARAMA VE HIZLI MENÜ KATMANLARI */}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickMenuModal open={quickOpen} onClose={() => setQuickOpen(false)} />
   
      {/* SAYFA BAŞLIĞI BANDI: sol tarafta mavi geçişli blok, başlık ve breadcrumb */}
      {(title || onBackClick) && (
        <Box
          sx={{
            position: 'relative',
            bgcolor: '#fff',
            minHeight: 120,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Box
            aria-hidden
            sx={{
              display: { xs: 'none', md: 'block' },
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 280,
              background:
                'linear-gradient(90deg, #0f3b8c 0%, #1b4a94 45%, rgba(255,255,255,0) 100%)',
            }}
          />

          <Box
            sx={{
              position: 'relative',
              flex: 1,
              minWidth: 0,
              ml: { xs: 0, md: '312px' },
              px: { xs: 2, md: 0 },
              pr: { md: 4 },
              py: 2.5,
            }}
          >
            {title && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  aria-hidden
                  sx={{ width: 24, height: 2, bgcolor: COLORS.blue, flexShrink: 0 }}
                />
                <Typography
                  component="h1"
                  sx={{
                    color: COLORS.title,
                    fontSize: { xs: '1.35rem', md: '1.9rem' },
                    fontWeight: 700,
                    lineHeight: 1.3,
                  }}
                >
                  {title}
                </Typography>
                <Box
                  aria-hidden
                  sx={{
                    flex: 1,
                    minWidth: 24,
                    height: 2,
                    bgcolor: COLORS.blue,
                  }}
                />
              </Box>
            )}

            <Box
              sx={{
                mt: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Typography
                component="nav"
                aria-label="Sayfa yolu"
                sx={{ fontSize: '0.88rem', color: COLORS.blue, display: 'flex', alignItems: 'center' }}
              >
                {/* 1. Eğer zaten Ana Sayfa'daysak sadece tek bir aktif metin göster */}
                {title === 'Ana Sayfa' || title === 'Anasayfa' ? (
                  <Box
                    component="span"
                    sx={{ color: '#0f172a', fontWeight: 600 }}
                  >
                    Ana Sayfa
                  </Box>
                ) : (
                  /* 2. Başka bir sayfadaysak: 'Ana Sayfa' link olsun, yanına '/ Sayfa Başlığı' gelsin */
                  <>
                    <Box
                      component={RouterLink}
                      to={homePath || '/home'}
                      sx={{
                        color: COLORS.blue,
                        textDecoration: 'none',
                        cursor: 'pointer',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      Ana Sayfa
                    </Box>
                    {title && (
                      <>
                        <Box component="span" sx={{ mx: 1, color: '#94a3b8' }}>/</Box>
                        <Box component="span" sx={{ color: '#0f172a', fontWeight: 600 }}>
                          {title}
                        </Box>
                      </>
                    )}
                  </>
                )}
              </Typography>

              {onBackClick && (
                <Button
                  size="small"
                  startIcon={<ArrowBackIcon fontSize="small" />}
                  onClick={onBackClick}
                  sx={{
                    color: COLORS.blue,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: 1.5,
                    px: 1.5,
                    '&:hover': { bgcolor: COLORS.blueSoft },
                  }}
                >
                  {backText || 'Geri dön'}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
