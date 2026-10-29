import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  Box, Typography, Paper, Button, IconButton, Chip, Alert,
  List, ListItem, ListItemIcon, ListItemText, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Badge,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';

import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import VerifiedIcon from '@mui/icons-material/Verified';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import AttachmentPreviewDialog, { previewKind } from './AttachmentPreviewDialog';
import GppBadIcon from '@mui/icons-material/GppBad';

import {
  listAttachments,
  uploadAttachments,
  deleteAttachment,
  downloadAttachment,
  fetchAttachmentBlob,
  verifyAttachments,
} from '../api/files';

const ACCEPT = '.pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg,.zip';
const ALLOWED_EXTENSIONS = new Set(ACCEPT.split(','));
const MAX_MB = 25;

const errorMessage = (error) =>
  error instanceof Error && error.message
    ? error.message
    : 'İşlem tamamlanamadı.';

const formatSize = (value) => {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes < 0) return 'Boyut bilinmiyor';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
};

const formatDate = (value) => {
  if (!value) return 'Tarih bilinmiyor';

  const normalized = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value)
    ? value
    : `${value}Z`;

  const date = new Date(normalized);

  return Number.isNaN(date.getTime())
    ? 'Tarih bilinmiyor'
    : date.toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
      });
};

export default function AttachmentsPanel({
  decisionId,
  signed = false,
  onItemsChange,
}) {
  const [items, setItems] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [verification, setVerification] = useState(null);
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyAttempt, setVerifyAttempt] = useState(0);

  const lock = useRef(false);
  const activeId = useRef(null);
  const loadVersion = useRef(0);

  // Üst bileşen her render'da yeni fonksiyon verebilir; son hali ref'te tutulur.
  const onItemsChangeRef = useRef(onItemsChange);
  useEffect(() => {
    onItemsChangeRef.current = onItemsChange;
  });

  const editable = canEdit && !signed && !loading && !loadError;

  const load = useCallback(async () => {
    const version = ++loadVersion.current;

    const isCurrent = () =>
      activeId.current === decisionId &&
      version === loadVersion.current;

    if (activeId.current !== decisionId) return false;

    setLoading(true);
    setLoadError('');

    try {
      const data = await listAttachments(decisionId);

      if (!Array.isArray(data?.items)) {
        throw new Error('Sunucudan geçerli bir ek listesi alınamadı.');
      }

      if (!isCurrent()) return false;

      setItems(data.items);
      onItemsChangeRef.current?.(data.items);
      setCanEdit(data.canEdit === true);
      return true;
    } catch (err) {
      if (isCurrent()) {
        setCanEdit(false);
        setLoadError(errorMessage(err));
      }

      return false;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [decisionId]);

  useEffect(() => {
    activeId.current = decisionId;

    setItems([]);
    setCanEdit(false);
    setError('');
    setNotice('');
    setDeleteTarget(null);

    load();

    return () => {
      activeId.current = null;
      loadVersion.current += 1;
    };
  }, [decisionId, signed, load]);

  useEffect(() => {
    let cancelled = false;

    setVerification(null);
    setVerifyError('');
    setVerifying(false);

    if (!signed || loading || loadError) return undefined;

    setVerifying(true);

    verifyAttachments(decisionId)
      .then((result) => {
        if (cancelled) return;

        if (
          typeof result?.valid !== 'boolean' ||
          !Array.isArray(result.items)
        ) {
          throw new Error('Geçerli doğrulama sonucu alınamadı.');
        }

        setVerification(result);
      })
      .catch((err) => {
        if (!cancelled) setVerifyError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signed, decisionId, items, loading, loadError, verifyAttempt]);

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (lock.current || !editable || files.length === 0) return;

    setError('');
    setNotice('');

    const invalidFile = files.find((file) => {
      const dot = file.name.lastIndexOf('.');
      const extension = dot >= 0
        ? file.name.slice(dot).toLowerCase()
        : '';

      return !ALLOWED_EXTENSIONS.has(extension);
    });

    if (invalidFile) {
      setError(`"${invalidFile.name}" izin verilen dosya türlerinden değil.`);
      return;
    }

    const tooBig = files.find(
      (file) => file.size > MAX_MB * 1024 * 1024
    );

    if (tooBig) {
      setError(`"${tooBig.name}" çok büyük. Dosya sınırı ${MAX_MB} MB.`);
      return;
    }

    lock.current = true;
    setBusy(true);
    const operationId = decisionId;

    try {
      await uploadAttachments(operationId, files);

      if (activeId.current !== operationId) return;

      setNotice('Dosyalar yüklendi.');
      const refreshed = await load();

      if (!refreshed && activeId.current === operationId) {
        setNotice(
          'Yükleme tamamlandı, ancak ek listesi yenilenemedi. Yeniden yüklemeden önce listeyi yenileyin.'
        );
      }
    } catch (err) {
      if (activeId.current === operationId) {
        setError(
          `${errorMessage(err)} Tekrar yüklemeden önce ek listesini kontrol edin.`
        );

        // İstek kısmen tamamlanmış olabilir; mevcut dosyaları göster.
        await load();
      }
    } finally {
      lock.current = false;
      if (activeId.current === operationId) setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (lock.current || !editable || !deleteTarget) return;

    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');

    const operationId = decisionId;
    const target = deleteTarget;

    try {
      await deleteAttachment(operationId, target.id);

      if (activeId.current !== operationId) return;

      setDeleteTarget(null);
      setNotice('Dosya silindi.');
      const refreshed = await load();

      if (!refreshed && activeId.current === operationId) {
        setNotice('Dosya silindi, ancak ek listesi yenilenemedi.');
      }
    } catch (err) {
      if (activeId.current === operationId) {
        setError(errorMessage(err));
        await load();
      }
    } finally {
      lock.current = false;
      if (activeId.current === operationId) setBusy(false);
    }
  };

  const [previewTarget, setPreviewTarget] = useState(null);
  const loadPreviewBlob = useCallback(
    () => fetchAttachmentBlob(decisionId, previewTarget),
    [decisionId, previewTarget]
  );

  const handleDownload = async (attachment) => {
    if (lock.current) return;

    lock.current = true;
    setBusy(true);
    setError('');

    const operationId = decisionId;

    try {
      await downloadAttachment(operationId, attachment);
    } catch (err) {
      if (activeId.current === operationId) {
        setError(errorMessage(err));
      }
    } finally {
      lock.current = false;
      if (activeId.current === operationId) setBusy(false);
    }
  };

  const closeDelete = () => {
    if (!lock.current) setDeleteTarget(null);
  };

  return (
    <Paper id="attachments-panel" elevation={2} sx={{ p: 3, borderRadius: '12px', mb: 4 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Badge
            badgeContent={items.length}
            color="primary"
            sx={{
              '& .MuiBadge-badge': {
                bgcolor: '#1b4a94',
                color: '#ffffff',
                fontWeight: 'bold',
              },
            }}
          >
            <AttachFileIcon sx={{ color: '#1b4a94', fontSize: 24 }} />
          </Badge>
          <Typography
            variant="h6"
            sx={{ fontWeight: 'bold', color: '#27385a' }}
          >
            Karar Ek Dosyaları ({items.length})
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            disabled={busy || loading}
            onClick={() => load()}
            sx={{ textTransform: 'none' }}
          >
            Listeyi Yenile
          </Button>

          {editable && (
            <Button
              component="label"
              variant="outlined"
              size="small"
              disabled={busy}
              startIcon={
                busy
                  ? <CircularProgress size={16} />
                  : <CloudUploadIcon />
              }
              sx={{
                textTransform: 'none',
                color: '#1b4a94',
                borderColor: '#1b4a94',
              }}
            >
              Dosya Yükle
              <input
                type="file"
                hidden
                multiple
                accept={ACCEPT}
                disabled={busy || !editable}
                onChange={handleUpload}
              />
            </Button>
          )}
        </Box>
      </Box>

      {items.length > 0 && (
        <Alert
          severity="info"
          icon={<AttachFileIcon sx={{ color: '#1b4a94' }} />}
          sx={{ mb: 2, bgcolor: '#f0f7ff', border: '1px solid #cce3fd', color: '#1e293b' }}
        >
          Bu karara bağlı <strong>{items.length} adet ek dosya</strong> bulunmaktadır. İlgili belgeleri aşağıdan doğrudan inceleyebilir ve indirebilirsiniz.
        </Alert>
      )}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setError('')}
        >
          {error}
        </Alert>
      )}

      {loadError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Ek listesi yenilenemedi: {loadError}
        </Alert>
      )}

      {notice && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={() => setNotice('')}
        >
          {notice}
        </Alert>
      )}

      {signed && verifying && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">
            Ek dosyaların bütünlüğü kontrol ediliyor...
          </Typography>
        </Box>
      )}

      {signed && verifyError && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={verifying}
              onClick={() => setVerifyAttempt((value) => value + 1)}
            >
              Tekrar Dene
            </Button>
          }
        >
          Bütünlük kontrolü yapılamadı: {verifyError}
        </Alert>
      )}

      {signed && verification && (
        <Alert
          severity={verification.valid ? 'success' : 'error'}
          icon={verification.valid ? <VerifiedIcon /> : <GppBadIcon />}
          sx={{ mb: 2 }}
        >
          {verification.items.length === 0 && verification.valid
            ? 'Doğrulanacak ek dosya bulunmuyor.'
            : verification.valid
              ? 'Ek dosyalar kayıtlı dosya özetleriyle eşleşiyor.'
              : 'Bazı dosyalar kayıtlı özetleriyle eşleşmiyor veya sunucuda bulunamıyor.'}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : items.length === 0 ? (
        <Typography variant="body2" sx={{ color: '#94a3b8', py: 1 }}>
          {loadError
            ? 'Ek listesi şu anda görüntülenemiyor.'
            : editable
              ? 'Henüz ek yok. Dosya Yükle ile belge ekleyebilirsiniz.'
              : 'Bu karara ek yüklenmemiş.'}
        </Typography>
      ) : (
        <List
          dense
          sx={{
            bgcolor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          {items.map((attachment, index) => {
            const check = verification?.items.find(
              (item) => String(item.id) === String(attachment.id)
            );

            return (
              <ListItem
                key={attachment.id}
                sx={{
                  pr: editable ? 22 : 18,
                  borderBottom:
                    index !== items.length - 1
                      ? '1px solid #e2e8f0'
                      : 'none',
                }}
                secondaryAction={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
                    {previewKind(attachment.name) && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<VisibilityOutlinedIcon fontSize="small" />}
                        aria-label={`${attachment.name} dosyasını önizle`}
                        disabled={busy}
                        onClick={() => setPreviewTarget(attachment)}
                        sx={{
                          textTransform: 'none',
                          bgcolor: '#1b4a94',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          borderRadius: 1.5,
                          px: 1.2,
                          boxShadow: 'none',
                        }}
                      >
                        Önizle
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon fontSize="small" />}
                      aria-label={`${attachment.name} dosyasını indir`}
                      disabled={busy}
                      onClick={() => handleDownload(attachment)}
                      sx={{
                        textTransform: 'none',
                        color: '#1b4a94',
                        borderColor: '#1b4a94',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        borderRadius: 1.5,
                        px: 1.2,
                        '&:hover': {
                          bgcolor: '#e3eefb',
                          borderColor: '#1b4a94',
                        },
                      }}
                    >
                      İndir
                    </Button>

                    {editable && (
                      <IconButton
                        size="small"
                        title="Sil"
                        aria-label={`${attachment.name} dosyasını sil`}
                        disabled={busy}
                        onClick={() => {
                          setError('');
                          setDeleteTarget(attachment);
                        }}
                        sx={{ color: '#d32f2f' }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                }
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <InsertDriveFileIcon
                    fontSize="small"
                    sx={{ color: '#1b4a94' }}
                  />
                </ListItemIcon>

                <ListItemText
                  primary={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      <span>{attachment.name}</span>

                      {check && (
                        <Chip
                          size="small"
                          label={
                            check.ok
                              ? 'Doğrulandı'
                              : check.missing
                                ? 'Dosya yok'
                                : 'Özet eşleşmiyor'
                          }
                          sx={{
                            bgcolor: check.ok ? '#dcfce7' : '#fee2e2',
                            color: check.ok ? '#15803d' : '#b91c1c',
                            height: 20,
                          }}
                        />
                      )}
                    </Box>
                  }
                  slotProps={{
                    primary: {
                      component: 'div',
                      variant: 'body2',
                      fontWeight: 500,
                    },
                  }}
                  secondary={
                    `${formatSize(attachment.size)} · ` +
                    formatDate(attachment.uploadedAt)
                  }
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <Typography
        variant="caption"
        sx={{ color: '#64748b', display: 'block', mt: 1.5 }}
      >
        İzin verilen türler: PDF, Excel, Word, CSV, PNG, JPG, ZIP.
        Dosya başına en fazla {MAX_MB} MB.
        Yükleme ve silme iznini sunucu belirler.
      </Typography>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={closeDelete}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Ek dosyayı sil</DialogTitle>

        <DialogContent>
          <Typography
            variant="body2"
            sx={{ color: '#475569', overflowWrap: 'anywhere' }}
          >
            “{deleteTarget?.name}” dosyası silinecek.
            Bu işlem geri alınamaz.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {!editable && !busy && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Silme izni doğrulanamadı. Listeyi yenileyerek kontrol edin.
            </Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={closeDelete} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy || !editable}
            onClick={handleDelete}
          >
            {busy ? 'İşlem yapılıyor...' : 'Dosyayı Sil'}
          </Button>
        </DialogActions>
      </Dialog>

      <AttachmentPreviewDialog
        file={previewTarget}
        loadBlob={loadPreviewBlob}
        onClose={() => setPreviewTarget(null)}
      />
    </Paper>
  );
}