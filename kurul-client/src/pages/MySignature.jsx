import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Skeleton, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';

import PageLayout from '../components/PageLayout';
import SignatureEditor, { SignaturePreview } from '../components/SignatureEditor';
import { deleteMySignature, getMySignature, saveMySignature } from '../api/signature';
import { formatDateTime } from '../components/dateUtils';
import { NAVY, BORDER } from '../styles/adminTheme';

// "İmzam": kullanıcının kayıtlı imzası. Kararları imzalarken tek tıkla kullanılır.
export default function MySignature() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMySignature()
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'İmza bilgisi alınamadı.'); });
    return () => { cancelled = true; };
  }, [refresh]);

  const save = async (image) => {
    setBusy(true);
    setError('');
    try {
      await saveMySignature(image);
      setEditing(false);
      setNotice('İmzanız kaydedildi. Kararları imzalarken bu imza kullanılabilir.');
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err?.message || 'İmza kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteMySignature();
      setNotice('Kayıtlı imzanız silindi.');
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err?.message || 'İmza silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title="İmzam">
      <Paper elevation={0} sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 3, border: `1px solid ${BORDER}` }}>
        <Typography sx={{ color: NAVY, fontWeight: 800, fontSize: '1.15rem' }}>Kayıtlı imzam</Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5, mb: 3 }}>
          Kurul kararlarını imzalarken bu imza, karar belgesinde adınızın altındaki kutuya yerleştirilir.
          Her imzalamada parolanız ayrıca sorulur. Bu imza sistem içi onay imzasıdır;
          nitelikli elektronik imza değildir.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

        {editing ? (
          <SignatureEditor
            doneLabel={busy ? 'Kaydediliyor…' : 'İmzamı kaydet'}
            onCancel={() => setEditing(false)}
            onDone={save}
          />
        ) : data === null ? (
          <Skeleton variant="rounded" height={120} />
        ) : (
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            {data.hasSignature ? (
              <Box>
                <SignaturePreview src={data.image} height={110} />
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  Son güncelleme: {formatDateTime(data.updatedAt)}
                </Typography>
              </Box>
            ) : (
              <Alert severity="info" sx={{ flex: '1 1 320px' }}>
                Henüz kayıtlı imzanız yok. Kâğıda attığınız imzanın görselini yükleyin.
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<UploadFileOutlinedIcon />}
                disabled={busy}
                onClick={() => { setNotice(''); setEditing(true); }}
                sx={{ bgcolor: NAVY, fontWeight: 800, textTransform: 'none' }}
              >
                {data.hasSignature ? 'İmzamı değiştir' : 'İmza yükle'}
              </Button>
              {data.hasSignature && (
                <Button
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  disabled={busy}
                  onClick={remove}
                  sx={{ fontWeight: 700, textTransform: 'none' }}
                >
                  Kayıtlı imzamı sil
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Paper>
    </PageLayout>
  );
}
