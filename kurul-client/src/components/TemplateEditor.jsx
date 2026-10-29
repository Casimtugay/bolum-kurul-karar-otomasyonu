import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';

import { apiRequest, readApiBlob } from '../api/client';
import { deleteTemplate, extractDocumentText, saveTemplate, splitDecisionText } from '../api/templates';
import { NAVY, YELLOW, BORDER } from '../styles/adminTheme';

// Yeni karar şablonu oluşturma / düzenleme.
// Dışarıdan bir PDF veya Word belgesi içe aktarılabilir: metni çıkarılır, "İLGİ / GÜNDEM / KARAR"
// başlıkları varsa alanlara dağıtılır; tüm metinler burada serbestçe düzenlenir.
// Belgenin kendi sayfa düzeni korunmaz; karar, imza ve karekod alanları olan kurul formatına aktarılır.

const EMPTY = {
  name: '',
  reference: '',
  agenda: '',
  content: '',
  attachmentsNote: '',
  tableColumns: [],
  isDraft: true,
};

const toForm = (template) =>
  template
    ? {
        ...EMPTY,
        ...template,
        tableColumns: (() => {
          try { return JSON.parse(template.tableColumnsJson || '[]'); } catch { return []; }
        })(),
      }
    : { ...EMPTY };

const slug = (label, index) =>
  `kolon_${index}_${label.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşöçı]+/g, '_').slice(0, 20)}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function TemplateEditor({ open, template, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(() => toForm(template));
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [columnInput, setColumnInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const fileRef = useRef(null);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const importFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setError('');
    setInfo('');
    try {
      const text = await extractDocumentText(file);
      if (!text) {
        setError('Dosyada okunabilir metin bulunamadı (taranmış/resim PDF olabilir). Metni elle yazabilirsiniz.');
        return;
      }
      setImportText(text);
      const parts = splitDecisionText(text);
      setForm((f) => ({
        ...f,
        name: f.name || file.name.replace(/\.(pdf|docx)$/i, ''),
        reference: parts.reference ?? f.reference,
        agenda: parts.agenda ?? f.agenda,
        content: parts.content ?? f.content,
        attachmentsNote: parts.attachmentsNote ?? f.attachmentsNote,
      }));
      setInfo(
        parts.reference || parts.agenda
          ? 'Belgedeki İLGİ / GÜNDEM / KARAR bölümleri alanlara yerleştirildi. Metinleri kontrol edip düzenleyin.'
          : 'Belgenin metni karar metni alanına aktarıldı. Gereksiz kısımları silip düzenleyin.'
      );
    } catch (err) {
      setError(err?.message || 'Dosya okunamadı.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addColumn = () => {
    const label = columnInput.trim();
    if (!label || form.tableColumns.length >= 10) return;
    setForm((f) => ({
      ...f,
      tableColumns: [...f.tableColumns, { key: slug(label, f.tableColumns.length + 1), label }],
    }));
    setColumnInput('');
  };

  const body = (isDraft) => ({
    id: template?.id,
    name: form.name.trim(),
    reference: form.reference,
    agenda: form.agenda,
    content: form.content,
    attachmentsNote: form.attachmentsNote,
    tableColumnsJson: JSON.stringify(form.tableColumns),
    isDraft,
  });

  const save = async (isDraft) => {
    if (!form.name.trim()) {
      setError('Şablon adı zorunludur.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await saveTemplate(body(isDraft));
      onSaved?.(saved, isDraft);
    } catch (err) {
      setError(err?.message || 'Şablon kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!template?.id || !window.confirm(`“${template.name}” şablonu silinsin mi?`)) return;
    setBusy(true);
    try {
      await deleteTemplate(template.id);
      onDeleted?.(template.id);
    } catch (err) {
      setError(err?.message || 'Şablon silinemedi.');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest('/api/decisions/preview-pdf', {
        method: 'POST',
        json: true,
        body: {
          meetingDate: todayIso(),
          meetingNo: 1,
          agenda: form.agenda || form.name,
          reference: form.reference,
          content: form.content,
          attachmentsNote: form.attachmentsNote,
          tableColumnsJson: JSON.stringify(form.tableColumns),
          tableRowsJson: '[]',
          attachmentNames: [],
        },
      });
      const blob = await readApiBlob(response);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err?.message || 'Önizleme oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  const field = (label, key, props = {}) => (
    <TextField
      label={label}
      value={form[key]}
      onChange={set(key)}
      fullWidth
      size="small"
      disabled={busy}
      {...props}
    />
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen>
      <DialogTitle
        sx={{
          bgcolor: NAVY,
          color: '#fff',
          borderBottom: `4px solid ${YELLOW}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontWeight: 700,
        }}
      >
        <Box sx={{ flex: 1 }}>{template?.id ? 'Şablonu düzenle' : 'Yeni karar şablonu'}</Box>
        <IconButton onClick={onClose} disabled={busy} aria-label="Kapat" sx={{ color: '#fff' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ bgcolor: '#f5f6f8', p: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.1fr) minmax(0, 1fr)' },
            gap: 3,
            mt: 1,
          }}
        >
          {/* SOL: düzenlenebilir alanlar */}
          <Box sx={{ bgcolor: '#fff', border: `1px solid ${BORDER}`, borderRadius: 2, p: 2.5, display: 'grid', gap: 2, alignContent: 'start' }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                ref={fileRef}
                type="file"
                hidden
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => importFile(e.target.files?.[0])}
              />
              <Button
                variant="outlined"
                startIcon={importing ? <CircularProgress size={16} /> : <UploadFileOutlinedIcon />}
                disabled={busy || importing}
                onClick={() => fileRef.current?.click()}
              >
                PDF / Word'den içe aktar
              </Button>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                Örnek bir karar yazısını yükleyin; metni çıkarılır ve aşağıda düzenlenebilir.
              </Typography>
            </Box>

            {info && <Alert severity="info" onClose={() => setInfo('')}>{info}</Alert>}
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

            {field('Şablon adı', 'name', { required: true, slotProps: { htmlInput: { maxLength: 200 } } })}
            {field('İlgi', 'reference', { multiline: true, minRows: 1 })}
            {field('Gündem', 'agenda', { multiline: true, minRows: 2 })}
            {field('Karar metni', 'content', {
              multiline: true,
              minRows: 12,
              helperText: 'Metindeki “oy birliği ile” ifadesi, oylama bitince sonuca göre (oy birliği / oy çokluğu) otomatik değişir.',
              sx: { '& textarea': { fontFamily: '"Times New Roman", serif', fontSize: '1rem', lineHeight: 1.6 } },
            })}
            {field('Ekler', 'attachmentsNote', { multiline: true, minRows: 1 })}

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Karar tablosu sütunları (isteğe bağlı)
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                {form.tableColumns.map((column, index) => (
                  <Chip
                    key={column.key}
                    label={column.label}
                    onDelete={busy ? undefined : () => setForm((f) => ({
                      ...f,
                      tableColumns: f.tableColumns.filter((_, i) => i !== index),
                    }))}
                  />
                ))}
                {!form.tableColumns.length && (
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Tablo yok.</Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  placeholder="Sütun adı (ör. Öğrenci No)"
                  value={columnInput}
                  onChange={(e) => setColumnInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColumn(); } }}
                  disabled={busy || form.tableColumns.length >= 10}
                  sx={{ flex: 1 }}
                />
                <Button startIcon={<AddIcon />} onClick={addColumn} disabled={busy || !columnInput.trim()}>
                  Ekle
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', borderTop: `1px solid ${BORDER}`, pt: 2 }}>
              {template?.id && (
                <Button color="error" startIcon={<DeleteOutlinedIcon />} disabled={busy} onClick={remove}>
                  Sil
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} disabled={busy} onClick={preview}>
                PDF önizle
              </Button>
              <Button variant="outlined" startIcon={<SaveOutlinedIcon />} disabled={busy} onClick={() => save(true)}>
                Taslak olarak kaydet
              </Button>
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => save(false)}
                sx={{ bgcolor: YELLOW, color: NAVY, fontWeight: 700, '&:hover': { bgcolor: '#f0b400' } }}
              >
                Kaydet ve kullanıma aç
              </Button>
            </Box>
          </Box>

          {/* SAĞ: PDF önizleme veya içe aktarılan özgün metin */}
          <Box sx={{ bgcolor: '#fff', border: `1px solid ${BORDER}`, borderRadius: 2, p: 2.5, minHeight: 400, display: 'flex', flexDirection: 'column' }}>
            {pdfUrl ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography sx={{ fontWeight: 700, flex: 1 }}>Kurul formatında önizleme</Typography>
                  <Button size="small" onClick={() => setPdfUrl('')}>Kapat</Button>
                </Box>
                <Box component="iframe" title="Şablon önizlemesi" src={pdfUrl} sx={{ flex: 1, minHeight: '70vh', border: `1px solid ${BORDER}` }} />
              </>
            ) : importText ? (
              <>
                <Typography sx={{ fontWeight: 700, mb: 0.5 }}>İçe aktarılan belgenin metni</Typography>
                <Typography variant="caption" sx={{ color: '#64748b', mb: 1 }}>
                  Buradan istediğiniz kısımları kopyalayıp soldaki alanlara yapıştırabilirsiniz.
                </Typography>
                <TextField
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  multiline
                  minRows={20}
                  fullWidth
                  sx={{ '& textarea': { fontFamily: '"Times New Roman", serif', fontSize: '0.95rem' } }}
                />
              </>
            ) : (
              <Box sx={{ m: 'auto', textAlign: 'center', color: '#64748b', maxWidth: 360 }}>
                <PictureAsPdfOutlinedIcon sx={{ fontSize: 48, color: '#94a3b8' }} />
                <Typography sx={{ mt: 1 }}>
                  Bir PDF/Word dosyası içe aktarın veya alanları doldurup “PDF önizle” ile kararın
                  kurul formatında nasıl görüneceğine bakın.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
