import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Paper, Button,
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination,
  Alert, IconButton,
  LinearProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Snackbar,
} from '@mui/material';

import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutlineOutlined';
import ArchiveIcon from '@mui/icons-material/Archive';
import DeleteIcon from '@mui/icons-material/Delete';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import HowToVoteOutlinedIcon from '@mui/icons-material/HowToVoteOutlined';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';

import { COLORS } from './Header';
import PageLayout from './PageLayout';
import PdfExportButton from './PdfExportButton';
import StatusChip from './StatusChip';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentUnit } from '../data/units';
import {
  getDecisions,
  getArchive,
  getUnitMembers,
  deleteDecision,
} from '../data/decisionStore';

const NAVY = COLORS.navy;
const BLUE = COLORS.blue;
const TITLE = COLORS.title;
const SOFT = COLORS.blueSoft;
const YELLOW = COLORS.yellow;
const BORDER = COLORS.border;

const STATUS_OPTIONS = [
  ['Taslak', 'Taslak'],
  ['Oylamada', 'Oylamada'],
  ['ImzaBekliyor', 'İmza bekliyor'],
  ['Imzalandi', 'İmzalandı'],
  ['Reddedildi', 'Reddedildi'],
  ['IptalEdildi', 'İptal edildi'],
];

const ARCHIVE_STATUSES = [
  'Imzalandi', 'Reddedildi', 'IptalEdildi',
];

const EMPTY_FILTERS = {
  search: '',
  status: '',
  from: '',
  to: '',
};

const PROCESS_STEPS = [
  {
    title: 'Toplantı ve taslak',
    text: 'Yetkili kullanıcı toplantıyı seçer veya oluşturur. Karar metnini, eklerini ve ortak katılım listesini hazırlar.',
    icon: EventNoteOutlinedIcon,
  },
  {
    title: 'Oylama',
    text: 'Katılan üyeler oy kullanır. İlk oyla toplantının katılım listesi kilitlenir. Ret oyunda gerekçe yazılır.',
    icon: HowToVoteOutlinedIcon,
  },
  {
    title: 'Belge ve imza',
    text: 'Kabul edilen kararın belgesi incelenir. Katılan üyeler, ret oyu vermiş olsalar da imza adımını tamamlar.',
    icon: DrawOutlinedIcon,
  },
  {
    title: 'Arşiv ve takip',
    text: 'Tüm imzalar tamamlanınca karar mühürlenir. İmzalanmış, reddedilmiş ve iptal edilmiş kararlar arşivden incelenir.',
    icon: Inventory2OutlinedIcon,
  },
];

const outlinedButton = {
  color: BLUE,
  borderColor: BLUE,
  fontWeight: 600,
  textTransform: 'none',
  borderRadius: 2,
  '&:hover': {
    borderColor: NAVY,
    bgcolor: SOFT,
  },
};

// Başlık ve altında kısa mavi çizgi
function SectionTitle({ children, component = 'h2' }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        component={component}
        sx={{
          color: TITLE,
          fontSize: { xs: '1.4rem', md: '1.75rem' },
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {children}
      </Typography>
      <Box sx={{ width: 60, height: 3, bgcolor: BLUE, mt: 1.5 }} />
    </Box>
  );
}

// Duyuru satırı: solda ikon kutusu, sağda gri küçük etiket ve başlık
function InfoRow({ icon: Icon, label, title, text }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          bgcolor: SOFT,
          color: BLUE,
          borderRadius: 1.5,
        }}
      >
        <Icon sx={{ fontSize: 22 }} />
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {label && (
          <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>
            {label}
          </Typography>
        )}
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 500, color: TITLE, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        {text && (
          <Typography sx={{ fontSize: '0.85rem', color: '#596779', lineHeight: 1.7, mt: 0.5 }}>
            {text}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function DecisionListPage({ archive = false }) {
  const { unit, token } = useAuth();
  const [searchParams] = useSearchParams();

  // Üst aramadan gelen ?search= değeri başlangıç filtresi olur.
  // Değer değişince bileşen yeniden kurulur ve liste yeni aramayla yüklenir.
  const urlSearch = (searchParams.get('search') || '').trim().slice(0, 200);

  return (
    <DecisionListContent
      key={`${archive}:${unit?.code || ''}:${token || ''}:${urlSearch}`}
      archive={archive}
      initialSearch={urlSearch}
    />
  );
}

function DecisionListContent({ archive, initialSearch = '' }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, user, unit } = useAuth();

  const [unitInfo, setUnitInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [infoError, setInfoError] = useState('');
  const [infoLoading, setInfoLoading] = useState(true);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({
    ...EMPTY_FILTERS,
    search: initialSearch,
  });
  const [refresh, setRefresh] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [notice, setNotice] = useState('');
  const [stepsOpen, setStepsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const snapshot = useRef(null);
  const deleteLock = useRef(false);
  const mounted = useRef(false);

  const canManage = can('yeni-karar', 'write');

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    async function loadInfo() {
      const requests = [getCurrentUnit()];
      if (!archive) requests.push(getUnitMembers());

      const results = await Promise.allSettled(requests);
      if (cancelled) return;

      if (results[0].status === 'fulfilled') {
        setUnitInfo(results[0].value);
      }

      if (!archive && results[1]?.status === 'fulfilled') {
        setMembers(results[1].value);
      }

      const messages = results
        .filter((result) => result.status === 'rejected')
        .map((result) =>
          result.reason?.message || 'Kurul bilgileri yüklenemedi.'
        );

      setInfoError([...new Set(messages)].join(' '));
      setInfoLoading(false);
    }

    loadInfo();

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [archive]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError('');
    setItems([]);

    if (filters.from && filters.to && filters.from > filters.to) {
      setLoading(false);
      setTotal(0);
      setError('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
      return () => controller.abort();
    }

    const timer = window.setTimeout(async () => {
      try {
        const getPage = archive ? getArchive : getDecisions;
        const data = await getPage({
          ...filters,
          page: page + 1,
          pageSize,
          snapshotId: snapshot.current,
          signal: controller.signal,
        });

        if (cancelled) return;

        snapshot.current = data.snapshotId;
        setItems(data.items);
        setTotal(data.total);

        if (data.page - 1 !== page) {
          setPage(data.page - 1);
        }
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;
        setError(err.message || 'Karar listesi yüklenemedi.');
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [archive, filters, page, pageSize, refresh]);

  const changeFilter = (field, value) => {
    snapshot.current = null;
    setPage(0);
    setTotal(0);
    setFilters((previous) => ({ ...previous, [field]: value }));
  };

  const clearFilters = () => {
    // Adresteki ?search= kalırsa sayfa yenilenince filtre geri gelir.
    if (searchParams.has('search')) {
      setSearchParams({}, { replace: true });
    }

    snapshot.current = null;
    setPage(0);
    setTotal(0);
    setFilters({ ...EMPTY_FILTERS });
  };

  const askDelete = (item) => {
    if (deleteLock.current || !canManage) return;

    setActionError('');

    if (!item.rowVersion) {
      setActionError('Sürüm bilgisi alınamadı. Listeyi yenileyin.');
      return;
    }

    // Onay sırasında kullanıcının gördüğü sürümü koru.
    setDeleteTarget({ ...item });
  };

  const closeDelete = () => {
    if (!deleteLock.current) setDeleteTarget(null);
  };

  async function confirmDelete() {
    if (deleteLock.current || !deleteTarget || !canManage) return;

    const target = deleteTarget;
    deleteLock.current = true;
    setDeletingId(target.id);
    setActionError('');

    try {
      await deleteDecision(target.id, target.rowVersion);

      if (mounted.current) {
        setDeleteTarget(null);
        setNotice('Taslak karar silindi.');
        setRefresh((value) => value + 1);
      }
    } catch (err) {
      if (mounted.current) {
        setDeleteTarget(null);
        setActionError(
          err.message || 'Taslak silinemedi. Listeyi kontrol edin.'
        );
      }
    } finally {
      deleteLock.current = false;
      if (mounted.current) setDeletingId(null);
    }
  }

  const actionLabel = (status) => {
    if (archive) return 'İncele';
    if (status === 'ImzaBekliyor') return 'İmza sürecini aç';
    if (status === 'Oylamada') return 'Oylamayı aç';
    if (status === 'Taslak') return 'Taslağı aç';
    return 'İncele';
  };

  const statusOptions = archive
    ? STATUS_OPTIONS.filter(([value]) => ARCHIVE_STATUSES.includes(value))
    : STATUS_OPTIONS;

  const quickFilters = archive
    ? [['', 'Tüm sonuçlar'], ...statusOptions]
    : [
        ['', 'Tüm kararlar'],
        ['Taslak', 'Taslaklar'],
        ['Oylamada', 'Oylamadakiler'],
        ['ImzaBekliyor', 'İmza bekleyenler'],
        ['Imzalandi', 'İmzalananlar'],
      ];

  const hasFilter = Object.values(filters).some(Boolean);

  const boardName =
    unitInfo?.boardName || unit?.boardName || 'Kurul bilgisi yükleniyor…';
  const parentName = unitInfo?.parentName || unit?.parentName;

  return (
    <PageLayout title={archive ? 'Karar Arşivi' : 'Kurul Çalışma Alanı'}>
          <>
            {infoError && <Alert severity="error" sx={{ mb: 2 }}>{infoError}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>
                {actionError}
              </Alert>
            )}

            <Paper
              elevation={0}
              sx={{
                borderRadius: 2,
                p: { xs: 2.5, md: 4 },
                boxShadow: '0 2px 10px rgba(15,31,79,0.05)',
              }}
            >
              {/* Kurul tanıtım başlığı */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 2,
                  mb: 4,
                }}
              >
                <Box sx={{ minWidth: 0, flex: '1 1 420px' }}>
                  <Typography
                    sx={{
                      color: BLUE,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      letterSpacing: 1,
                      mb: 0.5,
                    }}
                  >
                    {archive ? 'KARAR ARŞİVİ' : 'KURUL ÇALIŞMA ALANI'}
                  </Typography>

                  <Typography
                    component="h2"
                    sx={{
                      color: TITLE,
                      fontSize: { xs: '1.4rem', md: '1.75rem' },
                      fontWeight: 600,
                      lineHeight: 1.35,
                    }}
                  >
                    {boardName}
                  </Typography>

                  {parentName && (
                    <Typography sx={{ color: '#64748b', mt: 0.5, fontSize: 14 }}>
                      {parentName}
                    </Typography>
                  )}

                  <Box sx={{ width: 60, height: 3, bgcolor: BLUE, mt: 1.5, mb: 2 }} />

                  <Typography
                    sx={{
                      color: '#475569',
                      fontSize: 14,
                      lineHeight: 1.8,
                      maxWidth: 760,
                    }}
                  >
                    {archive
                      ? 'Tamamlanan, reddedilen ve iptal edilen kararların belgelerini ve süreç geçmişini inceleyin.'
                      : `Hoş geldiniz${user?.name ? `, ${user.name}` : ''}. ${
                          canManage
                            ? 'Toplantınızı seçin, kararınızı hazırlayın ve oylama ile imza sürecini buradan takip edin.'
                            : 'Kararları açarak inceleyin. Yetkiniz ve katılım durumunuza göre oy ve imza işlemlerinizi tamamlayın.'
                        }`}
                  </Typography>
                </Box>

                {!archive && (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      variant="outlined"
                      startIcon={<PeopleOutlineIcon />}
                      onClick={() => setMembersOpen(true)}
                      sx={{ ...outlinedButton, borderRadius: '999px', px: 2.5 }}
                    >
                      Kurul üyelerini görüntüle
                      {!infoLoading && members.length > 0 ? ` (${members.length})` : ''}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<HelpOutlineIcon />}
                      onClick={() => setStepsOpen(true)}
                      sx={{ ...outlinedButton, borderRadius: '999px', px: 2.5 }}
                    >
                      Süreç adımları
                    </Button>
                  </Box>
                )}
              </Box>

              {/* Karar listesi */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 2,
                }}
              >
                <Box>
                  <SectionTitle>
                    {archive ? 'Arşivdeki Kararlar' : 'Kararlar'}
                  </SectionTitle>
                </Box>

                {!archive && can('arsiv', 'read') && (
                  <Button
                    variant="outlined"
                    startIcon={<ArchiveIcon />}
                    onClick={() => navigate('/archive')}
                    sx={outlinedButton}
                  >
                    Karar arşivini aç
                  </Button>
                )}
              </Box>

              {/* Üst çubuktaki aramadan gelindiyse aktif arama gösterilir. */}
              {filters.search && (
                <Alert
                  severity="info"
                  sx={{ mb: 2 }}
                  action={
                    <Button color="inherit" size="small" onClick={clearFilters}>
                      Aramayı temizle
                    </Button>
                  }
                >
                  “{filters.search}” araması için sonuçlar gösteriliyor.
                </Alert>
              )}


              <Box
                aria-label="Karar durumuna göre hızlı filtre"
                sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}
              >
                {quickFilters.map(([value, label]) => {
                  const selected = filters.status === value;

                  return (
                    <Button
                      key={value}
                      aria-pressed={selected}
                      onClick={() => changeFilter('status', value)}
                      sx={{
                        px: 2, py: 0.8,
                        border: '1px solid',
                        borderColor: selected ? BLUE : BORDER,
                        bgcolor: selected ? BLUE : '#fff',
                        color: selected ? '#fff' : '#42546B',
                        borderRadius: '999px',
                        fontWeight: 600,
                        textTransform: 'none',
                        '&:hover': {
                          bgcolor: selected ? NAVY : SOFT,
                          borderColor: BLUE,
                        },
                      }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </Box>

              <Box
                sx={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ px: 2.5, py: 1.5, bgcolor: '#fff', borderBottom: `1px solid ${BORDER}` }}>
                  <Typography variant="body2" sx={{ color: '#596779' }} aria-live="polite">
                    {loading
                      ? 'Kararlar yükleniyor…'
                      : error
                        ? 'Liste alınamadı.'
                        : `${total} kayıt bulundu`}
                  </Typography>
                </Box>

                <Box sx={{ height: 3 }}>
                  {loading && (
                    <LinearProgress
                      sx={{
                        height: 3,
                        bgcolor: SOFT,
                        '& .MuiLinearProgress-bar': { bgcolor: BLUE },
                      }}
                    />
                  )}
                </Box>

                <TableContainer>
                  <Table aria-label={archive ? 'Arşiv kararları' : 'Kurul kararları'} sx={{ minWidth: 900 }}>
                    <TableHead
                      sx={{
                        bgcolor: SOFT,
                        '& .MuiTableCell-root': {
                          color: TITLE, fontWeight: 700,
                          whiteSpace: 'nowrap', py: 2,
                        },
                      }}
                    >
                      <TableRow>
                        {[
                          'Toplantı No', 'Karar No', 'Konu', 'Toplantı Tarihi',
                          'Durum', archive ? 'Oy Sonucu' : 'Oylama / İmza', 'İşlemler',
                        ].map((label) => <TableCell key={label}>{label}</TableCell>)}
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {items.map((item) => (
                        <TableRow
                          key={item.id}
                          hover
                          sx={{
                            '&:last-child td': { borderBottom: 0 },
                            '&:hover': { bgcolor: '#F5F9FF !important' },
                            '& .MuiTableCell-root': { py: 2 },
                          }}
                        >
                          <TableCell sx={{ fontWeight: 700, color: BLUE, whiteSpace: 'nowrap' }}>
                            {item.meetingYear} / {item.meetingNo}
                          </TableCell>
                          <TableCell>{item.decisionNo}</TableCell>
                          <TableCell sx={{ minWidth: 220, maxWidth: 420, overflowWrap: 'anywhere' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.6 }}>
                              {item.konu}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.tarih}</TableCell>
                          <TableCell><StatusChip status={item.status} /></TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 170 }}>
                            {archive
                              ? item.oySonucu || '—'
                              : <VoteProgress item={item} />}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              {!archive && item.status === 'Oylamada' && item.myVotePending ? (
                                <Button
                                  size="small" variant="contained"
                                  startIcon={<HowToVoteOutlinedIcon />}
                                  onClick={() => navigate(`/oylama/${item.id}`)}
                                  sx={{
                                    bgcolor: YELLOW, color: NAVY, fontWeight: 800, whiteSpace: 'nowrap',
                                    boxShadow: 'none', '&:hover': { bgcolor: '#f0b400', boxShadow: 'none' },
                                  }}
                                >
                                  Oy kullan
                                </Button>
                              ) : (
                                <Button
                                  size="small" variant="outlined"
                                  onClick={() => navigate(`/oylama/${item.id}`)}
                                  sx={{ ...outlinedButton, whiteSpace: 'nowrap' }}
                                >
                                  {actionLabel(item.status)}
                                </Button>
                              )}
                              <PdfExportButton decision={item} />

                              {!archive && canManage && item.status === 'Taslak' && (
                                <IconButton
                                  size="small"
                                  title="Taslağı sil"
                                  aria-label={`${item.konu} taslağını sil`}
                                  disabled={deletingId !== null}
                                  onClick={() => askDelete(item)}
                                  sx={{
                                    ml: 0.5, color: '#B42318',
                                    '&:hover': { bgcolor: '#FFF0EE' },
                                  }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}

                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                            <Typography sx={{ fontWeight: 600, color: TITLE }}>
                              {loading
                                ? 'Kararlar yükleniyor…'
                                : error
                                  ? 'Karar listesi yüklenemedi.'
                                  : hasFilter
                                    ? 'Bu filtrelere uygun karar bulunamadı.'
                                    : archive
                                      ? 'Arşivde henüz karar yok.'
                                      : 'Henüz karar oluşturulmamış.'}
                            </Typography>
                            {!loading && !error && hasFilter && (
                              <Button onClick={clearFilters} sx={{ ...outlinedButton, mt: 1 }}>
                                Filtreleri temizle
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                <TablePagination
                  component="div"
                  count={total}
                  page={total === 0 ? 0 : page}
                  rowsPerPage={pageSize}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  onPageChange={(_, nextPage) => setPage(nextPage)}
                  onRowsPerPageChange={(event) => {
                    setPage(0);
                    setPageSize(Number(event.target.value));
                  }}
                  labelRowsPerPage="Sayfa başına:"
                  labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
                  getItemAriaLabel={(type) => ({
                    next: 'Sonraki sayfa',
                    previous: 'Önceki sayfa',
                    first: 'İlk sayfa',
                    last: 'Son sayfa',
                  }[type] || type)}
                  sx={{ borderTop: `1px solid ${BORDER}` }}
                />
              </Box>
            </Paper>
          </>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={closeDelete}
        fullWidth
        maxWidth="xs"
        aria-labelledby="delete-draft-title"
      >
        <DialogTitle id="delete-draft-title" sx={{ color: TITLE, fontWeight: 700 }}>
          Taslak silinsin mi?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontWeight: 600, mb: 1, overflowWrap: 'anywhere' }}>
            {deleteTarget?.konu}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Bu taslak kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={closeDelete}
            disabled={deletingId !== null}
            sx={outlinedButton}
          >
            Vazgeç
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
            disabled={deletingId !== null || !canManage}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {deletingId !== null ? 'Siliniyor…' : 'Taslağı sil'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4500}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setNotice('');
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      </Snackbar>

      <Dialog open={membersOpen} onClose={() => setMembersOpen(false)} fullWidth maxWidth="md">
        <DialogTitle
          sx={{
            bgcolor: NAVY,
            color: '#fff',
            borderBottom: `4px solid ${YELLOW}`,
            fontWeight: 800,
          }}
        >
          {unitInfo?.membersLabel || 'Kurul Üyeleri'}
          {members.length > 0 ? ` (${members.length})` : ''}
        </DialogTitle>
        <DialogContent sx={{ pt: '24px !important' }}>
          {members.length > 0 ? (
            <Box sx={{ border: '1px solid #e2e6ec', borderRadius: 1.5 }}>
              {members.map((member, index) => (
                <Box
                  key={member.userId}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                    px: 2,
                    py: 1.1,
                    borderTop: index ? '1px solid #eef1f5' : 0,
                  }}
                >
                  <Typography sx={{ fontWeight: 600, color: '#1f2937', fontSize: '0.95rem' }}>
                    {member.displayName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b', textAlign: 'right' }}>
                    {member.duty}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography sx={{ color: '#64748b', fontSize: 14 }}>
              {infoLoading
                ? 'Üyeler yükleniyor…'
                : infoError
                  ? 'Üye listesi alınamadı. Sayfadaki hata mesajını kontrol edin.'
                  : 'Gösterilecek üye kaydı bulunamadı.'}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setMembersOpen(false)} sx={{ fontWeight: 700 }}>
            Kapat
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={stepsOpen} onClose={() => setStepsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle
          sx={{
            bgcolor: NAVY,
            color: '#fff',
            borderBottom: `4px solid ${YELLOW}`,
            fontWeight: 800,
          }}
        >
          Karar Süreci Adımları
        </DialogTitle>
        <DialogContent sx={{ pt: '24px !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {PROCESS_STEPS.map((step, index) => (
              <InfoRow
                key={step.title}
                icon={step.icon}
                label={`${index + 1}. adım`}
                title={step.title}
                text={step.text}
              />
            ))}
          </Box>
          <Typography variant="caption" sx={{ display: 'block', color: '#66758A', mt: 3 }}>
            İmzalar, üyenin imza fotoğrafı ve parolasıyla atılan sistem içi onay imzasıdır; nitelikli elektronik imza değildir.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setStepsOpen(false)} sx={{ fontWeight: 700 }}>
            Kapat
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}

// Listede kararın oylama ya da imza ilerlemesi: sayılar ve ince bir çubuk.
function VoteProgress({ item }) {
  const total = item.eligible ?? 0;
  const signing = ['ImzaBekliyor', 'Imzalandi'].includes(item.status);
  const voting = item.status === 'Oylamada';
  if ((!signing && !voting) || total === 0) return '—';

  const kabul = item.kabulCount ?? 0;
  const ret = item.retCount ?? 0;
  const done = signing ? item.signedCount ?? 0 : kabul + ret;

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600, color: TITLE }}>
        {signing ? (
          <>İmza {done} / {total}</>
        ) : (
          <>
            <Box component="span" sx={{ color: '#2e7d32' }}>Kabul {kabul}</Box>
            {' · '}
            <Box component="span" sx={{ color: '#c62828' }}>Ret {ret}</Box>
            {' · '}Bekleyen {total - done}
          </>
        )}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={(done / total) * 100}
        aria-label={signing ? 'İmza ilerlemesi' : 'Oylama ilerlemesi'}
        sx={{
          mt: 0.75, height: 6, borderRadius: 3, bgcolor: '#e2e8f0',
          '& .MuiLinearProgress-bar': { bgcolor: signing ? BLUE : '#2e7d32' },
        }}
      />
    </Box>
  );
}
