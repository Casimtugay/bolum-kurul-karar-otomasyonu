import React, { useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material';

import SearchIcon from '@mui/icons-material/Search';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AttachFileIcon from '@mui/icons-material/AttachFile';

import { getTemplateDetails } from '../data/templateData';
import DecisionTable from './DecisionTable';
import { NAVY, YELLOW, BLUE, TITLE, SOFT, BORDER } from '../styles/adminTheme';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export default function DecisionForm({
  templates = [],
  selectedTemplate,
  setSelectedTemplate,
  meetingDate,
  setMeetingDate,
  meetingDateLocked = false,
  // Yeni Karar sihirbazı: şablon önceki adımda seçilir, burada gizlenir.
  showTemplatePicker = true,
  onChangeTemplate,
  meetingNo,
  setMeetingNo,
  numberHint = '',
  disabled = false,
  ilgili,
  setIlgili,
  gundem,
  setGundem,
  kararMetni,
  setKararMetni,
  eklerMetni,
  setEklerMetni,
  tableColumns = [],
  setTableColumns,
  tableRows = [],
  setTableRows,
  attachments = [],
  setAttachments,
}) {
  const [search, setSearch] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [fileError, setFileError] = useState('');

  const query = search.trim().toLocaleLowerCase('tr-TR');

  const filteredTemplates = templates.filter((name) =>
    name.toLocaleLowerCase('tr-TR').includes(query)
  );

  const hasContent = Boolean(
    ilgili.trim() ||
    gundem.trim() ||
    kararMetni.trim() ||
    eklerMetni.trim() ||
    tableColumns.length ||
    tableRows.length
  );

  const applyTemplate = (name) => {
    if (disabled) return;

    const details = getTemplateDetails(name);

    setSelectedTemplate(name);
    setIlgili(details.ilgili || '');
    setGundem(details.gundem || '');
    setKararMetni(details.kararMetni || '');
    setEklerMetni(details.eklerMetni || '');

    // Şablon tanımındaki sütunları doğrudan değiştirmemek için kopyala.
    setTableColumns(
      (details.tableColumns || []).map((column) => ({ ...column }))
    );
    setTableRows([]);

    setPendingTemplate(null);
    setTemplatesOpen(false);
  };

  const chooseTemplate = (name) => {
    if (disabled) return;

    // Boş form seçeneği, özel gündemde yazılmış metni de temizleyebilir.
    if (name === selectedTemplate && name !== '') return;

    if (hasContent) {
      setPendingTemplate(name);
      return;
    }

    applyTemplate(name);
  };

  const handleFileChange = (event) => {
    const incoming = Array.from(event.target.files || []);

    // Aynı dosyanın kaldırıldıktan sonra yeniden seçilebilmesini sağlar.
    event.target.value = '';

    if (disabled) return;

    const oversized = incoming.filter(
      (file) => file.size > MAX_FILE_SIZE
    );

    setFileError(
      oversized.length
        ? `25 MB sınırını aşan dosyalar eklenmedi: ${
            oversized.map((file) => file.name).join(', ')
          }`
        : ''
    );

    const valid = incoming.filter(
      (file) => file.size <= MAX_FILE_SIZE
    );

    setAttachments((previous) => {
      const next = [...previous];

      for (const file of valid) {
        const exists = next.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified
        );

        if (!exists) next.push(file);
      }

      return next;
    });
  };

  const removeFile = (index) => {
    if (disabled) return;

    setAttachments((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const templateButton = (name, label, description) => {
    const selected = selectedTemplate === name;

    return (
      <Button
        key={name || 'custom'}
        type="button"
        fullWidth
        disabled={disabled}
        aria-pressed={selected}
        onClick={() => chooseTemplate(name)}
        sx={{
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          textAlign: 'left',
          textTransform: 'none',
          p: 1.5,
          gap: 1.2,
          borderRadius: 2,
          border: '1px solid',
          borderColor: selected ? BLUE : BORDER,
          bgcolor: selected ? SOFT : '#ffffff',
          color: NAVY,
          '&:hover': {
            bgcolor: selected ? '#cfe2f8' : '#f8fafc',
            borderColor: selected ? BLUE : '#94a3b8',
          },
          '&.Mui-focusVisible': {
            outline: `3px solid ${YELLOW}`,
            outlineOffset: 2,
          },
        }}
      >
        <DescriptionIcon
          sx={{ mt: 0.2, fontSize: 21, color: selected ? BLUE : '#64748b', flexShrink: 0 }}
        />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="span"
            sx={{
              display: 'block',
              fontSize: '0.88rem',
              fontWeight: 700,
              lineHeight: 1.4,
              color: selected ? BLUE : TITLE,
            }}
          >
            {label}
          </Typography>

          {description && (
            <Typography
              component="span"
              sx={{
                display: 'block',
                mt: 0.4,
                color: '#64748b',
                fontSize: '0.76rem',
                lineHeight: 1.4,
              }}
            >
              {description}
            </Typography>
          )}
        </Box>

        {selected && (
          <CheckCircleIcon
            sx={{ fontSize: 19, mt: 0.3, color: BLUE, flexShrink: 0 }}
          />
        )}
      </Button>
    );
  };

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: showTemplatePicker ? '320px 1fr' : '1fr',
          },
          gap: 3,
          alignItems: 'start',
          width: '100%',
        }}
      >
        {/* SOL YAN SÜTUN: HAZIR KARAR ŞABLONLARI */}
        {showTemplatePicker && (
        <Paper
          component="aside"
          aria-label="Hazır karar şablonları"
          elevation={0}
          sx={{
            minWidth: 0,
            borderRadius: 3,
            overflow: 'hidden',
            border: `1px solid ${BORDER}`,
            bgcolor: '#ffffff',
            position: { md: 'sticky' },
            top: { md: 24 },
          }}
        >
          <Box sx={{ bgcolor: NAVY, color: '#ffffff', p: 2.5 }}>
            <Typography
              variant="overline"
              sx={{ color: YELLOW, fontWeight: 800, letterSpacing: 1 }}
            >
              HIZLI GİRİŞ VE SEÇİM
            </Typography>

            <Typography variant="h6" sx={{ fontWeight: 800, color: '#ffffff', mt: 0.5 }}>
              Karar Şablonları
            </Typography>

            <Typography
              variant="body2"
              sx={{ color: '#d5dfeb', mt: 0.5, lineHeight: 1.5, fontSize: '0.82rem' }}
            >
              Bir şablon seçerek form alanlarını otomatik doldurun veya boş form ile sıfırdan yazın.
            </Typography>

            <Button
              type="button"
              onClick={() => setTemplatesOpen((value) => !value)}
              aria-expanded={templatesOpen}
              aria-controls="decision-template-list"
              sx={{
                display: { xs: 'inline-flex', md: 'none' },
                color: YELLOW,
                mt: 1,
                p: 0,
                textTransform: 'none',
                fontWeight: 700,
              }}
            >
              {templatesOpen ? 'Şablon listesini gizle ▲' : 'Şablon listesini göster ▼'}
            </Button>
          </Box>

          <Box
            id="decision-template-list"
            sx={{
              p: 2,
              display: {
                xs: templatesOpen ? 'block' : 'none',
                md: 'block',
              },
            }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="Şablon ara..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: '#64748b' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />

            {templateButton(
              '',
              'Boş Karar / Özel Gündem',
              'Hazır metin kullanmadan formu kendiniz doldurun.'
            )}

            <Divider sx={{ my: 2 }} />

            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mb: 1.5,
                color: '#64748b',
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              BU KURULA AİT ŞABLONLAR ({filteredTemplates.length})
            </Typography>

            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1.2,
                maxHeight: { xs: 320, md: 520 },
                overflowY: 'auto',
                pr: 0.5,
              }}
            >
              {filteredTemplates.map((name) =>
                templateButton(name, name)
              )}

              {!filteredTemplates.length && (
                <Typography
                  variant="body2"
                  sx={{ color: '#64748b', p: 1, fontStyle: 'italic' }}
                >
                  {templates.length
                    ? 'Aramanıza uygun şablon bulunamadı.'
                    : 'Bu kurul için tanımlı hazır şablon bulunmuyor.'}
                </Typography>
              )}
            </Box>
          </Box>
        </Paper>
        )}

        {/* SAĞ ANA SÜTUN: FORM KARTLARI */}
        <Box
          sx={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          {/* SEÇİLİ ŞABLON BİLGİ ŞERİDİ */}
          <Paper
            elevation={0}
            sx={{
              bgcolor: SOFT,
              border: `1px solid #bcd3f0`,
              borderRadius: 2.5,
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box>
              <Typography
                variant="caption"
                sx={{ color: BLUE, fontWeight: 800, letterSpacing: 0.5 }}
              >
                AKTİF ŞABLON
              </Typography>
              <Typography sx={{ color: TITLE, fontWeight: 800, fontSize: '1rem', mt: 0.3 }}>
                {selectedTemplate || 'Özel Gündem / Boş Karar Formu'}
              </Typography>
            </Box>

            {onChangeTemplate ? (
              <Button
                type="button"
                variant="outlined"
                size="small"
                disabled={disabled}
                onClick={onChangeTemplate}
                sx={{ textTransform: 'none', fontWeight: 700, color: BLUE, borderColor: '#bcd3f0', bgcolor: '#fff' }}
              >
                Şablonu değiştir
              </Button>
            ) : selectedTemplate && (
              <Chip
                label="Şablon Uygulandı"
                size="small"
                sx={{ bgcolor: '#ffffff', color: BLUE, fontWeight: 700, border: `1px solid #bcd3f0` }}
              />
            )}
          </Paper>

          {/* KART 1: GENEL KARAR BİLGİLERİ */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 3,
              border: `1px solid ${BORDER}`,
              bgcolor: '#ffffff',
            }}
          >
            <Typography sx={{ fontWeight: 800, color: NAVY, mb: 2, fontSize: '0.95rem' }}>
              Genel Karar Bilgileri
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: setMeetingNo ? '1fr 1fr 1fr' : '1fr 1fr' }, gap: 2.5, mb: 2.5 }}>
              <TextField
                fullWidth
                required
                type="date"
                label="Toplantı Tarihi"
                value={meetingDate || ''}
                disabled={disabled}
                onChange={(event) => {
                  if (!meetingDateLocked) {
                    setMeetingDate(event.target.value);
                  }
                }}
                slotProps={{
                  inputLabel: { shrink: true },
                  input: { readOnly: meetingDateLocked },
                }}
                helperText={
                  meetingDateLocked
                    ? 'Tarih, seçilen toplantıdan otomatik alınır.'
                    : 'Toplantının yapıldığı tarihi seçin.'
                }
              />

              {setMeetingNo && (
                <TextField
                  fullWidth
                  required
                  type="number"
                  label="Toplantı No"
                  value={meetingNo ?? ''}
                  disabled={disabled}
                  onChange={(event) => setMeetingNo(event.target.value)}
                  slotProps={{ htmlInput: { min: 1 } }}
                  helperText={numberHint || 'Aynı tarihteki kararlar aynı toplantı numarasını alır.'}
                />
              )}

              <TextField
                fullWidth
                label="İlgi (Varsa)"
                placeholder="Örn: 15.01.2026 tarihli ve 104 sayılı yazı"
                value={ilgili}
                disabled={disabled}
                onChange={(event) => setIlgili(event.target.value)}
                helperText="Dayanak teşkil eden evrak veya yazı bilgisi"
              />
            </Box>

            <TextField
              fullWidth
              required
              label="Gündem Konusu"
              placeholder="Kararın gündem başlığını açıkça belirtin"
              value={gundem}
              disabled={disabled}
              onChange={(event) => setGundem(event.target.value)}
              helperText="Tutanakta ve toplantı duyurusunda yer alacak ana konu başlığı"
            />
          </Paper>

          {/* KART 2: KARAR METNİ VE TABLO */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 3,
              border: `1px solid ${BORDER}`,
              bgcolor: '#ffffff',
            }}
          >
            <Typography sx={{ fontWeight: 800, color: NAVY, mb: 2, fontSize: '0.95rem' }}>
              Karar Metni ve Tablo
            </Typography>

            <TextField
              fullWidth
              required
              multiline
              minRows={6}
              label="Karar Metni"
              placeholder="Kurul tarafından alınan kararın detaylı metnini buraya yazın..."
              value={kararMetni}
              disabled={disabled}
              onChange={(event) => setKararMetni(event.target.value)}
              helperText={
                '{OY_SONUCU} ibaresi, oylama tamamlandığında otomatik olarak "oy birliğiyle" veya "oy çokluğuyla" olarak yazılacaktır.'
              }
              sx={{ mb: tableColumns.length > 0 ? 3 : 0 }}
            />

            {tableColumns.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                <Typography
                  sx={{ color: NAVY, fontWeight: 800, mb: 1.5, fontSize: '0.9rem' }}
                >
                  Karara Ait Veri Tablosu
                </Typography>

                <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
                  <DecisionTable
                    columns={tableColumns}
                    rows={tableRows}
                    setRows={(next) => {
                      if (!disabled) setTableRows(next);
                    }}
                  />
                </Box>
              </Box>
            )}
          </Paper>

          {/* KART 3: EKLER VE BELGELER */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 3,
              border: `1px solid ${BORDER}`,
              bgcolor: '#ffffff',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
                mb: 2,
              }}
            >
              <Typography sx={{ fontWeight: 800, color: NAVY, fontSize: '0.95rem' }}>
                Ekler ve Belgeler
              </Typography>

              {attachments.length > 0 && (
                <Badge
                  badgeContent={attachments.length}
                  color="primary"
                  sx={{ '& .MuiBadge-badge': { bgcolor: BLUE, fontWeight: 800 } }}
                >
                  <Chip
                    icon={<AttachFileIcon sx={{ fontSize: 18 }} />}
                    label={`${attachments.length} Dosya Eklendi`}
                    size="small"
                    sx={{ bgcolor: SOFT, color: BLUE, fontWeight: 700 }}
                  />
                </Badge>
              )}
            </Box>

            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Tutanakta Görünecek Ekler Açıklaması"
              placeholder="Örneğin: Ek-1: Başvuru dilekçesi, Ek-2: Not döküm belgesi"
              value={eklerMetni}
              disabled={disabled}
              onChange={(event) => setEklerMetni(event.target.value)}
              sx={{ mb: 2.5 }}
              helperText="Bu metin resmi tutanak PDF çıktısında ek maddeleri olarak listelenir."
            />

            <Box
              sx={{
                p: 2.5,
                border: `2px dashed #b9c9e0`,
                borderRadius: 2.5,
                bgcolor: '#f8fafc',
                textAlign: 'center',
              }}
            >
              <CloudUploadIcon sx={{ fontSize: 36, color: BLUE, mb: 1 }} />
              <Typography sx={{ fontWeight: 700, color: TITLE, mb: 0.5 }}>
                Karara Bağlanacak Dosyaları Seçin
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
                PDF, Word, Excel, Resim veya Zip formatında, dosya başına en fazla 25 MB.
              </Typography>

              <Button
                component="label"
                variant="outlined"
                disabled={disabled}
                startIcon={<CloudUploadIcon />}
                sx={{
                  textTransform: 'none',
                  borderColor: BLUE,
                  color: BLUE,
                  fontWeight: 700,
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  '&:hover': { bgcolor: SOFT, borderColor: BLUE },
                }}
              >
                Bilgisayardan Dosya Seç
                <input
                  type="file"
                  multiple
                  hidden
                  disabled={disabled}
                  accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg,.zip"
                  onChange={handleFileChange}
                />
              </Button>

              {fileError && (
                <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
                  {fileError}
                </Alert>
              )}

              {attachments.length > 0 && (
                <Box sx={{ mt: 3, textAlign: 'left' }}>
                  <Divider sx={{ mb: 2 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: NAVY, mb: 1 }}>
                    Seçilen Ek Dosyalar ({attachments.length}):
                  </Typography>

                  <List dense sx={{ p: 0 }}>
                    {attachments.map((file, index) => (
                      <ListItem
                        key={`${file.name}-${file.lastModified}-${index}`}
                        sx={{
                          bgcolor: '#ffffff',
                          border: `1px solid ${BORDER}`,
                          borderRadius: 2,
                          mb: 1,
                          p: 1.2,
                        }}
                        secondaryAction={
                          <IconButton
                            type="button"
                            edge="end"
                            disabled={disabled}
                            aria-label={`${file.name} dosyasını kaldır`}
                            onClick={() => removeFile(index)}
                            color="error"
                            size="small"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        }
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <InsertDriveFileIcon sx={{ color: BLUE }} />
                        </ListItemIcon>

                        <ListItemText
                          primary={file.name}
                          secondary={`${(file.size / 1024).toFixed(1)} KB`}
                          sx={{
                            pr: 2,
                            '& .MuiListItemText-primary': {
                              fontSize: '0.88rem',
                              fontWeight: 600,
                              color: TITLE,
                              overflowWrap: 'anywhere',
                            },
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* ŞABLON DEĞİŞTİRME ONAY DİYALOĞU */}
      <Dialog
        open={pendingTemplate !== null}
        onClose={() => {
          if (!disabled) setPendingTemplate(null);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="template-change-title"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          id="template-change-title"
          sx={{ color: NAVY, fontWeight: 800 }}
        >
          {pendingTemplate === ''
            ? 'Boş karar formuna geçilsin mi?'
            : 'Şablon değiştirilsin mi?'}
        </DialogTitle>

        <DialogContent>
          <Typography variant="body2" sx={{ lineHeight: 1.8, color: '#475569' }}>
            İlgi, gündem, karar metni, ek açıklaması ve tablo alanları
            {pendingTemplate === ''
              ? ' temizlenecektir.'
              : ' seçtiğiniz şablonun varsayılan metinleriyle değiştirilecektir.'}
            <br /><br />
            Mevcut yazdığınız metinler silinecektir. Seçtiğiniz toplantı ve eklediğiniz dosyalar korunur.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button
            disabled={disabled}
            onClick={() => setPendingTemplate(null)}
            sx={{ color: '#64748b', textTransform: 'none', fontWeight: 600 }}
          >
            Vazgeç
          </Button>

          <Button
            variant="contained"
            disabled={disabled}
            onClick={() => applyTemplate(pendingTemplate)}
            sx={{
              bgcolor: YELLOW,
              color: NAVY,
              fontWeight: 800,
              textTransform: 'none',
              borderRadius: 2,
              '&:hover': { bgcolor: '#f0b400' },
            }}
          >
            Şablonu Uygula
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
