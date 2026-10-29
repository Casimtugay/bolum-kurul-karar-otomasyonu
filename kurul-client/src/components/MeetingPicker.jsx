import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem,
  TextField, Typography,
} from '@mui/material';
import {
  getMeetings,
  createMeeting,
} from '../data/decisionStore';
import { useAuth } from '../contexts/AuthContext';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dateLabel = (value) => {
  const parts = String(value || '').slice(0, 10).split('-');
  return parts.length === 3
    ? `${parts[2]}.${parts[1]}.${parts[0]}`
    : value;
};

export default function MeetingPicker({
  value,
  onChange,
  disabled = false,
}) {
  const { can } = useAuth();

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [number, setNumber] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const createLock = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');

    getMeetings({
      page,
      pageSize: 25,
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setItems(data.items);
        setTotalPages(data.totalPages);

        if (data.page !== page) {
          setPage(data.page);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err.message || 'Toplantılar yüklenemedi.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page, refresh]);

  // Seçili toplantı başka sayfadaysa seçim kutusunda yine görünür.
  const options = value && !items.some((m) => m.id === value.id)
    ? [value, ...items]
    : items;

  const handleCreate = async () => {
    if (createLock.current || disabled || !date) return;

    const text = number.trim();
    const parsed = text ? Number(text) : null;

    if (
      parsed !== null &&
      (!Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        parsed > 2147483647)
    ) {
      setCreateError('Toplantı numarası pozitif bir tam sayı olmalıdır.');
      return;
    }

    createLock.current = true;
    setCreating(true);
    setCreateError('');

    try {
      const created = await createMeeting({
        meetingDate: date,
        meetingNo: parsed,
      });

      if (!mounted.current) return;

      onChange(created);
      setOpen(false);
      setPage(1);
      setRefresh((n) => n + 1);
    } catch (err) {
      if (mounted.current) {
        const networkFailure = err?.status === 0;

        setCreateError(
          (err.message || 'Toplantı oluşturulamadı.') +
          (networkFailure
            ? ' Bağlantı hatası yaşandıysa tekrar oluşturmadan önce listeyi yenileyin.'
            : '')
        );
      }
    } finally {
      createLock.current = false;
      if (mounted.current) setCreating(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        select
        fullWidth
        label="Toplantı"
        value={value?.id ?? ''}
        disabled={disabled || loading || creating}
        onChange={(event) => {
          const selected = options.find(
            (m) => m.id === Number(event.target.value)
          );
          onChange(selected || null);
        }}
        helperText={
          loading
            ? 'Toplantılar yükleniyor...'
            : 'Kararın tarihi ve katılımcıları seçilen toplantıdan alınır.'
        }
      >
        <MenuItem value="">
          <em>Toplantı seçiniz</em>
        </MenuItem>

        {options.map((meeting) => (
          <MenuItem key={meeting.id} value={meeting.id}>
            {meeting.meetingYear}/{meeting.meetingNo}
            {' — '}
            {dateLabel(meeting.meetingDate)}
            {meeting.attendanceLocked ? ' — Katılım kilitli' : ''}
          </MenuItem>
        ))}
      </TextField>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          type="button"
          disabled={disabled || loading || page <= 1}
          onClick={() => setPage((n) => n - 1)}
        >
          Önceki
        </Button>

        <Typography variant="body2">
          {page} / {totalPages}
        </Typography>

        <Button
          type="button"
          disabled={disabled || loading || page >= totalPages}
          onClick={() => setPage((n) => n + 1)}
        >
          Sonraki
        </Button>

        <Button
          type="button"
          disabled={disabled || loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          Listeyi Yenile
        </Button>

        {can('yeni-karar', 'write') && (
          <Button
            type="button"
            variant="outlined"
            disabled={disabled || creating}
            onClick={() => {
              setDate(today());
              setNumber('');
              setCreateError('');
              setOpen(true);
            }}
          >
            Yeni Toplantı
          </Button>
        )}
      </Box>

      {value && (
        <Alert severity="info">
          Seçilen toplantı: {value.meetingYear}/{value.meetingNo}
          {' · '}{dateLabel(value.meetingDate)}.
          {' '}Karar numarası kayıtta verilir.
        </Alert>
      )}

      <Dialog
        open={open}
        onClose={() => {
          if (!createLock.current) setOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Yeni Toplantı</DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {createError && (
            <Alert severity="error">{createError}</Alert>
          )}

          <Typography variant="body2">
            Aktif kurul üyeleri toplantının katılımcı listesine alınır.
            Katılım durumları ilk oy kullanılmadan önce düzenlenebilir.
          </Typography>

          <TextField
            sx={{ mt: 1 }}
            type="date"
            label="Toplantı tarihi"
            value={date}
            disabled={creating}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            type="number"
            label="Toplantı no (isteğe bağlı)"
            value={number}
            disabled={creating}
            onChange={(e) => setNumber(e.target.value)}
            helperText="Boş bırakırsanız uygun sıradaki numara verilir."
            slotProps={{
              htmlInput: { min: 1, max: 2147483647, step: 1 },
            }}
          />
        </DialogContent>

        <DialogActions>
          <Button
            disabled={creating}
            onClick={() => setOpen(false)}
          >
            Vazgeç
          </Button>
          <Button
            variant="contained"
            disabled={creating || !date}
            onClick={handleCreate}
          >
            {creating ? 'Oluşturuluyor...' : 'Toplantıyı Oluştur'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}