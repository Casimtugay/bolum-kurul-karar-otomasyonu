import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';

import { NAVY, YELLOW, BORDER } from '../styles/adminTheme';

// Ek dosyayı indirmeden pencerede gösterir.
// PDF ve resim tarayıcıda olduğu gibi; Word (.docx) ve Excel/CSV tarayıcıda
// dönüştürülerek gösterilir. Eski .doc biçimi önizlenemez, yalnızca indirilir.
// Word/Excel kütüphaneleri yalnızca gerektiğinde yüklenir (sayfa açılışını yavaşlatmaz).

const MAX_SHEET_ROWS = 500;

const extensionOf = (name = '') => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
};

// Excel'den kaydedilen CSV ya UTF-8 ya da Türkçe Windows-1254 olur.
// Önce UTF-8 denenir; geçersizse Windows-1254 kabul edilir. Baştaki BOM atılır.
const decodeCsv = (bytes) => {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1254').decode(bytes);
  }
  return text.replace(/^\uFEFF/, '');
};

export const previewKind = (name) => {
  const ext = extensionOf(name);
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'image';
  if (ext === 'docx') return 'docx';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet';
  return null;
};

export default function AttachmentPreviewDialog({ file, loadBlob, onClose }) {
  const open = Boolean(file);
  const name = file?.name || '';
  const kind = previewKind(name);

  const [state, setState] = useState({ loading: true, error: '', url: '', sheets: null });
  const [sheetIndex, setSheetIndex] = useState(0);
  const blobRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let objectUrl = '';

    (async () => {
      try {
        const blob = await loadBlob();
        if (cancelled) return;
        blobRef.current = blob;

        if (kind === 'pdf' || kind === 'image') {
          // Sunucu türü vermezse tarayıcının doğru göstermesi için tür eklenir.
          const typed = kind === 'pdf' && blob.type !== 'application/pdf'
            ? new Blob([blob], { type: 'application/pdf' })
            : blob;
          objectUrl = URL.createObjectURL(typed);
          setState({ loading: false, error: '', url: objectUrl, sheets: null });
          return;
        }

        if (kind === 'docx') {
          // Belge önce sayfaya bağlı olmayan bir alana çizilir, sonra pencereye eklenir.
          const { renderAsync } = await import('docx-preview');
          const host = document.createElement('div');
          await renderAsync(blob, host, null, {
            inWrapper: true,
            ignoreLastRenderedPageBreak: true,
            experimental: false,
          });
          if (!cancelled) setState({ loading: false, error: '', url: '', sheets: null, docx: host });
          return;
        }

        if (kind === 'sheet') {
          const XLSX = await import('xlsx');
          const bytes = await blob.arrayBuffer();
          const workbook = extensionOf(name) === 'csv'
            ? XLSX.read(decodeCsv(bytes), { type: 'string' })
            : XLSX.read(bytes, { type: 'array' });
          const sheets = workbook.SheetNames.map((sheetName) => {
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
              header: 1,
              raw: false,
              defval: '',
            });
            return {
              name: sheetName,
              rows: rows.slice(0, MAX_SHEET_ROWS),
              truncated: rows.length > MAX_SHEET_ROWS,
            };
          });
          if (!cancelled) setState({ loading: false, error: '', url: '', sheets });
          return;
        }

        setState({ loading: false, error: '', url: '', sheets: null });
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            error: err?.message || 'Dosya önizlenemedi. İndirerek açmayı deneyin.',
            url: '',
            sheets: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      blobRef.current = null;
    };
  }, [open, kind, loadBlob]);

  const download = async () => {
    const blob = blobRef.current || (await loadBlob());
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name || 'ek-dosya';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sheet = state.sheets?.[sheetIndex];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle
        sx={{
          bgcolor: NAVY,
          color: '#fff',
          borderBottom: `4px solid ${YELLOW}`,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pr: 1,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </Box>
        <IconButton onClick={onClose} aria-label="Önizlemeyi kapat" sx={{ color: '#fff' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: '#eef1f6', minHeight: 420 }}>
        {state.loading && (
          <Box sx={{ height: 420, display: 'grid', placeItems: 'center' }}>
            <CircularProgress aria-label="Dosya yükleniyor" />
          </Box>
        )}

        {!state.loading && state.error && (
          <Alert severity="error" sx={{ m: 3 }}>{state.error}</Alert>
        )}

        {!state.loading && !state.error && !kind && (
          <Alert severity="info" sx={{ m: 3 }}>
            Bu dosya biçimi tarayıcıda önizlenemiyor. İndirip bilgisayarınızda açabilirsiniz.
          </Alert>
        )}

        {kind === 'pdf' && state.url && (
          <Box component="iframe" title={name} src={state.url} sx={{ width: '100%', height: '78vh', border: 0, display: 'block' }} />
        )}

        {kind === 'image' && state.url && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Box component="img" src={state.url} alt={name} sx={{ maxWidth: '100%', maxHeight: '75vh', bgcolor: '#fff' }} />
          </Box>
        )}

        {kind === 'docx' && state.docx && (
          <Box
            ref={(el) => {
              if (el && !el.contains(state.docx)) {
                el.replaceChildren(state.docx);
              }
            }}
            sx={{
              maxHeight: '78vh',
              overflow: 'auto',
              '& .docx-wrapper': { bgcolor: '#eef1f6', p: 2 },
              '& .docx-wrapper > section.docx': { boxShadow: '0 2px 8px rgba(15,31,79,.15)', mb: 2 },
            }}
          />
        )}

        {kind === 'sheet' && sheet && (
          <Box sx={{ bgcolor: '#fff' }}>
            {state.sheets.length > 1 && (
              <Tabs
                value={sheetIndex}
                onChange={(_, value) => setSheetIndex(value)}
                variant="scrollable"
                sx={{ borderBottom: `1px solid ${BORDER}` }}
              >
                {state.sheets.map((s, i) => <Tab key={s.name} value={i} label={s.name} />)}
              </Tabs>
            )}
            <Box sx={{ maxHeight: '72vh', overflow: 'auto' }}>
              <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
                <tbody>
                  {sheet.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <Box
                          component={r === 0 ? 'th' : 'td'}
                          key={c}
                          sx={{
                            border: `1px solid ${BORDER}`,
                            px: 1,
                            py: 0.5,
                            whiteSpace: 'nowrap',
                            bgcolor: r === 0 ? '#f1f5f9' : '#fff',
                            fontWeight: r === 0 ? 700 : 400,
                            textAlign: 'left',
                          }}
                        >
                          {String(cell)}
                        </Box>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Box>
            {sheet.truncated && (
              <Typography variant="caption" sx={{ display: 'block', p: 1.5, color: '#64748b' }}>
                İlk {MAX_SHEET_ROWS} satır gösteriliyor. Tamamı için dosyayı indirin.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: '#64748b' }}>
          {kind === 'docx' || kind === 'sheet'
            ? 'Tarayıcıda dönüştürülmüş görünüm; karmaşık biçimler farklı görünebilir.'
            : ''}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<DownloadIcon />} onClick={download} sx={{ textTransform: 'none', fontWeight: 700 }}>
            İndir
          </Button>
          <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700, bgcolor: NAVY }}>
            Kapat
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
