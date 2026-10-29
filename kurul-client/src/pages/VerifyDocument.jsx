import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';

import { checkVerificationFile, getVerification } from '../api/verify';
import { formatLongDate } from '../components/dateUtils';
import selcukLogo from '../assets/selcuk.png';

// PDF'deki karekodun açtığı sayfa: kararın güncel durumu ve imzaları.
// Giriş gerekmez; kod tahmin edilemez ve yalnızca belgeyi elinde tutan kişide bulunur.

const NAVY = '#0f1f4f';

const STATUS = {
  ImzaBekliyor: { label: 'İmza sürecinde', color: '#b45309', bg: '#fef3c7' },
  Imzalandi: { label: 'İmzaları tamamlandı', color: '#15803d', bg: '#dcfce7' },
  IptalEdildi: { label: 'İPTAL EDİLDİ', color: '#b91c1c', bg: '#fee2e2' },
  Reddedildi: { label: 'Reddedildi', color: '#b91c1c', bg: '#fee2e2' },
  Oylamada: { label: 'Oylamada', color: '#1d4ed8', bg: '#dbeafe' },
};

const formatTime = (value) =>
  value
    ? new Date(value.endsWith?.('Z') ? value : `${value}Z`).toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
      })
    : '';

const FILE_RESULT = {
  final: {
    severity: 'success',
    text: 'Dosya, imzaları tamamlanmış ve mühürlenmiş karar PDF’siyle birebir aynı.',
  },
  signing: {
    severity: 'info',
    text: 'Dosya, imzaya esas sabit karar metniyle birebir aynı. İmzaların güncel durumu yukarıdadır.',
  },
  none: {
    severity: 'error',
    text: 'Dosya bu kararın kayıtlı PDF’lerinden hiçbiriyle eşleşmiyor. Belge değiştirilmiş olabilir.',
  },
};

export default function VerifyDocument() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(code || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(code));
  const [fileResult, setFileResult] = useState(null);
  const [fileBusy, setFileBusy] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFileResult(null);
    setError('');
    setInput(code || '');
    if (!code) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    getVerification(code)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err?.message || 'Doğrulama yapılamadı.'))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [code]);

  const submitCode = (event) => {
    event.preventDefault();
    const value = input.trim();
    if (value) navigate(`/dogrula/${encodeURIComponent(value)}`);
  };

  const checkFile = async (file) => {
    if (!file) return;
    setFileBusy(true);
    setFileResult(null);
    try {
      setFileResult(await checkVerificationFile(data.code, file));
    } catch (err) {
      setFileResult({ error: err?.message || 'Dosya kontrol edilemedi.' });
    } finally {
      setFileBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const status = STATUS[data?.status] || { label: data?.status, color: '#475569', bg: '#f1f5f9' };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f2f4f8', py: { xs: 3, sm: 6 }, px: 2 }}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: 640,
          mx: 'auto',
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          borderTop: `5px solid ${NAVY}`,
          border: '1px solid #dfe5ed',
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box component="img" src={selcukLogo} alt="Selçuk Üniversitesi" sx={{ width: 64, height: 64 }} />
          <Typography sx={{ color: NAVY, fontWeight: 800, mt: 1, fontSize: '1.15rem' }}>
            Kurul Kararı Doğrulama
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            PDF’nin altındaki doğrulama kodunu girin veya karekodu okutun.
          </Typography>
        </Box>

        <Box component="form" onSubmit={submitCode} sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="Doğrulama kodu"
            placeholder="ABCDE-FGHJK"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', letterSpacing: 1 } }}
          />
          <Button type="submit" variant="contained" sx={{ bgcolor: NAVY, textTransform: 'none', fontWeight: 700 }}>
            Sorgula
          </Button>
        </Box>

        {loading && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress aria-label="Sorgulanıyor" />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {data && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              <Typography sx={{ fontWeight: 800, color: NAVY, flex: 1 }}>
                {data.board || data.unit} · Karar {data.label}
              </Typography>
              <Chip label={status.label} sx={{ bgcolor: status.bg, color: status.color, fontWeight: 800 }} />
            </Box>

            <Typography variant="body2" sx={{ color: '#334155', mb: 0.5 }}>
              <b>Toplantı tarihi:</b> {formatLongDate(data.meetingDate)}
            </Typography>
            <Typography variant="body2" sx={{ color: '#334155', mb: 2 }}>
              <b>Gündem:</b> {data.agenda}
            </Typography>

            {data.status === 'IptalEdildi' && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Bu karar {formatTime(data.cancelledAt)} tarihinde iptal edilmiştir.
                {data.cancellationReason ? ` Gerekçe: ${data.cancellationReason}` : ''} Elinizdeki
                belge geçerli değildir.
              </Alert>
            )}

            {data.status === 'Imzalandi' && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Tüm imzalar {formatTime(data.completedAt)} tarihinde tamamlandı.
                {data.finalPdfSealedAt
                  ? ' Karar PDF’si sistem sertifikasıyla mühürlendi.'
                  : ''}
              </Alert>
            )}

            <Typography sx={{ color: '#1b4a94', fontSize: '0.78rem', fontWeight: 700, letterSpacing: 1, mb: 0.5 }}>
              İMZALAR ({data.signedCount} / {data.signers.length})
            </Typography>
            <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, mb: 2 }}>
              {data.signers.map((signer, index) => (
                <Box
                  key={`${signer.name}-${index}`}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 1,
                    px: 1.5,
                    py: 1,
                    borderTop: index ? '1px solid #f1f5f9' : 0,
                    fontSize: 14,
                  }}
                >
                  <span>{signer.name}</span>
                  <Box component="span" sx={{ color: signer.signedAt ? '#15803d' : '#b45309', whiteSpace: 'nowrap' }}>
                    {signer.signedAt ? `İmzaladı · ${formatTime(signer.signedAt)}` : 'Bekliyor'}
                  </Box>
                </Box>
              ))}
            </Box>

            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 1.5, mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Elinizdeki PDF’yi kontrol edin
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 1.5 }}>
                Dosya yalnızca özetini hesaplamak için kullanılır, saklanmaz.
              </Typography>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(event) => checkFile(event.target.files?.[0])}
              />
              <Button
                variant="outlined"
                startIcon={fileBusy ? <CircularProgress size={16} /> : <UploadFileOutlinedIcon />}
                disabled={fileBusy}
                onClick={() => fileInput.current?.click()}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                PDF seç ve karşılaştır
              </Button>

              {fileResult?.error && <Alert severity="error" sx={{ mt: 1.5 }}>{fileResult.error}</Alert>}
              {fileResult?.match && (
                <Alert severity={FILE_RESULT[fileResult.match].severity} sx={{ mt: 1.5 }}>
                  {FILE_RESULT[fileResult.match].text}
                  {fileResult.sealPresent && (
                    <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                      {fileResult.sealValid
                        ? `Dosyadaki elektronik mühür geçerli (${fileResult.sealSigner}).`
                        : 'Dosyadaki elektronik mühür bozuk: dosya mühürlendikten sonra değiştirilmiş.'}
                    </Box>
                  )}
                </Alert>
              )}
            </Box>

            {[
              ['İmzaya esas PDF özeti (SHA-256)', data.signingPdfHash],
              ['Mühürlü son PDF özeti (SHA-256)', data.finalPdfHash],
            ].filter(([, value]) => value).map(([label, value]) => (
              <Typography
                key={label}
                variant="caption"
                sx={{ display: 'block', color: '#64748b', overflowWrap: 'anywhere', fontFamily: 'monospace', mb: 0.5 }}
              >
                {label}: {value}
              </Typography>
            ))}
          </>
        )}

        <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', mt: 3 }}>
          Selçuk Üniversitesi Kurul Karar Sistemi. Üye imzaları sistem içi onay imzasıdır;
          5070 sayılı Kanun kapsamında güvenli elektronik imza değildir.
        </Typography>
      </Paper>
    </Box>
  );
}
