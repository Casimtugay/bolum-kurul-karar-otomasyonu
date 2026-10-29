import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Container, Chip, Divider,
  LinearProgress, TextField, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogActions, Badge, List,
} from '@mui/material';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownAlt';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import HowToVoteIcon from '@mui/icons-material/HowToVote';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadIcon from '@mui/icons-material/Download';
import { downloadAttachment, fetchAttachmentBlob } from '../api/files';
import AttachmentPreviewDialog, { previewKind } from './AttachmentPreviewDialog';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

import DraftDecisionDialog from './DraftDecisionDialog';
import DecisionLifecyclePanel from './DecisionLifecyclePanel';
import PageLayout from './PageLayout';
import StatusChip from './StatusChip';
import SignaturePanel from './SignaturePanel';
import AttachmentsPanel from './AttachmentsPanel';
import PreSignDialog from './PreSignDialog';
import DrawIcon from '@mui/icons-material/Draw';
import { useAuth } from '../contexts/AuthContext';
import {
  getDecision,
  castVote,
  computeResult,
  deleteDecision,
  updateDecision,
  cancelDecision,
  submitDecision,
  reconsiderDecision,
} from '../data/decisionStore';

const NAVY = '#0f1f4f';
const BLUE = '#1b4a94';
const TITLE = '#27385a';
const SOFT = '#e3eefb';
const YELLOW = '#fcc419';
const BORDER = '#dfe5ed';

const getMemberId = (participant) =>
  participant.memberId ?? participant.userId;

const getErrorMessage = (error) =>
  error instanceof Error && error.message
    ? error.message
    : 'İşlem tamamlanamadı. Sayfayı yenileyerek kontrol edin.';

export default function VotingPanel() {
  const { id } = useParams();
  const { unit } = useAuth();
  return (
    <VotingPanelContent
      key={`${unit?.code ?? 'kurul'}:${id}`}
      id={id}
    />
  );
}

function VotingPanelContent({ id }) {
  const navigate = useNavigate();
  const { user, can, unit } = useAuth();
  const [decision, setDecision] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [retReason, setRetReason] = useState('');
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [confirmKabul, setConfirmKabul] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [voteVersion, setVoteVersion] = useState(null);
  const [deleteVersion, setDeleteVersion] = useState(null);
  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);
  // Başkan için oy/imza durumu varsayılan olarak açık gelir (canlı takip).
  const [showVotes, setShowVotes] = useState(null);
  const [preSignOpen, setPreSignOpen] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);

  const formatAttachmentSize = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return 'Boyut bilinmiyor';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;
  };

  const [previewAttachment, setPreviewAttachment] = useState(null);
  const loadPreviewBlob = useCallback(
    () => fetchAttachmentBlob(decision?.id, previewAttachment),
    [decision?.id, previewAttachment]
  );

  const handleDownloadAttachment = async (att) => {
    try {
      await downloadAttachment(decision.id, att);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const revisionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer;
    mountedRef.current = true;

    const load = async (first = false) => {
      const revision = revisionRef.current;
      try {
        if (busyRef.current) return;
        const data = await getDecision(id);
        if (
          cancelled ||
          busyRef.current ||
          revision !== revisionRef.current
        ) {
          return;
        }
        setDecision(data);
        setRefreshError('');
      } catch (err) {
        if (
          !cancelled &&
          !busyRef.current &&
          revision === revisionRef.current
        ) {
          if (first) setError(getErrorMessage(err));
          else setRefreshError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          if (first) setLoaded(true);
          timer = window.setTimeout(() => load(false), 5000);
        }
      }
    };

    load(true);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.clearTimeout(timer);
    };
  }, [id]);

  const run = async (action, { remove = false } = {}) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    revisionRef.current += 1;
    setBusy(true);
    setError('');

    try {
      const updated = await action();
      if (!mountedRef.current) return false;
      if (remove) {
        navigate('/dashboard', { replace: true });
      } else {
        setDecision(updated);
      }
      setRefreshError('');
      return true;
    } catch (err) {
      if (mountedRef.current) {
        setError(getErrorMessage(err));
      }
      return false;
    } finally {
      busyRef.current = false;
      revisionRef.current += 1;
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleSignatureChange = (updated) => {
    if (!mountedRef.current) return;
    revisionRef.current += 1;
    setDecision(updated);
    setError('');
    setRefreshError('');
  };

  if (!loaded) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', bgcolor: '#f4f6fa' }}>
        <Typography sx={{ mb: 2, fontWeight: 700, color: NAVY }}>Karar yükleniyor...</Typography>
        <LinearProgress sx={{ width: '300px', '& .MuiLinearProgress-bar': { bgcolor: YELLOW } }} />
      </Box>
    );
  }

  if (!decision) {
    return (
      <Container maxWidth="md" sx={{ my: 4 }}>
        <Alert severity="error">
          {error || 'Karar bulunamadı.'}
        </Alert>
        <Button
          onClick={() => navigate('/dashboard')}
          sx={{ mt: 2, color: NAVY, fontWeight: 700 }}
        >
          Kurul paneline dön
        </Button>
      </Container>
    );
  }

  const participants = decision.participants || [];
  const result = computeResult(decision);
  const isOpen = ['Taslak', 'Oylamada'].includes(decision.status);
  const canManage = can('yeni-karar', 'write');

  // Katılımcılar karar hazırlanırken seçilir; bu sayfada katılım düzenlenmez.
  const attendanceLocked =
    !['Taslak', 'Oylamada'].includes(decision.status) ||
    decision.signedAt != null || decision.sealedAt != null || decision.documentHash != null ||
    participants.some((p) => p.vote != null || p.signedAt != null);

  // Metin, ekler ve silme yalnızca oylamaya sunulmamış taslakta.
  const isUnsubmittedDraft = decision.status === 'Taslak' && !decision.submittedAt;
  const canDelete = canManage && isUnsubmittedDraft && !attendanceLocked && Boolean(decision.rowVersion);
  const canEditDraft = canDelete;
  const voteChanged = voteVersion !== decision.rowVersion;
  const deleteChanged = deleteVersion !== decision.rowVersion;

  const me = participants.find(
    (p) => String(getMemberId(p)) === String(user?.id)
  );

  const votesVisible = showVotes ?? canManage;

  // Oy kullanan üye, oylamanın bitmesini beklemeden imzalama adımına geçebilir.
  const canPreSign = Boolean(
    decision.status === 'Oylamada' && Boolean(decision.rowVersion) &&
    me && me.attendance === 'Katilir' && me.vote && !me.preSignedAt && !me.signedAt &&
    can('oylama', 'write')
  );

  const canVote = Boolean(
    isOpen && decision.eligibility?.valid !== false && Boolean(decision.rowVersion) &&
    !decision.signedAt && !decision.sealedAt && !decision.documentHash &&
    me &&
    me.attendance === 'Katilir' &&
    !me.vote &&
    can('oylama', 'write')
  );

  const outcome = decision.oySonucu || '';
  const kararText = (decision.karar || decision.konu || '').replaceAll(
    '{OY_SONUCU}',
    outcome || '[oylama sonucu]'
  );

  const handleKabul = async () => {
    if (!canVote || voteChanged) {
      setConfirmKabul(false);
      setError('Bu karar için şu anda oy kullanamazsınız.');
      return;
    }
    const success = await run(() =>
      castVote(decision.id, 'Kabul', '', voteVersion)
    );
    if (success && mountedRef.current) {
      setConfirmKabul(false);
    }
  };

  const handleConfirmRet = async () => {
    if (!canVote || voteChanged) return;
    const reason = retReason.trim();
    if (!reason) {
      setError('Ret oyu için gerekçe yazmalısınız.');
      return;
    }
    const success = await run(() =>
      castVote(decision.id, 'Ret', reason, voteVersion)
    );
    if (success && mountedRef.current) {
      setRetReason('');
      setShowReasonInput(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!canDelete || deleteChanged) return;
    await run(
      () => deleteDecision(decision.id, deleteVersion),
      { remove: true }
    );
  };

  const openEditor = () => {
    if (!canEditDraft || busyRef.current) return;
    setError('');
    setEditing(decision);
  };

  const saveDraft = async (payload) => {
    if (!canEditDraft) return;
    const success = await run(() => updateDecision(decision.id, payload));
    if (success && mountedRef.current) setEditing(null);
  };

  const reloadDraft = async () => {
    let fresh;
    const success = await run(async () => {
      fresh = await getDecision(decision.id);
      return fresh;
    });
    if (success && mountedRef.current) {
      setEditing(fresh);
      setEditorRevision((value) => value + 1);
    }
  };

  const handleCancel = (reason, version) => run(() => cancelDecision(decision.id, reason, version));
  
  const handleReconsider = async (payload) => {
    let created;
    const success = await run(async () => {
      created = await reconsiderDecision(decision.id, payload);
      return created;
    });
    if (success && mountedRef.current) navigate(`/oylama/${created.id}`);
    return success;
  };

  const voteChip = (p) => {
    if (p.attendance !== 'Katilir') {
      return (
        <Typography variant="body2" sx={{ color: '#94a3b8' }}>
          —
        </Typography>
      );
    }
    const accepted = p.vote === 'Kabul';
    const rejected = p.vote === 'Ret';
    return (
      <Chip
        size="small"
        label={accepted ? 'Kabul' : rejected ? 'Ret' : 'Bekliyor'}
        sx={{
          bgcolor: accepted
            ? '#dcfce7'
            : rejected
              ? '#fee2e2'
              : '#f1f5f9',
          color: accepted
            ? '#15803d'
            : rejected
              ? '#b91c1c'
              : '#64748b',
          fontWeight: p.vote ? 'bold' : 'normal',
        }}
      />
    );
  };

  const signChip = (p) => {
    const signed = Boolean(p.signedAt);
    const pre = !signed && Boolean(p.preSignedAt);
    return (
      <Chip
        size="small"
        label={signed ? 'İmzaladı' : pre ? 'İmza verdi' : 'Bekliyor'}
        title={pre ? 'Oylama tamamlanınca karara eklenecek' : undefined}
        sx={{
          bgcolor: signed ? '#dcfce7' : pre ? '#e0edff' : '#f1f5f9',
          color: signed ? '#15803d' : pre ? BLUE : '#64748b',
          fontWeight: signed || pre ? 'bold' : 'normal',
        }}
      />
    );
  };

  const voteInfo = () => {
    if (decision.eligibility?.valid === false) return decision.eligibility.error;
    if (!me) {
      return 'Bu kararın oy kullanacak üyeleri arasında değilsiniz.';
    }
    if (me.attendance !== 'Katilir') {
      return 'İzinli veya görevli olduğunuz için oy kullanamazsınız.';
    }
    if (me.vote) return `Oyunuzu kullandınız: ${me.vote}.`;
    return 'Oy kullanma yetkiniz bulunmuyor.';
  };

  const statusMessage =
    decision.status === 'IptalEdildi' ? 'Karar süreci gerekçeyle iptal edildi.'
      : decision.status === 'Reddedildi'
      ? 'Karar reddedildi.'
      : decision.status === 'Imzalandi'
        ? `Karar ${outcome} kabul edildi; imza süreci tamamlandı.`
        : decision.status === 'ImzaBekliyor'
          ? `Karar ${outcome} kabul edildi; imzalar bekleniyor.`
          : 'Bu karar oy kullanımına kapalı.';

  const attachmentsList = Array.isArray(decision.attachments) ? decision.attachments : [];
  const attachmentCount = attachmentsList.length;
  const hasAttachments = attachmentCount > 0;

  return (
    <PageLayout
      title="Karar Detayı"
      onBackClick={() => {
        if (!busyRef.current) navigate('/dashboard');
      }}
      backText="Kurula dön"
    >
        {/* HERO BANNER / BAŞLIK ŞERİDİ */}
        <Paper
          elevation={0}
          sx={{
            bgcolor: '#ffffff',
            color: TITLE,
            borderRadius: 3,
            boxShadow: '0 2px 10px rgba(15,31,79,0.05)',
            p: { xs: 2.5, md: 3.5 },
            mb: 3,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 3,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', minWidth: 0, flex: 1 }}>
              <Box
                sx={{
                  width: 54,
                  height: 54,
                  borderRadius: 2,
                  bgcolor: SOFT,
                  color: BLUE,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <HowToVoteIcon sx={{ fontSize: 32 }} />
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="overline"
                  sx={{ color: BLUE, fontWeight: 800, letterSpacing: 1 }}
                >
                  {(unit?.boardName || 'BÖLÜM KURULU').toLocaleUpperCase('tr-TR')} KARARI
                </Typography>

                <Typography
                  component="h1"
                  sx={{
                    fontWeight: 800,
                    fontSize: { xs: '1.25rem', md: '1.6rem' },
                    lineHeight: 1.3,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {decision.konu}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: { xs: 'flex-start', md: 'flex-end' },
                gap: 1,
                flexShrink: 0,
              }}
            >
              <Chip
                label={`Toplantı No: ${decision.meetingYear} / ${decision.meetingNo}`}
                sx={{
                  bgcolor: SOFT,
                  fontWeight: 700,
                  color: BLUE,
                }}
              />
              <Chip
                label={`Karar No: ${decision.decisionNo}`}
                sx={{
                  bgcolor: SOFT,
                  fontWeight: 700,
                  color: BLUE,
                }}
              />
              <StatusChip status={decision.status} />

              <Button
                variant="contained"
                size="small"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => navigate(`/tutanak/${decision.id}`)}
                disabled={busy}
                sx={{
                  mt: 0.5,
                  bgcolor: YELLOW,
                  color: NAVY,
                  fontWeight: 800,
                  textTransform: 'none',
                  borderRadius: 2,
                  boxShadow: 'none',
                  '&:hover': { bgcolor: '#f0b400', boxShadow: 'none' },
                }}
              >
                PDF'yi görüntüle
              </Button>

              {hasAttachments && (
                <Badge
                  badgeContent={attachmentCount}
                  color="primary"
                  sx={{
                    mt: 0.5,
                    '& .MuiBadge-badge': {
                      bgcolor: BLUE,
                      fontWeight: 800,
                      color: '#ffffff',
                    },
                  }}
                >
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AttachFileIcon />}
                    onClick={() => setAttachmentsModalOpen(true)}
                    sx={{
                      bgcolor: '#e0edff',
                      color: BLUE,
                      fontWeight: 700,
                      textTransform: 'none',
                      borderRadius: 2,
                      boxShadow: 'none',
                      border: `1px solid ${BORDER}`,
                      '&:hover': {
                        bgcolor: '#d0e3ff',
                        boxShadow: 'none',
                      },
                    }}
                  >
                    Ek Dosyaları İncele ({attachmentCount})
                  </Button>
                </Badge>
              )}
            </Box>
          </Box>
        </Paper>

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3, whiteSpace: 'pre-line', borderRadius: 2 }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        )}

        {refreshError && (
          <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
            Otomatik yenileme yapılamadı. Gösterilen bilgiler güncel
            olmayabilir. {refreshError}
          </Alert>
        )}

        {/* OYLAMA KUTULARI (GRID) */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' },
            gap: 3,
            mb: 3,
          }}
        >
          {/* OY KULLAN / OYLAMA DURUMU */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              bgcolor: '#ffffff',
              border: `1px solid ${BORDER}`,
              borderTop: `4px solid ${BLUE}`,
              boxShadow: '0 4px 16px rgba(0,31,63,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                color: NAVY,
                mb: 2,
                textAlign: 'center',
              }}
            >
              {isOpen ? 'Oy Kullan' : 'Oylama Durumu'}
            </Typography>

            {!isOpen && (
              <Alert
                severity={
                  decision.status === 'Reddedildi' ? 'error' : 'info'
                }
                sx={{ mb: 2 }}
              >
                {statusMessage}
              </Alert>
            )}

            {isOpen && !canVote && (
              <Alert severity="info" sx={{ mb: 2, bgcolor: '#edf2f8', color: NAVY }}>{voteInfo()}</Alert>
            )}

            {canPreSign && (
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 1.5, fontWeight: 600 }}>
                  Diğer üyelerin oylamayı bitirmesini beklemeden kararı imzalayabilirsiniz.
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<DrawIcon />}
                  disabled={busy}
                  onClick={() => setPreSignOpen(true)}
                  sx={{
                    bgcolor: BLUE, fontWeight: 800, py: 1.2, px: 3, borderRadius: 2,
                    textTransform: 'none', boxShadow: 'none', '&:hover': { bgcolor: NAVY, boxShadow: 'none' },
                  }}
                >
                  İmzalamaya geç
                </Button>
              </Box>
            )}

            {isOpen && me?.preSignedAt && !me.signedAt && (
              <Alert severity="success" sx={{ mt: 1 }}>
                İmzanız alındı. Oylama kabulle tamamlandığında karar belgesine otomatik eklenecek.
              </Alert>
            )}

            {canVote && !showReasonInput && (
              <>
                <Typography
                  variant="body2"
                  sx={{ color: '#64748b', mb: 2.5, textAlign: 'center', fontWeight: 600 }}
                >
                  <b>{user?.name}</b> olarak oy kullanıyorsunuz.
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 2,
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<ThumbUpAltIcon />}
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setVoteVersion(decision.rowVersion);
                      setConfirmKabul(true);
                    }}
                    sx={{
                      bgcolor: '#2e7d32',
                      '&:hover': { bgcolor: '#1b5e20' },
                      py: 1.5,
                      px: 4,
                      fontWeight: 800,
                      borderRadius: 2,
                      textTransform: 'none',
                    }}
                  >
                    KABUL
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<ThumbDownAltIcon />}
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setVoteVersion(decision.rowVersion);
                      setShowReasonInput(true);
                    }}
                    sx={{
                      bgcolor: '#d32f2f',
                      '&:hover': { bgcolor: '#c62828' },
                      py: 1.5,
                      px: 4,
                      fontWeight: 800,
                      borderRadius: 2,
                      textTransform: 'none',
                    }}
                  >
                    RET
                  </Button>
                </Box>
              </>
            )}

            {canVote && showReasonInput && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ color: '#d32f2f', fontWeight: 'bold' }}
                >
                  Ret oyu için gerekçe belirtiniz:
                </Typography>

                {voteChanged && (
                  <Alert severity="warning">
                    Karar değişti. Gerekçenizi kopyalayıp geri dönün, güncel kararı kontrol ederek yeniden RET seçin.
                  </Alert>
                )}

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  size="small"
                  placeholder="Ret gerekçesini yazınız..."
                  value={retReason}
                  disabled={busy}
                  onChange={(e) => setRetReason(e.target.value)}
                  helperText="Onayladığınız oy sonradan değiştirilemez."
                />

                <Button
                  variant="contained"
                  color="error"
                  onClick={handleConfirmRet}
                  disabled={busy || voteChanged || !retReason.trim()}
                  sx={{ fontWeight: 800, py: 1.2, borderRadius: 2, textTransform: 'none' }}
                >
                  GEREKÇEYİ ONAYLA VE RET OYU VER
                </Button>

                <Button
                  size="small"
                  startIcon={<ArrowBackIcon />}
                  disabled={busy}
                  onClick={() => {
                    setShowReasonInput(false);
                    setRetReason('');
                    setError('');
                  }}
                  sx={{ textTransform: 'none', color: NAVY, fontWeight: 700 }}
                >
                  Vazgeç / Geri Dön
                </Button>
              </Box>
            )}
          </Paper>

          {/* ANLIK OY DURUMU */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 3,
              bgcolor: '#ffffff',
              border: `1px solid ${BORDER}`,
              borderTop: `4px solid ${BLUE}`,
              boxShadow: '0 4px 16px rgba(0,31,63,0.04)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="h6"
              sx={{ fontWeight: 800, color: NAVY, mb: 2 }}
            >
              Anlık Oy Durumu
            </Typography>

            <Box sx={{ mb: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: 0.5,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 800, color: '#2e7d32' }}
                >
                  Kabul ({result.kabul})
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 800, color: '#d32f2f' }}
                >
                  Ret ({result.ret})
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                value={
                  result.kabul + result.ret === 0
                    ? 0
                    : (result.kabul / (result.kabul + result.ret)) * 100
                }
                sx={{
                  height: 10,
                  borderRadius: 5,
                  bgcolor: '#ffcdd2',
                  '& .MuiLinearProgress-bar': { bgcolor: '#2e7d32' },
                }}
              />
            </Box>

            <Typography variant="body2" sx={{ color: '#64748b', mb: 2, fontWeight: 600 }}>
              Bekleyen: {result.pending}
            </Typography>

            <Divider sx={{ my: 1.5 }} />

            <Typography
              variant="body2"
              sx={{
                fontWeight: 800,
                textAlign: 'center',
                color: NAVY,
              }}
            >
              Oy hakkı olan {result.eligible} üyeden{' '}
              {result.kabul + result.ret} oy kullandı
            </Typography>
          </Paper>
        </Box>

        {/* ANA KARAR İÇERİK KARTI */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 3.5 },
            mb: 3,
            borderRadius: 3,
            bgcolor: '#ffffff',
            border: `1px solid ${BORDER}`,
            borderTop: `4px solid ${BLUE}`,
            boxShadow: '0 4px 16px rgba(0,31,63,0.04)',
          }}
        >
          {decision.ilgi && (
            <Typography
              variant="body2"
              sx={{ color: '#64748b', mb: 2, fontWeight: 600 }}
            >
              <b>İlgi:</b> {decision.ilgi}
            </Typography>
          )}

          <Typography
            variant="body1"
            sx={{
              color: '#334155',
              lineHeight: 1.8,
              minHeight: '80px',
              p: 2.5,
              bgcolor: '#f8fafc',
              borderRadius: 2,
              border: `1px solid ${BORDER}`,
              whiteSpace: 'pre-line',
              overflowWrap: 'anywhere',
              fontWeight: 500,
            }}
          >
            {kararText}
          </Typography>

          {decision.tableColumns?.length > 0 && (
            <Box sx={{ mt: 3, overflowX: 'auto' }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5, color: NAVY, fontWeight: 800 }}>Karar Tablosu</Typography>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, color: NAVY }}>#</TableCell>
                    {decision.tableColumns.map((column, index) => (
                      <TableCell key={`${column.key}-${index}`} sx={{ fontWeight: 800, color: NAVY }}>{column.label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {decision.tableRows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      <TableCell sx={{ fontWeight: 600 }}>{rowIndex + 1}</TableCell>
                      {decision.tableColumns.map((column, index) => (
                        <TableCell key={`${column.key}-${index}`} sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#475569' }}>
                          {String(row?.[column.key] ?? '')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {decision.tableRows.length === 0 && (
                    <TableRow><TableCell colSpan={decision.tableColumns.length + 1}>Tabloda henüz satır yok.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          )}

          {decision.ekler && (
            <Typography variant="body2" sx={{ mt: 2.5, whiteSpace: 'pre-wrap', color: '#475569' }}>
              <b>Ekler açıklaması:</b> {decision.ekler}
            </Typography>
          )}

          {canManage && !attendanceLocked && !decision.rowVersion && (
            <Alert severity="warning" sx={{ mt: 2.5 }}>
              Kararın sürüm bilgisi gelmedi. API dosyalarını güncelleyip sayfayı yenileyin.
            </Alert>
          )}

          {canDelete && (
            <Box
              sx={{
                mt: 3,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 1.5,
                flexWrap: 'wrap',
                pt: 2,
                borderTop: `1px solid ${BORDER}`,
              }}
            >
              <Button
                variant="contained"
                size="small"
                startIcon={<EditIcon />}
                disabled={busy}
                onClick={openEditor}
                sx={{
                  bgcolor: YELLOW,
                  color: NAVY,
                  fontWeight: 800,
                  textTransform: 'none',
                  borderRadius: 2,
                  boxShadow: 'none',
                  '&:hover': { bgcolor: '#f0b400', boxShadow: 'none' },
                }}
              >
                Taslağı Düzenle
              </Button>
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
                disabled={busy}
                onClick={() => {
                  setError('');
                  setDeleteVersion(decision.rowVersion);
                  setConfirmDelete(true);
                }}
                sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}
              >
                Taslak Kararı Sil
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<HowToVoteIcon />}
                disabled={busy}
                onClick={() => setConfirmSubmit(true)}
                sx={{ bgcolor: NAVY, fontWeight: 800, textTransform: 'none', borderRadius: 2, boxShadow: 'none' }}
              >
                Oylamaya Sun
              </Button>
            </Box>
          )}
        </Paper>

        {/* OY DÖKÜMÜ VE EK DOSYA YÖNETİMİ: istenince açılır */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
          <Button
            variant="outlined"
            onClick={() => setShowVotes(!votesVisible)}
            sx={{ textTransform: 'none', fontWeight: 700, color: NAVY, borderColor: BORDER, borderRadius: 2 }}
          >
            {votesVisible ? 'Oy ve imza durumunu gizle' : 'Oy ve imza durumunu göster'}
          </Button>
          {canManage && (
            <Button
              variant="outlined"
              startIcon={<AttachFileIcon />}
              onClick={() => setShowAttachments((v) => !v)}
              sx={{ textTransform: 'none', fontWeight: 700, color: NAVY, borderColor: BORDER, borderRadius: 2 }}
            >
              {showAttachments ? 'Ek dosya yönetimini gizle' : 'Ek dosyaları yönet'}
            </Button>
          )}
        </Box>

        {votesVisible && (
          <Paper
            elevation={0}
            sx={{ p: 2.5, borderRadius: 3, mb: 3, bgcolor: '#ffffff', border: `1px solid ${BORDER}` }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 800, color: NAVY }}>Oy ve imza durumu</Typography>
              <Chip
                size="small"
                label={`${participants.filter((p) => p.attendance === 'Katilir' && (p.signedAt || p.preSignedAt)).length} / ${participants.filter((p) => p.attendance === 'Katilir').length} imza`}
                sx={{ bgcolor: SOFT, color: BLUE, fontWeight: 700 }}
              />
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                Sayfa birkaç saniyede bir kendiliğinden güncellenir.
              </Typography>
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    {['Adı Soyadı', 'Görevi', 'Oy', 'İmza', 'Gerekçe'].map((label) => (
                      <TableCell key={label} sx={{ fontWeight: 800, color: NAVY }}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {participants.filter((p) => p.attendance === 'Katilir').map((p) => (
                    <TableRow key={getMemberId(p)}>
                      <TableCell sx={{ fontWeight: 700, color: NAVY }}>{p.name}</TableCell>
                      <TableCell sx={{ color: '#475569', fontWeight: 600 }}>{p.title}</TableCell>
                      <TableCell>{voteChip(p)}</TableCell>
                      <TableCell>{signChip(p)}</TableCell>
                      <TableCell sx={{ color: '#64748b', fontStyle: 'italic', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                        {p.voteReason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        )}

        {canManage && showAttachments && (
          <AttachmentsPanel
            key={`attachments:${decision.id}:${Boolean(attendanceLocked)}`}
            decisionId={decision.id}
            signed={decision.status === 'Imzalandi'}
            onItemsChange={(newItems) => {
              setDecision((prev) => (prev ? { ...prev, attachments: newItems } : prev));
            }}
          />
        )}

        {/* LİFECYCLE PANEL (İPTAL / YENİDEN DEĞERLENDİRME) */}
        <DecisionLifecyclePanel decision={decision} busy={busy} error={error}
          onCancel={handleCancel} onReconsider={handleReconsider} />

        {/* E-İMZA PANELİ */}
        {['ImzaBekliyor', 'Imzalandi'].includes(decision.status) && (
          <SignaturePanel
            decision={decision}
            canManage={canManage}
            onChange={handleSignatureChange}
            onError={setError}
          />
        )}

        {preSignOpen && (
          <PreSignDialog
            open
            decision={decision}
            onClose={() => setPreSignOpen(false)}
            onSigned={() => {
              setPreSignOpen(false);
              run(() => getDecision(decision.id));
            }}
          />
        )}

        {/* KABUL OY ONAY DİALOGU */}
        <Dialog
          open={confirmKabul}
          onClose={() => {
            if (!busyRef.current) setConfirmKabul(false);
          }}
          fullWidth
          maxWidth="xs"
          slotProps={{ paper: { sx: { borderRadius: 3 } } }}
        >
          <DialogTitle sx={{ bgcolor: NAVY, color: '#fff', borderBottom: `4px solid ${YELLOW}`, fontWeight: 800 }}>Kabul Oyunu Onaylayın</DialogTitle>
          <DialogContent sx={{ pt: '20px !important' }}>
            <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>
              <b>{user?.name}</b> olarak <b>KABUL</b> oyu vereceksiniz.
              Oy bir kez kullanılır ve sonradan değiştirilemez.
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
            {(voteChanged || !canVote) && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Karar değişmiş veya oy kullanımına kapanmış olabilir. Pencereyi kapatıp güncel kararı kontrol edin.
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${BORDER}`, justifyContent: 'space-between' }}>
            <Button
              onClick={() => setConfirmKabul(false)}
              disabled={busy}
              sx={{
                color: NAVY,
                borderColor: '#b9c6d5',
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                '&:hover': { bgcolor: '#e3eefb', borderColor: NAVY },
              }}
            >
              Vazgeç
            </Button>
            <Button
              variant="contained"
              onClick={handleKabul}
              disabled={busy || voteChanged || !canVote}
              sx={{
                bgcolor: '#2e7d32',
                color: '#fff',
                fontWeight: 800,
                borderRadius: 2,
                textTransform: 'none',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#1b5e20', boxShadow: 'none' },
              }}
            >
              {busy ? 'Kaydediliyor...' : 'Onayla ve Kabul Et'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* EK DOSYA ÖNİZLEME */}
        <AttachmentPreviewDialog
          file={previewAttachment}
          loadBlob={loadPreviewBlob}
          onClose={() => setPreviewAttachment(null)}
        />

        {/* OYLAMAYA SUNMA ONAYI */}
        <Dialog
          open={confirmSubmit}
          onClose={() => {
            if (!busyRef.current) setConfirmSubmit(false);
          }}
          fullWidth
          maxWidth="xs"
          slotProps={{ paper: { sx: { borderRadius: 3 } } }}
        >
          <DialogTitle sx={{ bgcolor: NAVY, color: '#fff', borderBottom: `4px solid ${YELLOW}`, fontWeight: 800 }}>
            Oylamaya Sun
          </DialogTitle>
          <DialogContent sx={{ pt: '20px !important' }}>
            <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>
              Karar oylamaya sunulacak ve kurul üyelerine bildirim gidecek. Bundan sonra karar
              metni ve ekleri değiştirilemez.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${BORDER}`, justifyContent: 'space-between' }}>
            <Button onClick={() => setConfirmSubmit(false)} disabled={busy} sx={{ color: NAVY, textTransform: 'none', fontWeight: 700 }}>
              Vazgeç
            </Button>
            <Button
              variant="contained"
              disabled={busy || !canEditDraft}
              onClick={async () => {
                const ok = await run(() => submitDecision(decision.id, decision.rowVersion));
                if (ok) setConfirmSubmit(false);
              }}
              sx={{ bgcolor: YELLOW, color: NAVY, fontWeight: 800, textTransform: 'none', borderRadius: 2, boxShadow: 'none' }}
            >
              Oylamaya Sun
            </Button>
          </DialogActions>
        </Dialog>

        {/* SİLME ONAY DİALOGU */}
        <Dialog
          open={confirmDelete}
          onClose={() => {
            if (!busyRef.current) setConfirmDelete(false);
          }}
          fullWidth
          maxWidth="xs"
          slotProps={{ paper: { sx: { borderRadius: 3 } } }}
        >
          <DialogTitle sx={{ bgcolor: NAVY, color: '#fff', borderBottom: `4px solid ${YELLOW}`, fontWeight: 800 }}>Taslak Kararı Sil</DialogTitle>
          <DialogContent sx={{ pt: '20px !important' }}>
            <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>
              Bu taslak karar silinecek. Bu işlem geri alınamaz.
              Devam etmek istiyor musunuz?
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
            {(deleteChanged || !canDelete) && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Kararın durumu değiştiği için artık silinemez.
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${BORDER}`, justifyContent: 'space-between' }}>
            <Button
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              sx={{
                color: NAVY,
                borderColor: '#b9c6d5',
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                '&:hover': { bgcolor: '#e3eefb', borderColor: NAVY },
              }}
            >
              Vazgeç
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteDraft}
              disabled={busy || deleteChanged || !canDelete}
              sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}
            >
              {busy ? 'Siliniyor...' : 'Taslağı Sil'}
            </Button>
          </DialogActions>
        </Dialog>

        {editing && (
          <DraftDecisionDialog key={`editor:${editorRevision}`} snapshot={editing} latest={decision}
            busy={busy} error={error} onSave={saveDraft} onReload={reloadDraft}
            onClose={() => { if (!busyRef.current) { setEditing(null); setError(''); } }} />
        )}
        {/* EK DOSYALARI İNCELE DİYALOĞU */}
        <Dialog
          open={attachmentsModalOpen}
          onClose={() => setAttachmentsModalOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 3, p: 1 },
          }}
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2,
                bgcolor: SOFT,
                color: BLUE,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <AttachFileIcon sx={{ fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: NAVY, fontSize: '1.1rem' }}>
                Karar Ek Dosyaları ({attachmentCount})
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                Karara iliştirilmiş ekli belgeleri aşağıdan inceleyebilir ve indirebilirsiniz.
              </Typography>
            </Box>
          </DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 2 }}>
            {attachmentsList.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#94a3b8', textAlign: 'center', py: 3 }}>
                Bu karara ait ek dosya bulunmamaktadır.
              </Typography>
            ) : (
              <List sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 0 }}>
                {attachmentsList.map((att) => (
                  <Paper
                    key={att.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      bgcolor: '#f8fafc',
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                      <InsertDriveFileIcon sx={{ color: BLUE, fontSize: 28, flexShrink: 0 }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            color: NAVY,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: { xs: 180, sm: 280 },
                          }}
                          title={att.name}
                        >
                          {att.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          {formatAttachmentSize(att.size)}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                      {previewKind(att.name) && (
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<VisibilityOutlinedIcon />}
                          onClick={() => setPreviewAttachment(att)}
                          sx={{
                            textTransform: 'none',
                            borderRadius: 1.5,
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            bgcolor: BLUE,
                            boxShadow: 'none',
                          }}
                        >
                          Önizle
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => handleDownloadAttachment(att)}
                        sx={{
                          textTransform: 'none',
                          borderRadius: 1.5,
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          color: BLUE,
                          borderColor: BLUE,
                          '&:hover': {
                            bgcolor: SOFT,
                            borderColor: BLUE,
                          },
                        }}
                      >
                        İndir
                      </Button>
                    </Box>
                  </Paper>
                ))}
              </List>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, pt: 1, justifyContent: 'space-between' }}>
            <Button
              size="small"
              onClick={() => {
                setAttachmentsModalOpen(false);
                document.getElementById('attachments-panel')?.scrollIntoView({ behavior: 'smooth' });
              }}
              sx={{ textTransform: 'none', color: '#64748b', fontWeight: 600 }}
            >
              Sayfadaki Ekler Bölümüne Git
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={() => setAttachmentsModalOpen(false)}
              sx={{
                bgcolor: NAVY,
                color: '#ffffff',
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: 2,
                '&:hover': { bgcolor: BLUE },
              }}
            >
              Kapat
            </Button>
          </DialogActions>
        </Dialog>
    </PageLayout>
  );
}