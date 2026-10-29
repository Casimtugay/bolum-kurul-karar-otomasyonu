import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog,
  DialogActions, DialogContent, DialogTitle,
  FormControlLabel, TextField, Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import DrawIcon from '@mui/icons-material/Draw';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SignatureEditor, { SignaturePreview } from './SignatureEditor';
import { getMySignature } from '../api/signature';
import { apiFetch } from '../api/client';

// Oy kullanan üye, oylamanın bitmesini beklemeden imzasını verir.
// İmza sunucuda saklanır; oylama kabulle tamamlanınca imzaya esas PDF'e bağlanır.
export default function PreSignDialog({ decision, open, onClose, onSigned }) {
  const [signatureImage, setSignatureImage] = useState('');
  const [savedImage, setSavedImage] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Kayıtlı imza varsa hazır gelir; yoksa imza yükleme alanı açılır.
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const close = () => {
    if (busy) return;
    setPassword('');
    setReviewed(false);
    setError('');
    onClose();
  };

  const canSubmit = Boolean(reviewed && signatureImage && password && !editorOpen && !busy);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch(`/api/decisions/${encodeURIComponent(decision.id)}/signature/presign`, {
        method: 'POST',
        body: {
          password,
          signatureImage,
          saveSignature: saveToProfile && signatureImage !== savedImage,
          rowVersion: decision.rowVersion,
        },
      });
      if (!alive.current) return;
      setPassword('');
      setReviewed(false);
      onSigned(updated);
    } catch (err) {
      if (alive.current) setError(err?.message || 'İmza kaydedilemedi.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800 }}>
        <DrawIcon sx={{ color: '#1b4a94' }} />
        Kararı imzala
      </DialogTitle>

      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Diğer üyelerin oylamayı bitirmesini beklemeniz gerekmez. İmzanız şimdi alınır ve oylama
          kabulle tamamlandığında karar belgesine otomatik eklenir. Karar reddedilirse imzanız kullanılmaz.
        </Alert>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Button
          component={RouterLink}
          to={`/tutanak/${decision.id}`}
          target="_blank"
          rel="noopener"
          size="small"
          startIcon={<PictureAsPdfIcon />}
          sx={{ textTransform: 'none', fontWeight: 700, mb: 1 }}
        >
          Karar belgesini yeni sekmede incele
        </Button>

        <FormControlLabel
          sx={{ display: 'flex', mb: 2 }}
          control={
            <Checkbox
              checked={reviewed}
              disabled={busy}
              onChange={(event) => setReviewed(event.target.checked)}
            />
          }
          label="Karar metnini inceledim; oylama kabulle sonuçlanırsa bu kararı imzalıyorum."
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
          disabled={busy}
          onChange={(event) => setPassword(event.target.value)}
          helperText="Güvenlik için giriş parolanız tekrar sorulur."
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
      </DialogContent>

      <DialogActions>
        <Button disabled={busy} onClick={close}>Vazgeç</Button>
        <Button variant="contained" disabled={!canSubmit} onClick={submit} sx={{ bgcolor: '#1b4a94' }}>
          {busy ? 'İşlem sürüyor…' : 'İmzala'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
