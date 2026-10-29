import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog,
  DialogActions, DialogContent, DialogTitle,
  FormControlLabel, LinearProgress, Paper,
  Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import DrawIcon from '@mui/icons-material/Draw';
import DownloadIcon from '@mui/icons-material/Download';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import SignatureEditor, { SignaturePreview } from './SignatureEditor';
import SigningRulesDialog from './SigningRulesDialog';
import { getMySignature } from '../api/signature';

import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest, readApiBlob } from '../api/client';
import {
  getDecision,
  getPendingSignerEmails,
  verifyDecision,
} from '../data/decisionStore';

const memberId = (person) => person.memberId ?? person.userId;
const messageOf = (error) =>
  error?.message || 'İşlem tamamlanamadı. Tekrar deneyin.';

const isHash = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const formatTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Tarih alınamadı'
    : date.toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
      });
};

async function sha256(bytes) {
  if (!window.crypto?.subtle) {
    throw new Error(
      'Bu işlem için uygulamayı localhost veya HTTPS üzerinden açın.'
    );
  }

  const digest = await window.crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export default function SignaturePanel(props) {
  const { token, unit } = useAuth();

  return (
    <SignatureContent
      key={`${token || ''}:${unit?.code || ''}:${props.decision.id}`}
      {...props}
    />
  );
}

function SignatureContent({ decision, canManage, onChange, onError }) {
  const { user, can } = useAuth();
  const path = `/api/decisions/${encodeURIComponent(decision.id)}`;

  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  // İmza görüntüsü (kayıtlı imza veya yeni yüklenen) ve imzalarken sorulan parola.
  const [password, setPassword] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [savedImage, setSavedImage] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [error, setError] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const [rulesOpen, setRulesOpen] = useState(false);
  const [notice, setNotice] = useState('');
  // Sayfa açıkken başka üyelerin attığı yeni imzalar kısa süre vurgulanır.
  const [recent, setRecent] = useState([]);
  const seenSigned = useRef(null);
  const recentTimer = useRef(0);

  const [verification, setVerification] = useState(null);
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyAttempt, setVerifyAttempt] = useState(0);

  const alive = useRef(false);
  const lock = useRef(false);
  const mailLock = useRef(false);
  const request = useRef(null);
  const objectUrl = useRef('');

  const clearPdf = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = '';
    }
    setReview(null);
    setReviewed(false);
  };

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      request.current?.abort();
      window.clearTimeout(recentTimer.current);

      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = '';
      }
    };
  }, []);

  const signers = (decision.participants || []).filter(
    (person) => person.attendance === 'Katilir'
  );

  const signedCount = signers.filter((person) => person.signedAt).length;
  const pendingCount = signers.length - signedCount;
  const isWaiting = decision.status === 'ImzaBekliyor';
  const isSigned = decision.status === 'Imzalandi';

  const me = signers.find(
    (person) => String(memberId(person)) === String(user?.id)
  );

  // Karar sayfası birkaç saniyede bir yenilenir; burada yalnızca yeni imzalar fark edilir.
  const signedKey = signers
    .filter((person) => person.signedAt)
    .map((person) => String(memberId(person)))
    .join(',');

  useEffect(() => {
    const ids = signedKey ? signedKey.split(',') : [];
    if (seenSigned.current === null) {
      seenSigned.current = new Set(ids);
      return;
    }

    const fresh = signers.filter((person) => {
      const id = String(memberId(person));
      return person.signedAt && !seenSigned.current.has(id) && id !== String(user?.id);
    });
    seenSigned.current = new Set(ids);
    if (!fresh.length) return;

    setRecent(fresh.map((person) => ({ id: String(memberId(person)), name: person.name })));
    window.clearTimeout(recentTimer.current);
    recentTimer.current = window.setTimeout(() => {
      if (alive.current) setRecent([]);
    }, 10000);
    // signers her yenilemede yeni dizi olduğundan yalnızca imzalı kimlik listesi izlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedKey]);

  const canSignNow = Boolean(
    isWaiting && me && !me.signedAt && can('oylama', 'write')
  );

  const expires = prepared
    ? new Date(prepared.expiresAt).getTime()
    : 0;

  const expired = Boolean(
    prepared && (!Number.isFinite(expires) || expires <= now)
  );

  useEffect(() => {
    if (!prepared) return undefined;

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [prepared]);

  useEffect(() => {
    if (!canSignNow && !busy) {
      setOpen(false);
      setPrepared(null);
      setPassword('');

      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = '';
      }

      setReview(null);
      setReviewed(false);
    }
  }, [canSignNow, busy]);

  useEffect(() => {
    let cancelled = false;

    setVerification(null);
    setVerifyError('');

    if (!isSigned) {
      setVerifying(false);
      return undefined;
    }

    setVerifying(true);

    verifyDecision(decision.id)
      .then((result) => {
        if (!cancelled) setVerification(result);
      })
      .catch((err) => {
        if (!cancelled) setVerifyError(messageOf(err));
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSigned, decision.id, decision.documentHash, verifyAttempt]);

  const refreshDecision = async () => {
    const updated = await getDecision(decision.id);
    if (alive.current) onChange?.(updated);
  };

  const handlePrepare = async () => {
    if (lock.current || !canSignNow) return;

    lock.current = true;
    setBusy(true);
    setOpen(true);
    setError('');
    setPrepared(null);
    setPassword('');
    clearPdf();
    onError?.('');

    // Kayıtlı imza varsa hazır gelir; yoksa fotoğraf yükleme alanı açılır.
    getMySignature()
      .then((saved) => {
        if (!alive.current) return;
        const image = saved?.hasSignature ? saved.image : '';
        setSavedImage(image);
        setSignatureImage(image);
        setEditorOpen(!image);
        setSaveToProfile(!image);
      })
      .catch(() => {
        if (alive.current) setEditorOpen(true);
      });

    const controller = new AbortController();
    request.current = controller;

    try {
      if (!decision.rowVersion) {
        throw new Error('Kararın sürüm bilgisi bulunamadı. Sayfayı yenileyin.');
      }

      const result = await apiFetch(`${path}/signature/prepare`, {
        method: 'POST',
        signal: controller.signal,
        body: { rowVersion: decision.rowVersion },
      });

      if (!alive.current) return;

      const challenge = String(result?.challengeId || '')
        .replaceAll('-', '')
        .toLowerCase();

      const expectedPayload = [
        'DEMO-SHA256-V1',
        String(decision.id),
        String(user?.id),
        challenge,
        result?.contentHash,
      ].join('\n');

      if (
        result?.scheme !== 'DEMO-SHA256-V1' ||
        String(result.decisionId) !== String(decision.id) ||
        String(result.userId) !== String(user?.id) ||
        !/^[a-f0-9]{32}$/.test(challenge) ||
        !isHash(result.contentHash) ||
        result.payload !== expectedPayload ||
        !Number.isFinite(new Date(result.expiresAt).getTime())
      ) {
        throw new Error('Sunucudan geçerli imza hazırlığı alınamadı.');
      }

      setPrepared(result);

      // Ham API yanıtı kullanılır; decisionStore bazı yeni alanları
      // ekran modeline henüz taşımıyor olabilir.
      const current = await apiFetch(path, {
        signal: controller.signal,
      });

      const currentMe = current?.participants?.find(
        (person) => String(person.userId) === String(user?.id)
      );

      if (
        String(current?.id) !== String(decision.id) ||
        current.status !== 'ImzaBekliyor' ||
        current.signingContentHash !== result.contentHash ||
        !currentMe ||
        currentMe.attendance !== 'Katilir' ||
        currentMe.signedAt
      ) {
        throw new Error(
          'Kararın durumu veya imza içeriği değişmiş. Pencereyi kapatıp yeniden başlatın.'
        );
      }

      const pdfBound = current.signatureVersion === 2;

      if (
        !pdfBound &&
        !(
          current.signatureVersion === 1 &&
          current.participants.some((person) => person.signedAt)
        )
      ) {
        throw new Error('Bu karar için desteklenen imza yöntemi bulunamadı.');
      }

      if (pdfBound && !isHash(current.signingPdfHash)) {
        throw new Error('Sabit PDF özeti alınamadı.');
      }

      // İmzaya esas sabit PDF; özeti sunucudaki kayıtla karşılaştırılır.
      const response = await apiRequest(`${path}/pdf?original=true`, {
        signal: controller.signal,
      });

      const contentType = (response.headers.get('Content-Type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();

      if (contentType !== 'application/pdf') {
        throw new Error('Sunucudan beklenen PDF alınamadı.');
      }

      const blob = await readApiBlob(response);

      if (!blob.size || blob.size > 10 * 1024 * 1024) {
        throw new Error('PDF boş veya izin verilen önizleme boyutunu aşıyor.');
      }

      const bytes = await blob.arrayBuffer();
      const signature = new TextDecoder().decode(bytes.slice(0, 5));

      if (signature !== '%PDF-') {
        throw new Error('İndirilen dosya geçerli bir PDF başlangıcı içermiyor.');
      }

      const actualHash = await sha256(bytes);

      if (pdfBound && actualHash !== current.signingPdfHash) {
        throw new Error(
          'İndirilen PDF sabitlenen dosyayla eşleşmiyor. İmza engellendi.'
        );
      }

      if (!alive.current || controller.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      objectUrl.current = url;

      setReview({
        url,
        pdfBound,
        hash: actualHash,
        contentHash: result.contentHash,
        agenda: current.agenda || '',
        meetingYear: current.meetingYear,
        meetingNo: current.meetingNo,
        decisionNo: current.decisionNo,
      });
    } catch (err) {
      if (alive.current && err?.name !== 'AbortError') {
        clearPdf();
        setError(messageOf(err));
      }
    } finally {
      // Hazırlık RowVersion değiştirdiği için karar sürümünü yenile.
      if (alive.current) {
        try {
          await refreshDecision();
        } catch {
          // Önizleme hatasını koru. Sonraki istekte sunucu sürümü denetler.
        }
      }

      request.current = null;
      lock.current = false;

      if (alive.current) setBusy(false);
    }
  };

  const closeDialog = () => {
    if (lock.current) return;

    request.current?.abort();
    setOpen(false);
    setPrepared(null);
    setPassword('');
    setError('');
    clearPdf();
  };

  const handleComplete = async () => {
    if (
      lock.current ||
      !prepared ||
      !review ||
      !reviewed ||
      !canSignNow ||
      review.contentHash !== prepared.contentHash
    ) return;

    if (!signatureImage) {
      setError('İmzanızı ekleyin.');
      return;
    }

    if (!password) {
      setError('Parolanızı girin.');
      return;
    }

    if (
      !Number.isFinite(expires) ||
      expires <= Date.now()
    ) {
      setNow(Date.now());
      setError('Hazırlığın süresi doldu. Pencereyi kapatıp yeniden başlatın.');
      return;
    }

    lock.current = true;
    setBusy(true);
    setError('');
    onError?.('');

    let completionReceived = false;

    try {
      // İçerik bağlantısı (karar + üye + hazırlık + içerik özeti) korunur;
      // imza görüntüsü ve parola sunucuda ayrıca denetlenir.
      const signatureData = await sha256(
        new TextEncoder().encode(prepared.payload)
      );

      if (!alive.current) return;

      await apiFetch(`${path}/signature/complete`, {
        method: 'POST',
        body: {
          challengeId: prepared.challengeId,
          contentHash: prepared.contentHash,
          signatureData,
          password,
          signatureImage,
          saveSignature: saveToProfile && signatureImage !== savedImage,
        },
      });

      completionReceived = true;

      if (!alive.current) return;

      setOpen(false);
      setPrepared(null);
      clearPdf();
      setNotice(
        'İmzanız kaydedildi. İşlem makbuzu bildirimlerinize ve kayıtlı e-posta adresinize gönderildi.'
      );

      await refreshDecision();
    } catch (err) {
      if (!alive.current) return;

      const message = completionReceived
        ? 'İmzanız kaydedildi; güncel karar yüklenemedi. Sayfayı yenileyin.'
        : messageOf(err);

      setError(message);
      onError?.(message);

      if (!completionReceived && [400, 403, 404, 409, 410].includes(err?.status)) {
        // Durum/içerik uyuşmazlığında eski önizlemeyle yeniden onay verilmez.
        clearPdf();
      }
    } finally {
      lock.current = false;

      if (alive.current) {
        setBusy(false);
        setPassword('');
      }
    }
  };

  const downloadPdf = () => {
    if (!review?.url) return;

    const link = document.createElement('a');
    link.href = review.url;
    link.download =
      `Kurul-Karari-${review.meetingYear}-${review.meetingNo}-${review.decisionNo}.pdf`;

    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleMail = async () => {
    if (
      mailLock.current ||
      !canManage ||
      !isWaiting ||
      pendingCount === 0
    ) return;

    mailLock.current = true;
    setMailBusy(true);
    setMailMessage('');

    try {
      const emails = await getPendingSignerEmails(decision.id);
      if (!alive.current) return;

      if (!emails.length) {
        setMailMessage('İmza bekleyen üyelerin e-posta adresi bulunamadı.');
        return;
      }

      const subject =
        `Kurul Kararı ${decision.meetingYear}/${decision.meetingNo}` +
        `-${decision.decisionNo} - İnceleme ve İmza`;

      const body =
        `Sayın Kurul Üyesi,\n\n` +
        `${decision.meetingYear}/${decision.meetingNo} sayılı toplantının ` +
        `${decision.decisionNo} numaralı kararı inceleme ve imzanıza sunulmuştur.\n\n` +
        `Konu: ${decision.konu}\n\n` +
        `Sisteme giriş yapıp ilgili kurulu seçerek kararı açabilirsiniz:\n` +
        `${window.location.origin}/oylama/${decision.id}\n\nSaygılarımla.`;

      const recipients = emails
        .map((email) => encodeURIComponent(email.trim()))
        .join(',');

      window.location.href =
        `mailto:${recipients}?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;

      setMailMessage(
        'E-posta taslağı açıldıysa kontrol edip gönderebilirsiniz.'
      );
    } catch (err) {
      if (alive.current) setMailMessage(messageOf(err));
    } finally {
      mailLock.current = false;
      if (alive.current) setMailBusy(false);
    }
  };

  const verificationValid =
    verification?.isSealed === true && verification?.valid === true;

  const canComplete = Boolean(
    canSignNow &&
    prepared &&
    review &&
    reviewed &&
    !expired &&
    !busy &&
    !editorOpen &&
    Boolean(signatureImage) &&
    password.length > 0
  );

  return (
    <Paper
      elevation={2}
      sx={{
        p: 3,
        borderRadius: '12px',
        mb: 4,
        borderLeft: '6px solid #1b4a94',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#27385a', flex: 1 }}>
          E-İmza Süreci
        </Typography>

        {isWaiting && (
          <Tooltip title="İmza durumu sayfa açıkken birkaç saniyede bir kendiliğinden güncellenir.">
            <Chip
              size="small"
              label="Canlı"
              icon={
                <Box
                  component="span"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: '#16a34a',
                    ml: '8px !important',
                    animation: 'kurulPulse 1.6s ease-in-out infinite',
                    '@keyframes kurulPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.25 } },
                  }}
                />
              }
              sx={{ bgcolor: '#f0fdf4', color: '#166534', fontWeight: 700 }}
            />
          </Tooltip>
        )}

        <Button
          size="small"
          startIcon={<InfoOutlinedIcon />}
          onClick={() => setRulesOpen(true)}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          İmza kuralları
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Kararı, kâğıda attığınız imzanın fotoğrafıyla imzalarsınız; imza adınızın
        altındaki kutuya yerleşir ve parolanız ayrıca sorulur. Bu sistem içi onay
        imzasıdır; nitelikli elektronik imza değildir.
      </Alert>

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      {recent.length > 0 && (
        <Alert severity="success" variant="outlined" sx={{ mb: 2 }}>
          {recent.map((person) => person.name).join(', ')} kararı imzaladı.
        </Alert>
      )}

      {error && !open && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2">İmza durumu</Typography>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
            {signedCount} / {signers.length}
          </Typography>
        </Box>

        <LinearProgress
          variant="determinate"
          value={signers.length ? (signedCount / signers.length) * 100 : 0}
          sx={{
            height: 10,
            borderRadius: 5,
            bgcolor: '#e2e8f0',
            '& .MuiLinearProgress-bar': { bgcolor: '#1b4a94' },
          }}
        />
      </Box>

      <Box sx={{ overflowX: 'auto', mb: 2 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f1f5f9' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Üye</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Durum</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>İmza Bilgisi</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {signers.map((person) => (
              <TableRow
                key={memberId(person)}
                sx={{
                  transition: 'background-color .6s',
                  bgcolor: recent.some((r) => r.id === String(memberId(person)))
                    ? '#ecfdf5'
                    : 'transparent',
                }}
              >
                <TableCell>{person.name}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={person.signedAt ? 'İmzaladı' : 'Bekliyor'}
                    sx={{
                      bgcolor: person.signedAt ? '#dcfce7' : '#fef3c7',
                      color: person.signedAt ? '#15803d' : '#b45309',
                    }}
                  />
                </TableCell>
                <TableCell sx={{ overflowWrap: 'anywhere' }}>
                  {person.signedAt
                    ? `${formatTime(person.signedAt)}${
                        person.signatureRef ? ` · ${person.signatureRef}` : ''
                      }`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {!signers.length && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Katılan imzacı bulunamadı.
        </Alert>
      )}

      {isWaiting && pendingCount > 0 && (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {canSignNow ? (
            <Button
              variant="contained"
              startIcon={<DrawIcon />}
              disabled={busy || mailBusy}
              onClick={handlePrepare}
              sx={{ bgcolor: '#1b4a94', py: 1.5 }}
            >
              {busy ? 'Hazırlanıyor...' : 'KARARI İMZALA'}
            </Button>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {!me
                ? 'Bu kararın imzacıları arasında değilsiniz.'
                : me.signedAt
                  ? 'İmzanız kayıtlı; diğer üyeler bekleniyor.'
                  : 'Bu karar için imza yetkiniz yok.'}
            </Typography>
          )}

          {canManage && (
            <Button
              variant="outlined"
              startIcon={<MailOutlinedIcon />}
              disabled={busy || mailBusy}
              onClick={handleMail}
              sx={{ textTransform: 'none', py: 1.5 }}
            >
              {mailBusy ? 'Hazırlanıyor...' : 'İmza Bekleyenlere E-posta Hazırla'}
            </Button>
          )}
        </Box>
      )}

      {decision.verificationCode && (
        <Box
          sx={{
            mt: 2,
            p: 1.5,
            border: '1px solid #e2e8f0',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <VerifiedOutlinedIcon sx={{ color: '#1b4a94' }} />
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="body2">
              Belge doğrulama kodu:{' '}
              <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 800 }}>
                {decision.verificationCode}
              </Box>
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              PDF’nin altındaki karekod bu kodun sayfasını açar; belgenin güncel durumu giriş yapmadan doğrulanabilir.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to={`/dogrula/${decision.verificationCode}`}
            target="_blank"
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Doğrulama sayfası
          </Button>
        </Box>
      )}

      {mailMessage && (
        <Alert severity="info" sx={{ mt: 2 }}>{mailMessage}</Alert>
      )}

      {isSigned && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Kararın imza süreci tamamlanmıştır.
            {decision.finalPdfSealedAt &&
              ` Son PDF ${formatTime(decision.finalPdfSealedAt)} tarihinde sistem sertifikasıyla mühürlendi.`}
          </Alert>

          {verifying && <LinearProgress sx={{ mb: 2 }} />}

          {verifyError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Bütünlük kontrolü yapılamadı: {verifyError}
            </Alert>
          )}

          {verification && (
            <Alert
              severity={verificationValid ? 'success' : 'error'}
              sx={{ mb: 2 }}
            >
              {verificationValid
                ? verification.pdfBound
                  ? 'Sabit PDF, karar içeriği, imza bağlantıları ve ek dosyaları doğrulandı.'
                  : verification.legacy
                    ? 'Eski belge özeti ve ek dosyaları doğrulandı. Bu kayıt PDF’ye bağlı imza içermez.'
                    : 'Eski v1 içerik bağlantılı imzalar ve ek dosyaları doğrulandı. Bu kayıt PDF’ye bağlı değildir.'
                : verification.attachmentError ||
                  'Belge veya imza bütünlüğü doğrulanamadı.'}
            </Alert>
          )}

          {[
            ['İmzalanan içerik', verification?.signingContentHash],
            ['Sabit PDF özeti', verification?.pdfHash],
            ['Son belge özeti', decision.documentHash],
          ].filter(([, value]) => value).map(([label, value]) => (
            <Typography
              key={label}
              variant="caption"
              sx={{
                display: 'block',
                overflowWrap: 'anywhere',
                fontFamily: 'monospace',
                mb: 1,
              }}
            >
              {label}: {value}
            </Typography>
          ))}

          <Button
            size="small"
            disabled={verifying}
            onClick={() => setVerifyAttempt((value) => value + 1)}
          >
            Yeniden Kontrol Et
          </Button>
        </Box>
      )}

      <SigningRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <Dialog
        open={open}
        onClose={closeDialog}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1 }}>Belgeyi İncele ve İmzala</Box>
          <Button
            size="small"
            startIcon={<InfoOutlinedIcon />}
            onClick={() => setRulesOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            İmza kuralları
          </Button>
        </DialogTitle>

        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            <b>{user?.name}</b> adına imza atılacak. Belgeyi inceleyin, onay
            kutusunu işaretleyin, imzanızı ve parolanızı girin.
          </Typography>

          {busy && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {review ? 'İmza kaydediliyor…' : 'Belge hazırlanıyor ve doğrulanıyor…'}
              </Typography>
              <LinearProgress />
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}

          {expired && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Hazırlığın süresi doldu. Pencereyi kapatıp yeniden başlatın.
            </Alert>
          )}

          {review && (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Karar: {review.meetingYear}/{review.meetingNo}
                -{review.decisionNo} · {review.agenda}
              </Typography>

              <Alert
                severity={review.pdfBound ? 'success' : 'warning'}
                sx={{ mb: 2 }}
              >
                {review.pdfBound
                  ? 'İndirilen PDF’nin özeti, sunucudaki sabit PDF özetiyle eşleşiyor.'
                  : 'Bu karar eski v1 yöntemiyle kısmen imzalanmış. Gösterilen PDF inceleme çıktısıdır; imzanız karar verisine bağlanır, PDF dosyasına bağlanmaz.'}
              </Alert>

              <Button
                startIcon={<DownloadIcon />}
                onClick={downloadPdf}
                sx={{ mb: 1 }}
              >
                Görüntülenen PDF’yi İndir
              </Button>

              <Box
                component="iframe"
                title="İmza öncesi karar PDF önizlemesi"
                src={review.url}
                sx={{
                  display: 'block',
                  width: '100%',
                  height: '55vh',
                  minHeight: 320,
                  border: '1px solid #cbd5e1',
                  bgcolor: '#f1f5f9',
                  mb: 1,
                }}
              />

              <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
                Önizleme açılmazsa dosyayı indirip inceleyebilirsiniz.
                Ek dosyaların içerikleri bu PDF’ye dahil değildir.
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  overflowWrap: 'anywhere',
                  fontFamily: 'monospace',
                  mb: 1,
                }}
              >
                Görüntülenen PDF SHA-256: {review.hash}
              </Typography>
            </>
          )}

          {prepared && (
            <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
              Hazırlığın son geçerlilik zamanı: {formatTime(prepared.expiresAt)}
            </Typography>
          )}

          <FormControlLabel
            sx={{ mb: 2 }}
            control={
              <Checkbox
                checked={reviewed}
                disabled={!review || busy || expired || !canSignNow}
                onChange={(event) => setReviewed(event.target.checked)}
              />
            }
            label={
              review?.pdfBound
                ? 'İmzaya esas PDF’yi inceledim; bu belgeyi imzalıyorum.'
                : 'Kararı inceledim; karar verisine bağlı imzamı onaylıyorum.'
            }
          />

          <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5 }}>
              İmzanız
            </Typography>

            {editorOpen ? (
              <SignatureEditor
                doneLabel="Bu imzayı kullan"
                onCancel={signatureImage ? () => setEditorOpen(false) : undefined}
                onDone={(image) => {
                  setSignatureImage(image);
                  setEditorOpen(false);
                }}
              />
            ) : (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <SignaturePreview src={signatureImage} height={90} />
                <Box sx={{ display: 'grid', gap: 0.5 }}>
                  <Button
                    size="small"
                    startIcon={<UploadFileOutlinedIcon />}
                    disabled={busy}
                    onClick={() => setEditorOpen(true)}
                    sx={{ textTransform: 'none', fontWeight: 700, justifySelf: 'start' }}
                  >
                    {signatureImage === savedImage && savedImage ? 'Farklı imza yükle' : 'İmzayı yeniden yükle'}
                  </Button>
                  {signatureImage && signatureImage !== savedImage && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={saveToProfile}
                          onChange={(event) => setSaveToProfile(event.target.checked)}
                        />
                      }
                      label="Bu imzayı sonraki kararlar için profilime kaydet"
                    />
                  )}
                </Box>
              </Box>
            )}
          </Box>

          <TextField
            fullWidth
            label="Parolanız"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={!review || busy || expired || !canSignNow}
            onChange={(event) => setPassword(event.target.value)}
            helperText="Güvenlik için giriş parolanız tekrar sorulur."
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (canComplete) handleComplete();
              }
            }}
          />
        </DialogContent>

        <DialogActions>
          <Button disabled={busy} onClick={closeDialog}>
            Vazgeç
          </Button>
          <Button
            variant="contained"
            disabled={!canComplete}
            onClick={handleComplete}
            sx={{ bgcolor: '#1b4a94' }}
          >
            {busy ? 'İşlem sürüyor…' : 'İmzala'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}