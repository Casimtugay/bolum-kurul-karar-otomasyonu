import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import HighlightOffIcon from '@mui/icons-material/CancelOutlined';

import { answerRsvp, getRsvp } from '../api/announcements';
import { formatLongDate } from '../components/dateUtils';
import selcukLogo from '../assets/selcuk.png';

// E-postadaki "Katılıyorum / Katılamayacağım" bağlantısının açtığı sayfa.
// Giriş gerekmez: bağlantıdaki kişiye özel anahtar yalnızca bu üyenin cevabını değiştirir.
// ?yanit= ile gelindiyse cevap sayfa açılır açılmaz kaydedilir; üye isterse değiştirebilir.

const NAVY = '#0f1f4f';
const INTENTS = {
  Katilacak: { label: 'Katılacağım', done: 'Katılacağınızı bildirdiniz.', alert: 'success' },
  Katilmayacak: { label: 'Katılamayacağım', done: 'Katılamayacağınızı bildirdiniz.', alert: 'info' },
};

export default function Rsvp() {
  const { token } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    // StrictMode'da efekt iki kez çalışır; cevap yalnızca bir kez gönderilsin.
    if (startedRef.current) return;
    startedRef.current = true;

    const initial = searchParams.get('yanit');
    const request = INTENTS[initial] ? answerRsvp(token, initial) : getRsvp(token);

    request
      .then((result) => {
        setData(result);
        setJustSaved(Boolean(INTENTS[initial]));
        // Sayfa yenilenince aynı cevabın tekrar gönderilmesine gerek yok.
        if (searchParams.has('yanit')) setSearchParams({}, { replace: true });
      })
      .catch((err) => setError(err?.message || 'Bağlantı açılamadı.'));
  }, [token, searchParams, setSearchParams]);

  const change = async (intent) => {
    setBusy(true);
    setError('');
    try {
      setData(await answerRsvp(token, intent));
      setJustSaved(true);
    } catch (err) {
      setError(err?.message || 'Cevap kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const current = INTENTS[data?.intent];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f2f4f8', py: { xs: 3, sm: 6 }, px: 2 }}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: 560,
          mx: 'auto',
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          borderTop: `5px solid ${NAVY}`,
          border: '1px solid #dfe5ed',
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box component="img" src={selcukLogo} alt="Selçuk Üniversitesi" sx={{ width: 64, height: 64 }} />
          <Typography sx={{ color: NAVY, fontWeight: 800, mt: 1 }}>
            {data?.boardName || 'Kurul Duyurusu'}
          </Typography>
        </Box>

        {!data && !error && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress aria-label="Yükleniyor" />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {data && (
          <>
            {justSaved && current && (
              <Alert severity={current.alert} sx={{ mb: 3, fontWeight: 600 }}>
                Teşekkürler {data.memberName}. {current.done}
              </Alert>
            )}

            <Typography sx={{ color: '#334155', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
              {data.content}
            </Typography>

            {(data.meetingDate || data.location || data.onlineLink) && (
              <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 1, display: 'grid', gap: 0.5 }}>
                {data.meetingDate && (
                  <Typography variant="body2">
                    <b>Tarih:</b> {formatLongDate(data.meetingDate)}
                    {data.meetingTime ? `, ${data.meetingTime}` : ''}
                  </Typography>
                )}
                {data.location && (
                  <Typography variant="body2"><b>Yer:</b> {data.location}</Typography>
                )}
                {data.onlineLink && /^https?:\/\//i.test(data.onlineLink) && (
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    <b>Çevrimiçi:</b>{' '}
                    <Link href={data.onlineLink} target="_blank" rel="noopener noreferrer">
                      {data.onlineLink}
                    </Link>
                  </Typography>
                )}
              </Box>
            )}

            {data.agendaItems?.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography sx={{ color: '#1b4a94', fontSize: '0.78rem', fontWeight: 700, letterSpacing: 1 }}>
                  GÜNDEM
                </Typography>
                <Box component="ol" sx={{ m: 0, mt: 0.5, pl: 2.5, color: '#334155' }}>
                  {data.agendaItems.map((item, i) => <li key={i}>{item}</li>)}
                </Box>
              </Box>
            )}

            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #e2e8f0' }}>
              <Typography sx={{ color: '#596779', fontWeight: 600, mb: 1.5 }}>
                {current ? 'Cevabınızı değiştirebilirsiniz:' : 'Katılım durumunuzu bildirin:'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  variant={data.intent === 'Katilacak' ? 'contained' : 'outlined'}
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  disabled={busy}
                  onClick={() => data.intent !== 'Katilacak' && change('Katilacak')}
                >
                  Katılacağım
                </Button>
                <Button
                  variant={data.intent === 'Katilmayacak' ? 'contained' : 'outlined'}
                  color="error"
                  startIcon={<HighlightOffIcon />}
                  disabled={busy}
                  onClick={() => data.intent !== 'Katilmayacak' && change('Katilmayacak')}
                >
                  Katılamayacağım
                </Button>
              </Box>
            </Box>

            <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', mt: 3 }}>
              Duyuruyu yayımlayan: {data.publishedBy}. Bu sayfayı kapatabilirsiniz; cevabınız kaydedildi.
            </Typography>
          </>
        )}
      </Paper>
    </Box>
  );
}
