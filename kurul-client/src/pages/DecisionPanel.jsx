import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Paper,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import EditNoteIcon from '@mui/icons-material/EditNote';
import HowToVoteOutlinedIcon from '@mui/icons-material/HowToVoteOutlined';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import PageLayout from '../components/PageLayout';
import DecisionForm from '../components/DecisionForm';
import FormSection from '../components/FormSection';
import TemplateEditor from '../components/TemplateEditor';
import { listTemplates } from '../api/templates';
import { templatesByUnit, getTemplateDetails } from '../data/templateData';
import { useAuth } from '../contexts/AuthContext';
import {
  createDecision,
  getDecision,
  getUnitMembers,
  submitDecision,
} from '../data/decisionStore';
import { uploadAttachments } from '../api/files';
import { apiFetch, apiRequest, readApiBlob } from '../api/client';
import { NAVY, BLUE, TITLE, YELLOW, BORDER, SOFT } from '../styles/adminTheme';

// Yeni Karar: Şablon seç → Bilgileri doldur → PDF önizle ve oylamaya sun.
// Karar, "Oylamaya Sun" denene kadar kaydedilmez; üyeler yarım taslak görmez.

const TEMPLATE_KEY_BY_UNIT = {
  'bilgisayar-bolum': 'Bölüm Kurulu',
  'bilgisayar-abd': 'Bilgisayar Müh. ABD Kurulu',
  'bilisim-abd': 'Bilişim Teknolojileri ABD Kurulu',
};

const STEPS = ['Şablon Seç', 'Bilgileri Doldur', 'PDF Önizle ve Oylamaya Sun'];
const BLANK = '';

const todayIso = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const cardSx = {
  p: { xs: 2.5, md: 3 },
  borderRadius: 3,
  border: `1px solid ${BORDER}`,
  bgcolor: '#ffffff',
};

const yellowButton = {
  bgcolor: YELLOW,
  color: NAVY,
  fontWeight: 800,
  textTransform: 'none',
  borderRadius: 2,
  boxShadow: 'none',
  px: 3,
  py: 1.2,
  '&:hover': { bgcolor: '#f0b400', boxShadow: 'none' },
};

const outlineButton = {
  textTransform: 'none',
  fontWeight: 700,
  color: BLUE,
  borderColor: '#b9c9e0',
};

export default function DecisionPanel() {
  const { unit } = useAuth();
  // Kurul değişince sihirbaz baştan başlar.
  return <DecisionWizard key={unit?.code ?? 'kurul'} unit={unit} />;
}

function DecisionWizard({ unit }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Form alanları
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [meetingDate, setMeetingDate] = useState(todayIso());
  const [meetingNo, setMeetingNo] = useState('');
  const [meetingNoTouched, setMeetingNoTouched] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [ilgili, setIlgili] = useState('');
  const [gundem, setGundem] = useState('');
  const [kararMetni, setKararMetni] = useState('');
  const [eklerMetni, setEklerMetni] = useState('');
  const [tableColumns, setTableColumns] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [attachments, setAttachments] = useState([]);

  // Önizleme ve gönderim
  const [pdfUrl, setPdfUrl] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [error, setError] = useState('');
  // Kurul üyeleri ve toplantıya katılanlar (imza kutusu alacak üyeler). Varsayılan: hepsi.
  const [members, setMembers] = useState(null);
  const [attendeeIds, setAttendeeIds] = useState([]);
  const memberCount = members ? attendeeIds.length : null;
  const submitLock = useRef(false);

  const templates = templatesByUnit[TEMPLATE_KEY_BY_UNIT[unit?.code]] || [];

  // Kurulun kendi eklediği şablonlar ("custom:<id>" anahtarıyla seçilir).
  const [customTemplates, setCustomTemplates] = useState([]);
  const [editor, setEditor] = useState(null);

  const reloadTemplates = () =>
    listTemplates()
      .then((list) => setCustomTemplates(Array.isArray(list) ? list : []))
      .catch(() => setCustomTemplates([]));

  useEffect(() => { reloadTemplates(); }, []);

  const customOf = (key) =>
    typeof key === 'string' && key.startsWith('custom:')
      ? customTemplates.find((t) => `custom:${t.id}` === key)
      : null;

  const templateDetails = (key) => {
    const custom = customOf(key);
    if (!custom) return getTemplateDetails(key);
    let tableColumns;
    try { tableColumns = JSON.parse(custom.tableColumnsJson || '[]'); } catch { tableColumns = []; }
    return {
      ilgili: custom.reference,
      gundem: custom.agenda || custom.name,
      kararMetni: (custom.content || '').replace(/oy birliği ile|oy birliğiyle/g, '{OY_SONUCU}'),
      eklerMetni: custom.attachmentsNote,
      tableColumns,
    };
  };

  const templateName = (key) => customOf(key)?.name ?? key;

  useEffect(() => {
    let cancelled = false;
    getUnitMembers()
      .then((list) => {
        if (cancelled) return;
        setMembers(list);
        setAttendeeIds(list.map((m) => m.userId));
      })
      .catch(() => { if (!cancelled) setMembers(null); });
    return () => { cancelled = true; };
  }, []);

  // Tarih değişince toplantı/karar numarası önerilir (kullanıcı numarayı elle değiştirmediyse).
  useEffect(() => {
    if (!meetingDate) return undefined;
    let cancelled = false;
    const query = new URLSearchParams({ date: meetingDate });
    if (meetingNoTouched && Number(meetingNo) > 0) query.set('meetingNo', String(meetingNo));

    const timer = setTimeout(() => {
      apiFetch(`/api/decisions/next-numbers?${query}`)
        .then((data) => {
          if (cancelled) return;
          setSuggestion(data);
          if (!meetingNoTouched) setMeetingNo(String(data.meetingNo));
        })
        .catch(() => { if (!cancelled) setSuggestion(null); });
    }, 250);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [meetingDate, meetingNo, meetingNoTouched]);

  // Adım değişince sayfa başına dönülür.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, done]);

  // Önizleme dosyası artık kullanılmayınca bellekten silinir.
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const hasContent = Boolean(
    ilgili.trim() || gundem.trim() || kararMetni.trim() || eklerMetni.trim() ||
    tableRows.length || attachments.length
  );

  const applyTemplate = (name) => {
    const details = templateDetails(name);
    setSelectedTemplate(name);
    setIlgili(details.ilgili || '');
    setGundem(details.gundem || '');
    setKararMetni(details.kararMetni || '');
    setEklerMetni(details.eklerMetni || '');
    setTableColumns((details.tableColumns || []).map((c) => ({ ...c })));
    setTableRows([]);
    setError('');
    setStep(1);
  };

  const [pendingTemplate, setPendingTemplate] = useState(null);

  const chooseTemplate = (name) => {
    if (hasContent && name !== selectedTemplate) {
      setPendingTemplate(name);
      return;
    }
    if (name === selectedTemplate) {
      setStep(1);
      return;
    }
    applyTemplate(name);
  };

  const validate = () => {
    if (!meetingDate) return 'Toplantı tarihini seçin.';
    if (!(Number(meetingNo) > 0)) return 'Geçerli bir toplantı numarası girin.';
    if (!gundem.trim()) return 'Gündem konusu zorunludur.';
    if (!kararMetni.trim()) return 'Karar metni zorunludur.';
    if (tableColumns.some((c) => !String(c.label ?? '').trim())) {
      return 'Karar tablosundaki her sütunun bir başlığı olmalıdır.';
    }
    if (members) {
      if (attendeeIds.length === 0) return 'Toplantıya katılan en az bir üye seçin.';
      const chair = members.find((m) => m.isChair);
      if (chair && !attendeeIds.includes(chair.userId)) {
        return 'Kurul başkanı toplantıya katılmadan karar alınamaz; başkanı katılanlara ekleyin.';
      }
    }
    return '';
  };

  const payload = () => ({
    meetingDate,
    meetingNo: Number(meetingNo),
    agenda: gundem.trim(),
    reference: ilgili.trim(),
    content: kararMetni.trim(),
    attachmentsNote: eklerMetni.trim(),
    tableColumnsJson: JSON.stringify(tableColumns),
    tableRowsJson: JSON.stringify(tableRows),
    ...(members ? { attendeeIds } : {}),
  });

  const downloadPreview = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `Karar-Taslagi-${label ? label.replace(/[^0-9a-zA-Z]+/g, '-') : 'onizleme'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const goPreview = async () => {
    const problem = validate();
    setError(problem);
    if (problem) return;

    setPreviewing(true);
    setStep(2);
    try {
      const response = await apiRequest('/api/decisions/preview-pdf', {
        method: 'POST',
        json: true,
        body: { ...payload(), attachmentNames: attachments.map((f) => f.name) },
      });
      const blob = await readApiBlob(response);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err?.message || 'PDF önizlemesi oluşturulamadı.');
      setStep(1);
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setConfirmOpen(false);
    setSubmitting(true);
    setError('');

    try {
      // 1) Taslak kaydedilir, 2) ekler yüklenir, 3) oylamaya sunulur (metin ve ekler kilitlenir).
      // Ekler yüklenemezse karar oylamaya sunulmaz; taslak olarak kalır ve karar sayfasından
      // ekler tamamlanıp "Oylamaya Sun" ile gönderilir.
      const created = await createDecision(payload());

      if (attachments.length) {
        try {
          await uploadAttachments(created.id, [...attachments]);
        } catch (err) {
          setUploadError(err?.message || 'Ek dosyalar yüklenemedi.');
          setDone({ ...created, submitted: false });
          return;
        }
      }

      // Ek yüklemesi sürümü değiştirdiği için güncel sürümle gönderilir.
      const latest = attachments.length ? await getDecision(created.id) : created;
      const submitted = await submitDecision(created.id, latest.rowVersion);

      setDone({ ...submitted, submitted: true });
    } catch (err) {
      setError(
        (err?.message || 'Karar oylamaya sunulamadı.') +
        ' Bağlantı hatası yaşandıysa tekrar denemeden önce Kurul Kararları listesini kontrol edin.'
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const restart = () => {
    setDone(null);
    setUploadError('');
    setSelectedTemplate(null);
    setIlgili('');
    setGundem('');
    setKararMetni('');
    setEklerMetni('');
    setTableColumns([]);
    setTableRows([]);
    setAttachments([]);
    setMeetingNoTouched(false);
    setPdfUrl('');
    setStep(0);
  };

  const label = suggestion
    ? `${suggestion.meetingYear}/${suggestion.meetingNo} toplantısı, ${suggestion.decisionNo}. karar`
    : '';

  return (
    <PageLayout title="Yeni Karar">
      <Paper elevation={0} sx={{ ...cardSx, mb: 3 }}>
        <Stepper activeStep={done ? 3 : step} alternativeLabel>
          {STEPS.map((name) => (
            <Step key={name}>
              <StepLabel>{name}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {done ? (
        <SubmittedCard
          decision={done}
          memberCount={memberCount}
          uploadError={uploadError}
          onOpen={() => navigate(`/oylama/${done.id}`)}
          onNew={restart}
        />
      ) : step === 0 ? (
        <TemplateStep
          templates={templates}
          customTemplates={customTemplates}
          selected={selectedTemplate}
          onChoose={chooseTemplate}
          onNewTemplate={() => setEditor({ template: null })}
          onEditTemplate={(template) => setEditor({ template })}
        />
      ) : step === 1 ? (
        <>
          <DecisionForm
            showTemplatePicker={false}
            onChangeTemplate={() => setStep(0)}
            selectedTemplate={templateName(selectedTemplate) || ''}
            setSelectedTemplate={() => {}}
            meetingDate={meetingDate}
            setMeetingDate={setMeetingDate}
            meetingNo={meetingNo}
            setMeetingNo={(value) => { setMeetingNoTouched(true); setMeetingNo(value); }}
            numberHint={label ? `Bu karar: ${label}` : ''}
            ilgili={ilgili}
            setIlgili={setIlgili}
            gundem={gundem}
            setGundem={setGundem}
            kararMetni={kararMetni}
            setKararMetni={setKararMetni}
            eklerMetni={eklerMetni}
            setEklerMetni={setEklerMetni}
            tableColumns={tableColumns}
            setTableColumns={setTableColumns}
            tableRows={tableRows}
            setTableRows={setTableRows}
            attachments={attachments}
            setAttachments={setAttachments}
          />

          {members && (
            <Box sx={{ mt: 1.5 }}>
              <AttendeesCard
                members={members}
                selected={attendeeIds}
                onChange={setAttendeeIds}
              />
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 3, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep(0)} sx={outlineButton}>
              Şablon seçimine dön
            </Button>
            <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={goPreview} sx={yellowButton}>
              PDF Önizle
            </Button>
          </Box>
        </>
      ) : (
        <Paper elevation={0} sx={cardSx}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Box>
              <Typography sx={{ color: TITLE, fontWeight: 800, fontSize: '1.1rem' }}>
                Karar Önizlemesi
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                {label && `${label}. `}
                Belgeyi kontrol edin; uygunsa oylamaya sunun.
              </Typography>
            </Box>
          </Box>

          {previewing || !pdfUrl ? (
            <Box sx={{ height: 420, display: 'grid', placeItems: 'center' }}>
              <CircularProgress aria-label="PDF hazırlanıyor" />
            </Box>
          ) : (
            <Box
              component="iframe"
              title="Karar PDF önizlemesi"
              src={pdfUrl}
              sx={{ width: '100%', height: { xs: '60vh', md: '75vh' }, border: `1px solid ${BORDER}`, borderRadius: 2 }}
            />
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 3, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<EditNoteIcon />}
              disabled={submitting}
              onClick={() => setStep(1)}
              sx={outlineButton}
            >
              Düzenlemeye dön
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              disabled={previewing || !pdfUrl}
              onClick={downloadPreview}
              sx={outlineButton}
            >
              PDF'yi indir
            </Button>
            <Button
              variant="contained"
              startIcon={<HowToVoteOutlinedIcon />}
              disabled={previewing || submitting || !pdfUrl}
              onClick={() => setConfirmOpen(true)}
              sx={yellowButton}
            >
              {submitting ? 'Gönderiliyor…' : 'Oylamaya Sun'}
            </Button>
          </Box>
        </Paper>
      )}

      {editor && (
        <TemplateEditor
          open
          key={editor.template?.id ?? 'yeni'}
          template={editor.template}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); reloadTemplates(); }}
          onDeleted={() => { setEditor(null); reloadTemplates(); }}
        />
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Oylamaya sunulsun mu?</DialogTitle>
        <DialogContent>
          <Typography>
            Karar kaydedilecek ve{memberCount ? ` ${memberCount}` : ''} kurul üyesine
            okuyup oylamaları için bildirim gönderilecek.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmOpen(false)}>Vazgeç</Button>
          <Button variant="contained" onClick={submit} sx={yellowButton}>
            Oylamaya Sun
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pendingTemplate !== null} onClose={() => setPendingTemplate(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Şablon değiştirilsin mi?</DialogTitle>
        <DialogContent>
          <Typography>Yazdığınız metinler seçilen şablonun metinleriyle değiştirilecek.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPendingTemplate(null)}>Vazgeç</Button>
          <Button
            variant="contained"
            onClick={() => { const name = pendingTemplate; setPendingTemplate(null); applyTemplate(name); }}
            sx={yellowButton}
          >
            Şablonu uygula
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}

// Toplantıya katılan üyeler: yalnızca seçilenler PDF'de imza kutusu alır ve oylamaya katılır.
// Seçilmeyenler "İzinli" kaydedilir; yeter sayısı tüm kurul üzerinden hesaplanır.
function AttendeesCard({ members, selected, onChange }) {
  const all = selected.length === members.length;
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <FormSection
      title="Toplantıya Katılan Üyeler"
      status={selected.length ? 'done' : 'missing'}
      summary={`${selected.length} / ${members.length} üye seçili`}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          Yalnızca seçtikleriniz PDF'de imza kutusu alır ve oylamaya katılır. Seçilmeyenler
          belgede yer almaz.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>
            {selected.length} / {members.length} seçili
          </Typography>
          <Button
            size="small"
            onClick={() => onChange(all ? [] : members.map((m) => m.userId))}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {all ? 'Hiçbirini seçme' : 'Tümünü seç'}
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          border: `1px solid ${BORDER}`,
          borderRadius: 1.5,
          overflow: 'hidden',
        }}
      >
        {members.map((member) => {
          const checked = selected.includes(member.userId);
          return (
            <Box
              key={member.userId}
              component="label"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                cursor: 'pointer',
                borderBottom: `1px solid ${BORDER}`,
                bgcolor: checked ? '#fff' : '#f8fafc',
                '&:hover': { bgcolor: '#f1f5f9' },
              }}
            >
              <Checkbox size="small" checked={checked} onChange={() => toggle(member.userId)} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: checked ? '#1f2937' : '#94a3b8' }}>
                  {member.displayName}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  {member.duty}{member.isChair ? ' · Kurul başkanı' : ''}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </FormSection>
  );
}

function TemplateStep({
  templates, customTemplates = [], selected, onChoose, onNewTemplate, onEditTemplate,
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase('tr-TR');
  const visible = templates.filter((name) => name.toLocaleLowerCase('tr-TR').includes(query));
  const matches = (t) => t.name.toLocaleLowerCase('tr-TR').includes(query);
  const published = customTemplates.filter((t) => !t.isDraft && matches(t));
  const drafts = customTemplates.filter((t) => t.isDraft && matches(t));

  return (
    <Paper elevation={0} sx={cardSx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
        <Box>
          <Typography sx={{ color: TITLE, fontWeight: 800, fontSize: '1.1rem' }}>
            Karar şablonunu seçin
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Şablon; ilgi, gündem ve karar metnini hazır doldurur. Sonraki adımda boşlukları tamamlarsınız.
          </Typography>
        </Box>
        {templates.length > 6 && (
          <TextField
            size="small"
            placeholder="Şablon ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        )}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
          gap: 2,
        }}
      >
        {visible.map((name) => (
          <TemplateCard
            key={name}
            title={name}
            text={getTemplateDetails(name).gundem}
            selected={selected === name}
            onClick={() => onChoose(name)}
          />
        ))}

        {published.map((t) => (
          <TemplateCard
            key={t.id}
            title={t.name}
            text={t.agenda || 'Kurulun eklediği şablon'}
            selected={selected === `custom:${t.id}`}
            onClick={() => onChoose(`custom:${t.id}`)}
            onEdit={() => onEditTemplate(t)}
          />
        ))}

        <TemplateCard
          title="Boş Karar / Özel Gündem"
          text="Hazır metin kullanmadan kararı kendiniz yazın."
          selected={selected === BLANK}
          onClick={() => onChoose(BLANK)}
          blank
        />

        <TemplateCard
          title="Yeni şablon ekle"
          text="PDF/Word belgesinden içe aktarın veya sıfırdan yazın; taslak olarak kaydedebilirsiniz."
          onClick={onNewTemplate}
          blank
          icon={<AddIcon sx={{ color: BLUE, mt: 0.2 }} />}
        />
      </Box>

      {drafts.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography sx={{ color: TITLE, fontWeight: 700, mb: 1 }}>Taslak şablonlar</Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            {drafts.map((t) => (
              <TemplateCard
                key={t.id}
                title={t.name}
                text={`Taslak · ${t.createdByName}. Tamamlamak için tıklayın.`}
                onClick={() => onEditTemplate(t)}
                blank
                icon={<EditOutlinedIcon sx={{ color: '#b45309', mt: 0.2 }} />}
              />
            ))}
          </Box>
        </Box>
      )}

      {templates.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Bu kurul için tanımlı hazır şablon yok; boş karar ile devam edebilirsiniz.
        </Alert>
      )}
    </Paper>
  );
}

function TemplateCard({ title, text, selected, onClick, onEdit, blank = false, icon }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        position: 'relative',
        textAlign: 'left',
        cursor: 'pointer',
        p: 2.5,
        borderRadius: 2.5,
        border: `2px ${blank ? 'dashed' : 'solid'} ${selected ? BLUE : BORDER}`,
        bgcolor: selected ? SOFT : '#fff',
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        font: 'inherit',
        transition: 'border-color .15s, background-color .15s',
        '&:hover': { borderColor: BLUE, bgcolor: SOFT },
        '&:focus-visible': { outline: `3px solid ${YELLOW}`, outlineOffset: 2 },
      }}
    >
      {icon || <DescriptionOutlinedIcon sx={{ color: BLUE, mt: 0.2 }} />}
      {onEdit && (
        <Box
          component="span"
          role="button"
          tabIndex={0}
          aria-label={`${title} şablonunu düzenle`}
          onClick={(event) => { event.stopPropagation(); onEdit(); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onEdit();
            }
          }}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'grid',
            placeItems: 'center',
            width: 28,
            height: 28,
            borderRadius: 1,
            color: '#64748b',
            '&:hover': { bgcolor: '#e2e8f0', color: NAVY },
          }}
        >
          <EditOutlinedIcon fontSize="small" />
        </Box>
      )}
      <Box sx={{ minWidth: 0, pr: onEdit ? 3 : 0 }}>
        <Typography sx={{ color: NAVY, fontWeight: 800, lineHeight: 1.35 }}>{title}</Typography>
        {text && (
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5, lineHeight: 1.5 }}>
            {text}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function SubmittedCard({ decision, memberCount, uploadError, onOpen, onNew }) {
  return (
    <Paper elevation={0} sx={{ ...cardSx, p: { xs: 3, md: 5 } }}>
      <Box sx={{ maxWidth: 620, mx: 'auto', textAlign: 'center', display: 'grid', gap: 2.5 }}>
        {decision.submitted ? (
          <Alert severity="success" sx={{ borderRadius: 2, fontSize: '1rem', fontWeight: 600, textAlign: 'left' }}>
            {decision.meetingYear}/{decision.meetingNo} toplantısının {decision.decisionNo} numaralı kararı
            oylamaya sunuldu.
            {memberCount ? ` ${memberCount} kurul üyesine bildirim gönderildi.` : ''}
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ borderRadius: 2, textAlign: 'left' }}>
            Karar taslak olarak kaydedildi ancak ek dosyalar yüklenemedi: {uploadError}
            {' '}Bu yüzden henüz oylamaya sunulmadı. Kararı açıp ekleri yükleyin, ardından
            {' '}<b>Oylamaya Sun</b> düğmesine basın.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={onOpen} sx={yellowButton}>
            Kararı aç
          </Button>
          <Button variant="outlined" onClick={onNew} sx={outlineButton}>
            Yeni karar hazırla
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
