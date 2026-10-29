import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Link,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import HighlightOffIcon from '@mui/icons-material/CancelOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';

import { COLORS } from './Header';
import { AgendaList, SectionTitle, cardSx } from './announcementUi';
import { formatDateTime, formatLongDate } from './dateUtils';
import { getUnitMembers } from '../data/decisionStore';
import {
  getCustomAnnouncements,
  markCustomAnnouncementRead,
  publishCustomAnnouncement,
  refreshNotifications,
  updateAnnouncementAttendance,
} from '../api/announcements';

// Sunucudaki sınırlarla aynı (CustomAnnouncement.cs).
const MAX_CONTENT = 4000;
const MAX_AGENDA_ITEMS = 30;
const LIVE_REFRESH_MS = 15000;

const INTENT = { yes: 'Katilacak', no: 'Katilmayacak' };
const INTENT_LABEL = {
  Katilacak: 'Katılacak',
  Katilmayacak: 'Katılmayacak',
  Belirsiz: 'Cevap vermedi',
};

const messageOf = (error) =>
  error?.message || 'İşlem tamamlanamadı. Tekrar deneyin.';

const primaryBtn = { fontWeight: 800, px: 2.5, py: 1.1, boxShadow: 'none' };
const outlineBtn = {
  color: COLORS.blue,
  borderColor: '#b9c9e0',
  fontWeight: 700,
  '&:hover': { bgcolor: COLORS.blueSoft, borderColor: COLORS.blue },
};

const emptyForm = {
  content: '',
  meetingDate: '',
  meetingTime: '',
  location: '',
  onlineLink: '',
  agendaText: '',
};

/* ------------------------------------------------------------------ */
/* Kurul Başkanı: özel duyuru yayımla                                 */
/* ------------------------------------------------------------------ */

export function CustomAnnouncementForm() {
  const [form, setForm] = useState(emptyForm);
  const [members, setMembers] = useState(null);
  const [membersError, setMembersError] = useState('');
  const [mode, setMode] = useState('all');
  const [selected, setSelected] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getUnitMembers()
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setMembers([]);
          setMembersError(`Üye listesi alınamadı: ${messageOf(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (field) => (event) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const agendaItems = useMemo(
    () => form.agendaText.split('\n').map((i) => i.trim()).filter(Boolean),
    [form.agendaText]
  );

  const recipientCount =
    mode === 'all' ? (members?.length ?? 0) : selected.length;

  const validate = () => {
    const content = form.content.trim();
    if (!content) return 'Duyuru metnini girin.';
    if (content.length > MAX_CONTENT)
      return `Duyuru metni en fazla ${MAX_CONTENT} karakter olabilir.`;
    if (form.meetingTime && !form.meetingDate)
      return 'Saat girdiyseniz toplantı tarihini de seçin.';
    if (form.onlineLink.trim() && !/^https?:\/\/\S+$/i.test(form.onlineLink.trim()))
      return 'Çevrimiçi bağlantı http:// veya https:// ile başlamalıdır.';
    if (agendaItems.length > MAX_AGENDA_ITEMS)
      return `En fazla ${MAX_AGENDA_ITEMS} gündem maddesi eklenebilir.`;
    if (recipientCount === 0) return 'En az bir alıcı seçin.';
    return '';
  };

  const handleReview = (event) => {
    event.preventDefault();
    const problem = validate();
    setError(problem);
    setResult(null);
    if (!problem) setConfirming(true);
  };

  const handlePublish = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await publishCustomAnnouncement({
        content: form.content.trim(),
        meetingDate: form.meetingDate || null,
        meetingTime: form.meetingTime || null,
        location: form.location.trim() || null,
        onlineLink: form.onlineLink.trim() || null,
        agendaItems,
        recipientIds: mode === 'selected' ? selected.map((m) => m.userId) : null,
      });
      setResult(data);
      setForm(emptyForm);
      setSelected([]);
      setMode('all');
      setConfirming(false);
      refreshNotifications();
      window.dispatchEvent(new Event('custom-announcements:refresh'));
    } catch (err) {
      setConfirming(false);
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper elevation={0} sx={{ ...cardSx, mb: 3 }}>
      <SectionTitle>Kurul Duyurusu Yayımla</SectionTitle>

      <Typography sx={{ color: '#596779', mb: 2.5 }}>
        Duyuru seçtiğiniz kurul üyelerine sistem içinde bildirilir ve
        edu.tr uzantılı adreslerine e-posta olarak gönderilir. Üyeler
        katılım durumlarını bu sayfadan bildirebilir.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {result && (
        <Alert
          severity={result.emailWarning ? 'warning' : 'success'}
          sx={{ mb: 2 }}
          onClose={() => setResult(null)}
        >
          {result.message}
          {result.emailWarning ? ` ${result.emailWarning}` : ''}
        </Alert>
      )}

      <Box component="form" onSubmit={handleReview} noValidate>
        <TextField
          label="Duyuru metni"
          placeholder="Kurul üyelerine duyurmak istediğiniz metni yazın…"
          multiline
          minRows={4}
          fullWidth
          required
          value={form.content}
          onChange={set('content')}
          disabled={busy}
          helperText={`${form.content.length} / ${MAX_CONTENT}`}
          error={form.content.length > MAX_CONTENT}
          sx={{ mb: 2 }}
        />

        <Typography sx={{ color: COLORS.blue, fontWeight: 800, fontSize: '0.85rem', mb: 1 }}>
          TOPLANTI BİLGİLERİ (İSTEĞE BAĞLI)
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            mb: 2,
          }}
        >
          <TextField
            label="Tarih"
            type="date"
            value={form.meetingDate}
            onChange={set('meetingDate')}
            disabled={busy}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Saat"
            type="time"
            value={form.meetingTime}
            onChange={set('meetingTime')}
            disabled={busy}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Yer"
            value={form.location}
            onChange={set('location')}
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <TextField
            label="Çevrimiçi bağlantı"
            placeholder="https://…"
            value={form.onlineLink}
            onChange={set('onlineLink')}
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </Box>

        <TextField
          label="Gündem maddeleri"
          placeholder="Her satıra bir madde yazın"
          multiline
          minRows={3}
          fullWidth
          value={form.agendaText}
          onChange={set('agendaText')}
          disabled={busy}
          helperText={`${agendaItems.length} madde`}
          sx={{ mb: 2 }}
        />

        <Typography sx={{ color: COLORS.blue, fontWeight: 800, fontSize: '0.85rem', mb: 0.5 }}>
          ALICILAR
        </Typography>

        {membersError && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            {membersError}
          </Alert>
        )}

        <RadioGroup
          row
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <FormControlLabel
            value="all"
            control={<Radio />}
            disabled={busy}
            label={`Tüm kurul üyeleri${members ? ` (${members.length})` : ''}`}
          />
          <FormControlLabel
            value="selected"
            control={<Radio />}
            disabled={busy}
            label="Seçili üyeler"
          />
        </RadioGroup>

        {mode === 'selected' && (
          <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            <Button
              size="small"
              onClick={() => setSelected(members ?? [])}
              disabled={busy || !members?.length || selected.length === members.length}
            >
              Tümünü seç
            </Button>
            <Button
              size="small"
              onClick={() => setSelected([])}
              disabled={busy || selected.length === 0}
            >
              Temizle
            </Button>
            <Typography variant="body2" sx={{ color: '#596779', ml: 'auto' }}>
              {selected.length} / {members?.length ?? 0} üye seçili
            </Typography>
          </Box>
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={members ?? []}
            loading={members === null}
            value={selected}
            onChange={(_, value) => setSelected(value)}
            getOptionLabel={(m) => m.displayName}
            isOptionEqualToValue={(a, b) => a.userId === b.userId}
            disabled={busy}
            renderOption={(props, option, { selected: checked }) => {
              const { key, ...rest } = props;
              return (
                <li key={key} {...rest}>
                  <Checkbox size="small" checked={checked} sx={{ mr: 1 }} />
                  {option.displayName}
                  {option.duty ? ` · ${option.duty}` : ''}
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField {...params} label="Üye seçin" placeholder="Ara…" />
            )}
            sx={{ mt: 1 }}
          />
          </>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.5 }}>
          <Button
            type="submit"
            variant="contained"
            color="secondary"
            startIcon={<CampaignOutlinedIcon />}
            disabled={busy || !form.content.trim()}
            sx={primaryBtn}
          >
            Önizle ve Yayımla
          </Button>
        </Box>
      </Box>

      <Dialog
        open={confirming}
        onClose={() => {
          if (!busy) setConfirming(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            bgcolor: COLORS.navy,
            color: '#fff',
            borderBottom: `4px solid ${COLORS.yellow}`,
            fontWeight: 800,
          }}
        >
          Duyuru Önizlemesi
        </DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <AnnouncementBody
            item={{
              content: form.content.trim(),
              meetingDate: form.meetingDate,
              meetingTime: form.meetingTime,
              location: form.location.trim(),
              onlineLink: form.onlineLink.trim(),
              agendaItems,
            }}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            {recipientCount} üyeye sistem içi bildirim oluşturulacak ve
            edu.tr adreslerine e-posta gönderilecek.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button disabled={busy} onClick={() => setConfirming(false)}>
            Vazgeç
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<CampaignOutlinedIcon />}
            disabled={busy}
            onClick={handlePublish}
          >
            {busy ? 'Gönderiliyor…' : 'Yayımla'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

/* ------------------------------------------------------------------ */
/* Özel duyuru listesi: üye cevabı ve Başkan için katılım özeti       */
/* ------------------------------------------------------------------ */

export function CustomAnnouncementList({ canManage }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [searchParams] = useSearchParams();
  const focusId = Number(searchParams.get('announce')) || null;
  const scrolledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getCustomAnnouncements()
      .then((data) => {
        if (!cancelled) {
          setItems(Array.isArray(data) ? data : []);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setError(messageOf(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const handler = () => setRefresh((n) => n + 1);
    window.addEventListener('custom-announcements:refresh', handler);
    return () => window.removeEventListener('custom-announcements:refresh', handler);
  }, []);

  // Başkan ekranında katılım cevapları sekme açıkken 15 saniyede bir yenilenir.
  useEffect(() => {
    if (!canManage) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setRefresh((n) => n + 1);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [canManage]);

  // Bildirimden gelinen duyuruya bir kez kaydırılır.
  useEffect(() => {
    if (!focusId || !items || scrolledRef.current) return;
    scrolledRef.current = true;
    document
      .getElementById(`ozel-duyuru-${focusId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusId, items]);

  const reload = () => {
    setRefresh((n) => n + 1);
    refreshNotifications();
  };

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography component="h2" sx={{ color: COLORS.title, fontWeight: 700, fontSize: '1.4rem' }}>
          Kurul Başkanı Duyuruları
        </Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={() => setRefresh((n) => n + 1)}
          sx={{ color: COLORS.blue, fontWeight: 700 }}
        >
          Yenile
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {items === null && <Skeleton variant="rounded" height={140} />}

      {items && !error && items.length === 0 && (
        <Paper elevation={0} sx={{ ...cardSx, textAlign: 'center' }}>
          <Typography sx={{ color: '#596779' }}>
            {canManage
              ? 'Henüz yayımlanmış bir duyuru yok. Yukarıdaki formdan ilk duyuruyu yayımlayabilirsiniz.'
              : 'Henüz size gönderilmiş bir kurul duyurusu yok.'}
          </Typography>
        </Paper>
      )}

      {items?.map((item) => (
        <CustomAnnouncementCard
          key={item.id}
          item={item}
          focused={focusId === item.id}
          onChanged={reload}
        />
      ))}
    </Box>
  );
}

function CustomAnnouncementCard({ item, focused, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      onChanged?.();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const stats = item.stats;

  return (
    <Paper
      id={`ozel-duyuru-${item.id}`}
      elevation={0}
      sx={{
        ...cardSx,
        mb: 2,
        borderTop: `4px solid ${COLORS.yellow}`,
        outline: focused ? `2px solid ${COLORS.blue}` : 'none',
        scrollMarginTop: 16,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
        <Typography sx={{ color: COLORS.title, fontWeight: 700, fontSize: '1.05rem' }}>
          Kurul Duyurusu
        </Typography>
        {item.isRecipient && !item.isRead && (
          <Chip size="small" label="Yeni" sx={{ bgcolor: COLORS.yellow, color: COLORS.navy, fontWeight: 800 }} />
        )}
        <Typography variant="caption" sx={{ color: '#94a3b8', ml: 'auto' }}>
          {formatDateTime(item.createdAt)}
          {item.publishedBy ? ` · ${item.publishedBy}` : ''}
        </Typography>
      </Box>

      <AnnouncementBody item={item} />

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {item.isRecipient && (
        <Box
          sx={{
            mt: 2.5,
            pt: 2,
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: 1.5,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Typography sx={{ color: '#596779', fontWeight: 600, mr: 1 }}>
            Katılım durumunuz:
          </Typography>
          <Button
            variant={item.myIntent === INTENT.yes ? 'contained' : 'outlined'}
            color="success"
            startIcon={<CheckCircleOutlineIcon />}
            disabled={busy}
            onClick={() => run(() => updateAnnouncementAttendance(item.id, INTENT.yes))}
          >
            Katılacağım
          </Button>
          <Button
            variant={item.myIntent === INTENT.no ? 'contained' : 'outlined'}
            color="error"
            startIcon={<HighlightOffIcon />}
            disabled={busy}
            onClick={() => run(() => updateAnnouncementAttendance(item.id, INTENT.no))}
          >
            Katılamayacağım
          </Button>
          {!item.isRead && (
            <Button
              variant="outlined"
              startIcon={<DoneAllIcon />}
              disabled={busy}
              onClick={() => run(() => markCustomAnnouncementRead(item.id))}
              sx={{ ...outlineBtn, ml: 'auto' }}
            >
              Okudum
            </Button>
          )}
        </Box>
      )}

      {stats && (
        <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ color: '#596779', fontWeight: 600, mr: 1 }}>
              Katılım ({stats.total} alıcı):
            </Typography>
            <Chip label={`Katılacak: ${stats.katilacak}`} sx={{ bgcolor: '#e7f6ec', color: '#1b6b3a', fontWeight: 700 }} />
            <Chip label={`Katılmayacak: ${stats.katilmayacak}`} sx={{ bgcolor: '#fdecec', color: '#a61b1b', fontWeight: 700 }} />
            <Chip label={`Cevap vermedi: ${stats.belirsiz}`} sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 700 }} />
            <Button size="small" onClick={() => setShowDetails((v) => !v)} sx={{ ml: 'auto', fontWeight: 700 }}>
              {showDetails ? 'Listeyi gizle' : 'Kişi listesi'}
            </Button>
          </Box>
          <Collapse in={showDetails} unmountOnExit>
            <Box component="ul" sx={{ m: 0, mt: 1.5, p: 0, listStyle: 'none' }}>
              {stats.details.map((d, index) => (
                <Box
                  component="li"
                  key={`${d.fullName}-${index}`}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    py: 0.75,
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span>{d.fullName}</span>
                  <Typography
                    component="span"
                    sx={{
                      fontWeight: 700,
                      color:
                        d.intent === INTENT.yes ? '#1b6b3a'
                          : d.intent === INTENT.no ? '#a61b1b'
                            : '#64748b',
                    }}
                  >
                    {INTENT_LABEL[d.intent] ?? INTENT_LABEL.Belirsiz}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}
    </Paper>
  );
}

function AnnouncementBody({ item }) {
  const agenda = (item.agendaItems || []).map((title, index) => ({ id: index + 1, title }));
  const hasMeeting = item.meetingDate || item.location || item.onlineLink;

  return (
    <>
      <Typography sx={{ color: COLORS.text, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
        {item.content}
      </Typography>

      {hasMeeting && (
        <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 1, display: 'grid', gap: 0.5 }}>
          {item.meetingDate && (
            <Typography variant="body2">
              <b>Tarih:</b> {formatLongDate(item.meetingDate)}
              {item.meetingTime ? `, ${item.meetingTime}` : ''}
            </Typography>
          )}
          {item.location && (
            <Typography variant="body2">
              <b>Yer:</b> {item.location}
            </Typography>
          )}
          {item.onlineLink && /^https?:\/\//i.test(item.onlineLink) && (
            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
              <b>Çevrimiçi:</b>{' '}
              <Link href={item.onlineLink} target="_blank" rel="noopener noreferrer">
                {item.onlineLink}
              </Link>
            </Typography>
          )}
        </Box>
      )}

      {agenda.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ color: COLORS.blue, fontSize: '0.78rem', fontWeight: 700, letterSpacing: 1, mb: 0.5 }}>
            GÜNDEM
          </Typography>
          <AgendaList items={agenda} dense />
        </Box>
      )}
    </>
  );
}
