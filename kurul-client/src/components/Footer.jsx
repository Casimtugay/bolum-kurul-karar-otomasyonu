import React from 'react';
import { Box, Container, Grid, Typography, Link } from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import PrintIcon from '@mui/icons-material/Print';
import { useAuth } from '../contexts/AuthContext';
import { COLORS } from './Header';

// Birimlere göre iletişim bilgileri (Birim koduna göre eşleşir, yoksa varsayılan gösterilir)
const UNIT_CONTACT_MAP = {
  // Teknoloji Fakültesi & Bölümleri
  TF: {
    title: 'TEKNOLOJİ FAKÜLTESİ',
    address: 'Selçuk Üniversitesi Alaeddin Keykubat Yerleşkesi Teknoloji Fakültesi PK:42075 Selçuklu / KONYA',
    email: 'tfdekanlik@selcuk.edu.tr',
    phones: [
      { text: '0(332) 223 33 73 (Öğrenci İşleri)' },
      { text: '0(332) 223 33 68 (Dekanlık)' },
      { text: '0(332) 223 33 89 (KPTO)' },
    ],
    fax: '0(332) 241 21 79',
  },
  // Fen Bilimleri Enstitüsü
  FBE: {
    title: 'FEN BİLİMLERİ ENSTİTÜSÜ',
    address: 'Selçuk Üniversitesi Alaeddin Keykubat Yerleşkesi Fen Bilimleri Enstitüsü Selçuklu / KONYA',
    email: 'fenbil@selcuk.edu.tr',
    phones: [
      { text: '0 (332) 223 24 65' },
    ],
    fax: null,
  },
};

export default function Footer() {
  const { unit } = useAuth();

  // Seçili birimin iletişim bilgisini bul ya da varsayılanı göster
  const unitKey = unit?.parentCode || unit?.code || 'TF';
  const contact = UNIT_CONTACT_MAP[unitKey] || UNIT_CONTACT_MAP.TF;
  const displayTitle = unit?.parentName || unit?.boardName || contact.title;

  return (
    <Box component="footer" sx={{ bgcolor: '#070f26', color: '#fff', mt: 'auto' }}>
      {/* 1. LOGO VE İLETİŞİM KARTLARI */}
      <Box sx={{ py: 5, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <Container maxWidth="lg">
          {/* Ortalanmış Selçuk Üniversitesi Logosu */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            <Box
              component="img"
              src="/selcuk.png"
              alt="Selçuk Üniversitesi"
              sx={{
                width: 85,
                height: 85,
                borderRadius: '50%',
                bgcolor: '#fff',
                p: 0.5,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                objectFit: 'contain',
              }}
            />
          </Box>

          <Grid container spacing={3} sx={{ justifyContent: 'center' }}>
            {/* Sol Kart: Birim Adı, Adres ve E-Posta */}
            <Grid size={{ xs: 12, md: 5.5 }}>
              <Box
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 3,
                  p: 3,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      color: COLORS.yellow,
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      letterSpacing: 0.5,
                      mb: 1.5,
                    }}
                  >
                    {displayTitle}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#cbd5e1', lineHeight: 1.7 }}>
                    {contact.address}
                  </Typography>
                </Box>

                {contact.email && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      mt: 3,
                      pt: 2,
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        bgcolor: COLORS.blue,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <EmailIcon sx={{ fontSize: 16, color: '#fff' }} />
                    </Box>
                    <Typography variant="body2" sx={{ color: '#e2e8f0' }}>
                      <strong style={{ color: COLORS.yellow }}>E-posta:</strong>{' '}
                      <Link
                        href={`mailto:${contact.email}`}
                        sx={{ color: '#fff', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {contact.email}
                      </Link>
                    </Typography>
                  </Box>
                )}
              </Box>
            </Grid>

            {/* Sağ Kart: İletişim & Faks Bilgileri */}
            <Grid size={{ xs: 12, md: 5.5 }}>
              <Box
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 3,
                  p: 3,
                  height: '100%',
                }}
              >
                <Typography
                  sx={{
                    color: COLORS.yellow,
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    letterSpacing: 0.5,
                    mb: 2,
                  }}
                >
                  İLETİŞİM/FAKS BİLGİLERİ
                </Typography>

                <Box sx={{ display: 'grid', gap: 1.5 }}>
                  {contact.phones.map((phone, idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          bgcolor: COLORS.blue,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <PhoneIcon sx={{ fontSize: 16, color: '#fff' }} />
                      </Box>
                      <Typography variant="body2" sx={{ color: '#e2e8f0' }}>
                        {phone.text}
                      </Typography>
                    </Box>
                  ))}

                  {contact.fax && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          bgcolor: COLORS.blue,
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <PrintIcon sx={{ fontSize: 16, color: '#fff' }} />
                      </Box>
                      <Typography variant="body2" sx={{ color: '#e2e8f0' }}>
                        {contact.fax}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* 2. EN ALT ÇİZGİ: TELİF VE HAKLAR */}
      <Box sx={{ bgcolor: '#050a1b', py: 2.5, textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.8rem', mb: 0.5 }}>
          © 2026 Selçuk Üniversitesi. Tüm hakları saklıdır.
        </Typography>
        <Typography variant="caption" sx={{ color: '#64748b' }}>
          <Link href="#" sx={{ color: COLORS.yellow, textDecoration: 'none', fontWeight: 700, mr: 1 }}>
           
          </Link>
        </Typography>
      </Box>
    </Box>
  );
}