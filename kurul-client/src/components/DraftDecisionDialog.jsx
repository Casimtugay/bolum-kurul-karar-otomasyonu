import React, { useState, useRef } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, TextField, Typography,
} from '@mui/material';
import DecisionTable from './DecisionTable';

// snapshot bu pencere açılırken alınır. Arka plandaki yenileme yazılan metni değiştirmez.
export default function DraftDecisionDialog({ snapshot, latest, busy, error, onSave, onReload, onClose }) {
  const [agenda, setAgenda] = useState(snapshot.gundem || snapshot.konu || '');
  const [reference, setReference] = useState(snapshot.ilgi || '');
  const [content, setContent] = useState(snapshot.karar || '');
  const [note, setNote] = useState(snapshot.ekler || '');
  const [rows, setRows] = useState(() => snapshot.tableRows.map((row) => ({ ...row })));
  const formRef = useRef(null);
  const changed = snapshot.rowVersion !== latest.rowVersion;
  const locked = latest.status !== 'Taslak' || latest.signedAt || latest.sealedAt || latest.documentHash ||
    latest.participants.some((p) => p.vote != null || p.signedAt != null);
  const canSave = !busy && !locked && !changed && Boolean(snapshot.rowVersion);
  const close = () => { if (!busy) onClose(); };
  const save = (event) => {
    event.preventDefault();
    if (!canSave || !agenda.trim() || !content.trim()) return;
    onSave({
      agenda: agenda.trim(), reference, content, attachmentsNote: note,
      tableColumnsJson: JSON.stringify(snapshot.tableColumns),
      tableRowsJson: JSON.stringify(rows), rowVersion: snapshot.rowVersion,
    });
  };
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <DialogTitle>Taslak Kararı Düzenle</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2, color: '#64748b' }}>
          Toplantı: {snapshot.meetingYear} / {snapshot.meetingNo} · Karar: {snapshot.decisionNo}
          {' '}· Tarih: {snapshot.tarih}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {locked && <Alert severity="warning" sx={{ mb: 2 }}>
          Oylama veya imza süreci başladı. Bu taslak artık düzenlenemez. Yazdıklarınızı buradan kopyalayabilirsiniz.
        </Alert>}
        {changed && !locked && <Alert severity="warning" sx={{ mb: 2 }}>
          Karar başka bir işlemle değişti. Yazdıklarınız korunuyor; eski sürümün üzerine kayıt yapılamaz.
          Devam etmek için metninizi kopyalayıp güncel kararı yükleyin.
        </Alert>}
        {!snapshot.rowVersion && <Alert severity="error" sx={{ mb: 2 }}>
          Kararın sürüm bilgisi eksik. API dosyalarını güncelleyip sayfayı yenileyin.
        </Alert>}
        <Box component="form" ref={formRef} onSubmit={save}>
          <Box component="fieldset" disabled={busy} sx={{ m: 0, p: 0, border: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="İlgi (Varsa)" value={reference} onChange={(e) => setReference(e.target.value)} />
            <TextField fullWidth required label="Gündem Konusu" value={agenda} onChange={(e) => setAgenda(e.target.value)} />
            <TextField fullWidth required label="Karar Metni" multiline minRows={6} value={content}
              onChange={(e) => setContent(e.target.value)}
              helperText="{OY_SONUCU} alanı oylama tamamlanınca otomatik doldurulur." />
            {snapshot.tableColumns.length > 0 && (
              <DecisionTable columns={snapshot.tableColumns} rows={rows} setRows={setRows} />
            )}
            <TextField fullWidth label="Ekler Metni (Tutanakta Görünecek)" multiline minRows={2}
              value={note} onChange={(e) => setNote(e.target.value)} />
            <Typography variant="body2" color="text.secondary">
              Dosya eklemek veya silmek için bu pencereyi kapatıp karar sayfasındaki Ekler bölümünü kullanın.
              Yüklenen dosyaların adları tutanakta ayrıca listelenir.
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button disabled={busy} color="warning" onClick={() => {
          if (window.confirm('Bu pencerede yazdıklarınız silinecek ve güncel karar yüklenecek. Devam edilsin mi?')) onReload();
        }}>Güncel Kararı Yükle</Button>
        <Button disabled={busy} onClick={close}>Vazgeç</Button>
        <Button variant="contained" disabled={!canSave || !agenda.trim() || !content.trim()}
          sx={{ bgcolor: '#1b4a94' }} onClick={() => formRef.current?.requestSubmit()}>
          {busy ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
