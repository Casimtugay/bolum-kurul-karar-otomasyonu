import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Paper, FormControl, Select, MenuItem, Button, Container, Alert, CircularProgress } from '@mui/material';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { getUnitDisplayName } from '../data/templateData';
import { getLastUnitCode, takeReturnPath } from '../api/client';

// Girişten sonra son çalışılan (yoksa ilk) kurul kendiliğinden açılır; kurul değiştirmek için
// üst çubuktaki kurul adına tıklanır. Seçim ekranı yalnızca açılış başarısız olursa görünür.
export default function SelectUnit() {
  const navigate = useNavigate();
  const { units, selectUnit } = useAuth();

  const preferred = units.find((u) => u.code === getLastUnitCode())?.code || units[0]?.code || '';
  const [selectedCode, setSelectedCode] = useState(preferred);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(units.length > 0);
  const started = useRef(false);

  const open = async (code) => {
    if (!code) return;
    setError('');
    setBusy(true);
    try {
      // Sunucu seçilen kuruldaki rolle yeni token verir
      await selectUnit(code);
      navigate(takeReturnPath() || '/home', { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current || !preferred) return;
    started.current = true;
    void open(preferred);
    // Yalnızca ilk açılışta bir kez çalışır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (busy && !error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#f4f6f9' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress aria-label="Kurul açılıyor" />
          <Typography sx={{ mt: 2, color: '#64748b' }}>Kurulunuz açılıyor…</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f9', display: 'flex', flexDirection: 'column' }}>

      <Header title="" />

      <Container maxWidth="sm" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', my: 'auto' }}>
        <Paper elevation={4} sx={{ p: 5, borderRadius: '12px', textAlign: 'center', bgcolor: '#ffffff', borderTop: '5px solid #003366', width: '100%' }}>

          <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#003366', mb: 1 }}>
            BÖLÜM KURUL KARAR OTOMASYONU
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 4 }}>
            Çalışmak istediğiniz kurulu seçiniz
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{error}</Alert>}

          {units.length === 0 ? (
            <Alert severity="warning" sx={{ textAlign: 'left' }}>
              Üyesi olduğunuz bir kurul bulunamadı. Lütfen sistem yöneticisiyle görüşün.
            </Alert>
          ) : (
            <>
              <FormControl fullWidth sx={{ mb: 4 }}>
                <Select
                  value={selectedCode}
                  onChange={(e) => setSelectedCode(e.target.value)}
                  sx={{ textAlign: 'left', fontWeight: '500' }}
                >
                  {units.map((u) => (
                    <MenuItem key={u.code} value={u.code} sx={{ fontWeight: 600, color: '#001f3f', whiteSpace: 'normal' }}>
                      {getUnitDisplayName(u)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                variant="contained"
                fullWidth
                size="large"
                disabled={busy}
                onClick={() => open(selectedCode)}
                sx={{ bgcolor: '#003366', fontWeight: 'bold', py: 1.5, '&:hover': { bgcolor: '#002244' } }}
              >
                DEVAM ET
              </Button>
            </>
          )}

        </Paper>
      </Container>
    </Box>
  );
}
