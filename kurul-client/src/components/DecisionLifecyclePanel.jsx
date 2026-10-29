import React, { useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions,
  DialogContent, DialogTitle, Paper, TextField, Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import MeetingPicker from './MeetingPicker';

export default function DecisionLifecyclePanel({
  decision,
  busy,
  error,
  onCancel,
  onReconsider,
}) {
  const navigate = useNavigate();

  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [meeting, setMeeting] = useState(null);
  const [version, setVersion] = useState(null);

  const sendLock = useRef(false);

  const changed = version !== decision.rowVersion;
  const cancelled = decision.status === 'IptalEdildi';
  const signed = (decision.participants || []).filter((p) => p.signedAt);

  const open = (value) => {
    setVersion(decision.rowVersion);
    setAction(value);
    setReason('');
    setMeeting(null);
  };

  const close = () => {
    if (!busy && !sendLock.current) setAction(null);
  };

  const send = async (event) => {
    event.preventDefault();

    if (busy || changed || sendLock.current) return;

    if (
      action === 'cancel' &&
      (!decision.canCancel || !reason.trim())
    ) return;

    if (
      action === 'reconsider' &&
      (!decision.canReconsider || !meeting?.id)
    ) return;

    sendLock.current = true;

    try {
      const success = action === 'cancel'
        ? await onCancel(reason.trim(), version)
        : await onReconsider({
            meetingId: meeting.id,
            meetingDate: meeting.meetingDate,
            meetingNo: meeting.meetingNo,
            rowVersion: version,
          });

      if (success) setAction(null);
    } finally {
      sendLock.current = false;
    }
  };

  if (
    !decision.canCancel &&
    !decision.canReconsider &&
    !cancelled &&
    !decision.sourceDecisionId &&
    !decision.reconsiderationDecisionId
  ) return null;

  return (
    <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Karar Süreci
      </Typography>

      {cancelled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <b>Süreç iptal edildi.</b>
          <br />
          {decision.cancelledByName}
          {' · '}
          {decision.cancelledAt
            ? new Date(decision.cancelledAt).toLocaleString('tr-TR')
            : ''}
          <Box sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
            {decision.cancellationReason}
          </Box>
        </Alert>
      )}

      {cancelled && signed.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2">
            İptalden önceki imza kayıtları
          </Typography>

          {signed.map((p) => (
            <Typography
              key={p.memberId}
              variant="body2"
              sx={{ overflowWrap: 'anywhere' }}
            >
              {p.name} · {new Date(p.signedAt).toLocaleString('tr-TR')}
              {' · '}{p.signatureRef}
            </Typography>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {decision.sourceDecisionId && (
          <Button
            disabled={busy}
            onClick={() => navigate(`/oylama/${decision.sourceDecisionId}`)}
          >
            Kaynak Kararı Gör (#{decision.sourceDecisionId})
          </Button>
        )}

        {decision.reconsiderationDecisionId ? (
          <Button
            disabled={busy}
            onClick={() => navigate(`/oylama/${decision.reconsiderationDecisionId}`)}
          >
            Bağlı Kararı Aç (#{decision.reconsiderationDecisionId})
          </Button>
        ) : decision.canReconsider && (
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() => open('reconsider')}
          >
            Yeniden Değerlendirme Taslağı Oluştur
          </Button>
        )}

        {decision.canCancel && (
          <Button
            color="warning"
            variant="outlined"
            disabled={busy}
            onClick={() => open('cancel')}
          >
            Süreci Gerekçeyle İptal Et
          </Button>
        )}
      </Box>

      <Dialog
        open={Boolean(action)}
        onClose={close}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={send}>
          <DialogTitle>
            {action === 'cancel'
              ? 'Karar sürecini iptal et'
              : 'Yeni değerlendirme taslağı'}
          </DialogTitle>

          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {changed && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Karar değişti. Pencereyi kapatıp güncel durumu kontrol edin.
              </Alert>
            )}

            {action === 'cancel' ? (
              <>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Oylar ve mevcut imzalar geçmiş kayıtta korunacak.
                  Karar iptal edilmiş olarak arşivde görünecek.
                </Typography>

                <TextField
                  fullWidth
                  required
                  multiline
                  minRows={3}
                  label="İptal gerekçesi"
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                />
              </>
            ) : (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Metin ve tablo kopyalanır; oylar, imzalar ve sabit PDF
                  kopyalanmaz. Katılımcılar seçilen toplantıdan alınır.
                  Eski ekler kaynak kararda kalır; gerekli dosyaları yeni
                  taslağa yeniden yükleyin.
                </Alert>

                <MeetingPicker
                  value={meeting}
                  onChange={setMeeting}
                  disabled={busy || changed}
                />
              </>
            )}
          </DialogContent>

          <DialogActions>
            <Button disabled={busy} onClick={close}>
              Vazgeç
            </Button>

            <Button
              type="submit"
              variant="contained"
              color={action === 'cancel' ? 'warning' : 'primary'}
              disabled={
                busy ||
                changed ||
                (
                  action === 'cancel'
                    ? !decision.canCancel || !reason.trim()
                    : !decision.canReconsider || !meeting?.id
                )
              }
            >
              {busy
                ? 'İşleniyor...'
                : action === 'cancel'
                  ? 'İptali Onayla'
                  : 'Yeni Taslak Oluştur'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Paper>
  );
}