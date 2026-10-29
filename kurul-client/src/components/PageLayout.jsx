import React, { useContext } from 'react';
import { Box, Container } from '@mui/material';

import Header, { COLORS } from './Header';
import SideMenu from './SideMenu';
import { ShellContext } from './ShellContext';

// Sayfa içeriğini sarar ve başlık bilgisini verir.
// - AppShell içinde (giriş yapılmış tüm iç sayfalar): üst çubuk ve sol menüyü kabuk çizer,
//   burası yalnızca başlık / geri bilgisini bildirir ve içeriği olduğu gibi döndürür.
// - AppShell dışında kullanılırsa kendi üst çubuğunu ve sol menüsünü çizer.
// Kullanım:
//   <PageLayout title="Karar Detayı" onBackClick={() => navigate('/dashboard')} backText="Kurula dön">
//     ...sayfa içeriği...
//   </PageLayout>
export default function PageLayout({
  title,
  onBackClick,
  backText,
  sidebar = true,
  children,
}) {
  const shell = useContext(ShellContext);

  if (shell) {
    return (
      <>
        <Header title={title} onBackClick={onBackClick} backText={backText} />
        {children}
      </>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: COLORS.background,
        color: COLORS.title,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Header title={title} onBackClick={onBackClick} backText={backText} />

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
            gridTemplateColumns: sidebar
              ? { xs: 'minmax(0, 1fr)', md: '280px minmax(0, 1fr)' }
              : 'minmax(0, 1fr)',
            gap: { xs: 2, md: 4 },
            alignItems: 'start',
          }}
        >
          {sidebar && <SideMenu />}
          <Box sx={{ minWidth: 0 }}>{children}</Box>
        </Box>
      </Container>
    </Box>
  );
}
