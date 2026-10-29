import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Container } from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { HeaderView, COLORS } from './Header';
import SideMenu from './SideMenu';
import { ShellContext } from './ShellContext';
import Footer from './Footer';
import { useAuth } from '../contexts/AuthContext';

const DASHBOARD_PATHS = [
  '/dashboard',
  '/bolum-kurulu-dashboard',
  '/bilgisayar-abd-dashboard',
  '/bilisim-abd-dashboard',
];

// Sayfa kendi başlığını vermediyse adresten türetilen varsayılan başlıklar.
const DEFAULT_TITLES = [
  ['/yeni-karar', 'Yeni Karar'],
  ['/archive', 'Karar Arşivi'],
  ['/users', 'Kullanıcı Yönetimi'],
  ['/roles', 'Rol Yönetimi'],
  ['/logs', 'İşlem Kayıtları'],
  ['/user-manual', 'Kullanım Kılavuzu'],
  ['/oylama', 'Karar Detayı'],
  ['/tutanak', 'Karar Tutanağı'],
  ['/yetkisiz-erisim', 'Erişim Yetkisi Yok'],
];

// Giriş yapılmış tüm iç sayfaların ortak kabuğu:
// üst çubuk + başlık bandı + sol menü hep yerinde kalır, yalnızca sağdaki içerik değişir.
export default function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Kurul seçili değilse (ör. giriş yapmadan açılan kılavuz) sol menü yoktur; içerik tam genişlikte.
  const { unit } = useAuth();

  const [meta, setMeta] = useState(null);
  const handlerRef = useRef(null);

  const register = useCallback((next) => setMeta(next), []);
  const unregister = useCallback(() => {
    handlerRef.current = null;
    setMeta(null);
  }, []);

  const shellValue = useMemo(
    () => ({ register, unregister, handlerRef }),
    [register, unregister]
  );

  const isDashboard = DASHBOARD_PATHS.includes(pathname);

  const fallbackTitle =
    DEFAULT_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] || '';

  const title = meta?.title || fallbackTitle;

  // Sayfa kendi geri düğmesini verdiyse o kullanılır; yoksa panele dönüş eklenir.
  const hasPageBack = Boolean(meta?.hasBack);
  const showDefaultBack = !hasPageBack && !isDashboard;

  const onBackClick =
    hasPageBack || showDefaultBack
      ? () => {
          if (hasPageBack && handlerRef.current) {
            handlerRef.current();
          } else {
            navigate('/dashboard');
          }
        }
      : undefined;

  const backText = hasPageBack
    ? meta?.backText
    : showDefaultBack
      ? 'Kurul paneline dön'
      : undefined;

  return (
    <ShellContext.Provider value={shellValue}>
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: COLORS.background,
          color: COLORS.title,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <HeaderView title={title} onBackClick={onBackClick} backText={backText} />

        <Container
          maxWidth={false}
          sx={{
            flexGrow: 1,
            py: { xs: 2, md: 4 },
            px: { xs: 2, md: 6 },
            maxWidth: 1600,
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                md: unit ? '280px minmax(0, 1fr)' : 'minmax(0, 1fr)',
              },
              gap: { xs: 2, md: 4 },
              alignItems: 'start',
            }}
          >
            <SideMenu />

            {/* Eski sayfaların kendi tam ekran kabuğu varsa içerik alanına sığması için yumuşatılır */}
            <Box
              sx={{
                minWidth: 0,
                '& > .MuiBox-root': {
                  minHeight: 'auto !important',
                },
              }}
            >
              <Outlet />
            </Box>
          </Box>
        </Container>
        <Footer/>
      </Box>
    </ShellContext.Provider>
  );
}
