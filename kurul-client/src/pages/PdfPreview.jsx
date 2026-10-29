import React, { useEffect, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Typography,
} from '@mui/material';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';

import {
  apiRequest,
  readApiBlob,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function PdfPreview() {
  const location = useLocation();
  const params = useParams();
  const { token, unit } = useAuth();

  const queryId = new URLSearchParams(location.search).get('id');

  const requestedId =
    params.id ??
    queryId ??
    location.state?.decision?.id;

  return (
    <DocumentPreview
      key={`${requestedId ?? ''}:${unit?.code ?? ''}:${token ?? ''}`}
      requestedId={requestedId}
    />
  );
}

function DocumentPreview({ requestedId }) {
  const navigate = useNavigate();
  const location = useLocation();

  const decisionId = Number(requestedId);

  const validId =
    requestedId != null &&
    Number.isSafeInteger(decisionId) &&
    decisionId > 0 &&
    decisionId <= 2147483647;

  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (
      validId &&
      location.pathname !== `/tutanak/${decisionId}`
    ) {
      navigate(`/tutanak/${decisionId}`, { replace: true });
    }
  }, [validId, decisionId, location.pathname, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let createdUrl = '';

    setLoading(true);
    setError('');
    setPdfUrl('');

    async function load() {
      try {
        if (!validId) {
          throw new Error('Geçerli bir karar kimliği bulunamadı.');
        }

        const response = await apiRequest(
          `/api/decisions/${decisionId}/pdf`,
          { signal: controller.signal }
        );

        const contentType = (
          response.headers.get('Content-Type') || ''
        )
          .split(';')[0]
          .trim()
          .toLowerCase();

        if (contentType !== 'application/pdf') {
          throw new Error('Sunucudan beklenen PDF yanıtı alınamadı.');
        }

        const blob = await readApiBlob(response);

        if (!blob.size) {
          throw new Error('Sunucu boş bir PDF dosyası gönderdi.');
        }

        if (!active) return;

        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      } catch (err) {
        if (active && err?.name !== 'AbortError') {
          setError(err.message || 'PDF yüklenemedi.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      controller.abort();

      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [validId, decisionId, refresh]);

  const download = () => {
    if (!pdfUrl) return;

    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `Kurul-Karari-${decisionId}.pdf`;

    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#525659',
        p: { xs: 1.5, md: 3 },
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
            mb: 2,
          }}
        >
          <Button
            variant="contained"
            startIcon={<ArrowBackIcon />}
            sx={{ bgcolor: '#333' }}
            onClick={() =>
              navigate(
                validId ? `/oylama/${decisionId}` : '/dashboard'
              )
            }
          >
            Karara Dön
          </Button>

          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            disabled={loading || !pdfUrl}
            onClick={download}
          >
            PDF İndir
          </Button>
        </Box>

        <Alert severity="info" sx={{ mb: 2 }}>
          İmza atan üyelerin imzaları, adlarının altındaki kutuda gösterilir.
          İmzalar sistem içi onay imzasıdır; nitelikli elektronik imza değildir.
          Ek dosyaların içerikleri PDF’ye birleştirilmez.
        </Alert>

        {loading && (
          <Box sx={{ bgcolor: 'white', p: 3, borderRadius: 1 }}>
            <Typography sx={{ mb: 2 }}>
              PDF oluşturuluyor…
            </Typography>
            <LinearProgress />
          </Box>
        )}

        {error && (
          <Alert
            severity="error"
            action={
              validId ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  Tekrar dene
                </Button>
              ) : undefined
            }
          >
            {error}
          </Alert>
        )}

        {!loading && !error && pdfUrl && (
          <>
            <Box
              component="iframe"
              title={`Kurul kararı ${decisionId} PDF önizlemesi`}
              src={pdfUrl}
              sx={{
                display: 'block',
                width: '100%',
                height: '80vh',
                minHeight: 500,
                border: 0,
                bgcolor: 'white',
              }}
            />

            <Typography
              variant="body2"
              sx={{ mt: 1.5, color: 'white' }}
            >
              Önizleme açılmazsa PDF İndir düğmesini kullanabilirsiniz.
              Yazdırmak için PDF görüntüleyicisinin yazdırma düğmesine basın.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}