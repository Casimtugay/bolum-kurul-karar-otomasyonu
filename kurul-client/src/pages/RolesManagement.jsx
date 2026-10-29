import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Container, Chip, IconButton, Button,
  Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Snackbar, Alert, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, FormControlLabel,
  Collapse, Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import SecurityIcon from '@mui/icons-material/Security';
import RefreshIcon from '@mui/icons-material/Refresh';

import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api/client';
import { getUnitDisplayName } from '../data/templateData';

import {
  NAVY, YELLOW, PALE_YELLOW, BORDER,
  primaryButton, outlineButton, checkboxStyle,
} from '../styles/adminTheme';

// Kimlikler, sunucudaki sayfa izinleriyle aynı kalmalıdır.
// İşlem kayıtları yalnızca sistem yöneticisine açık olduğundan rollere verilemez.
const PAGES = [
  {
    id: 'yeni-karar',
    name: 'Yeni Karar',
    short: 'Yeni Karar',
    read: 'Yeni karar ekranını görüntüleme',
    write:
      'Karar hazırlama, izin verilen katılım işlemleri ve imza hatırlatma e-postası hazırlama',
  },
  {
    id: 'oylama',
    name: 'Oylama ve Karar İnceleme',
    short: 'Oylama',
    read: 'Kararları, oylamayı ve PDF belgeyi görüntüleme',
    write:
      'Kararda katılımcı olan yetkili üyelerin oy ve imza işlemleri',
  },
  {
    id: 'arsiv',
    name: 'Karar Arşivi',
    short: 'Arşiv',
    read: 'Arşivlenmiş kararları görüntüleme',
    write: null,
  },
  {
    id: 'users',
    name: 'Kullanıcı Yönetimi',
    short: 'Kullanıcılar',
    read: 'Kurul kullanıcılarını görüntüleme',
    write:
      'Sunucunun izin verdiği kullanıcı ve üyelik yönetimi işlemleri',
  },
  {
    id: 'roles',
    name: 'Rol Yönetimi',
    short: 'Roller',
    read: 'Rolleri görüntüleme',
    write: 'İzin verilen rolleri ekleme, düzenleme ve silme',
  },
];

const emptyPerms = () =>
  Object.fromEntries(
    PAGES.map((page) => [
      page.id,
      { read: false, write: false },
    ])
  );

const applyPerm = (current, type, value) => {
  const next = { ...current, [type]: value };

  if (type === 'write' && value) next.read = true;
  if (type === 'read' && !value) next.write = false;

  return next;
};

const isVotingRole = (role) =>
  role.kind === 'Baskan' || role.kind === 'Uye';

export default function RolesManagement() {
  const navigate = useNavigate();
  const { unit, units, isAdmin, can } = useAuth();

  // Kurul, üst çubukta seçili olan kuruldur; başka kurula geçmek için oradan değiştirilir.
  const unitCode = unit?.code || '';
  const selectedUnit = units.find((item) => item.code === unitCode) || unit;

  const [roles, setRoles] = useState([]);
  const [openRoleId, setOpenRoleId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState('add');
  const [target, setTarget] = useState(null);
  const [roleName, setRoleName] = useState('');
  const [isBoardMember, setIsBoardMember] = useState(false);
  const [perms, setPerms] = useState(emptyPerms);
  const [dialogError, setDialogError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const requestSequence = useRef(0);
  const mutationLock = useRef(false);

  const canWrite = can('roles', 'write');
  const canGrant = (pageId, type) =>
    isAdmin || can(pageId, type);

  const notify = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;

    setLoading(true);
    setError('');
    setRoles([]);

    if (!unitCode) {
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch(
        `/api/admin/roles?unit=${encodeURIComponent(unitCode)}`
      );

      if (!Array.isArray(data)) {
        throw new Error('Sunucudan geçerli rol listesi alınamadı.');
      }

      if (sequence === requestSequence.current) {
        setRoles(data);
      }
    } catch (err) {
      if (sequence === requestSequence.current) {
        setError(err.message || 'Roller yüklenemedi.');
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [unitCode]);

  useEffect(() => {
    void load();

    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  const openAdd = () => {
    if (!canWrite || !unitCode || busy || loading) return;

    setMode('add');
    setTarget(null);
    setRoleName('');
    setIsBoardMember(false);
    setPerms(emptyPerms());
    setDialogError('');
    setDialogOpen(true);
  };

  const openEdit = (role) => {
    if (!canWrite || !role.editable || busy) return;

    setMode('edit');
    setTarget(role);
    setRoleName(role.name);
    setIsBoardMember(isVotingRole(role));
    setPerms(
      Object.fromEntries(
        PAGES.map((page) => [
          page.id,
          {
            read: Boolean(role.permissions?.[page.id]?.read),
            write: Boolean(role.permissions?.[page.id]?.write),
          },
        ])
      )
    );
    setDialogError('');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (!mutationLock.current) setDialogOpen(false);
  };

  const setPerm = (pageId, type, value) => {
    if (busy || !canGrant(pageId, type)) return;

    setPerms((previous) => ({
      ...previous,
      [pageId]: applyPerm(previous[pageId], type, value),
    }));
  };

  const grantablePages = (type) =>
    PAGES.filter(
      (page) =>
        (type === 'read' || page.write) &&
        canGrant(page.id, type)
    );

  const readPages = grantablePages('read');
  const writePages = grantablePages('write');

  const allRead =
    readPages.length > 0 &&
    readPages.every((page) => perms[page.id].read);

  const allWrite =
    writePages.length > 0 &&
    writePages.every((page) => perms[page.id].write);

  const someRead =
    readPages.some((page) => perms[page.id].read) && !allRead;

  const someWrite =
    writePages.some((page) => perms[page.id].write) && !allWrite;

  const toggleAll = (type, value) => {
    if (busy) return;

    setPerms((previous) => {
      const next = { ...previous };

      grantablePages(type).forEach((page) => {
        next[page.id] = applyPerm(next[page.id], type, value);
      });

      return next;
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (mutationLock.current || !canWrite || !unitCode) return;

    const name = roleName.trim();

    if (!name) {
      setDialogError('Rol adı boş bırakılamaz.');
      return;
    }

    if (mode === 'edit' && !target?.editable) return;

    mutationLock.current = true;
    setBusy(true);
    setDialogError('');

    const query = `unit=${encodeURIComponent(unitCode)}`;

    try {
      const body = {
        name,
        isBoardMember,
        permissions: perms,
      };

      if (mode === 'add') {
        await apiFetch(`/api/admin/roles?${query}`, {
          method: 'POST',
          body,
        });
      } else {
        await apiFetch(
          `/api/admin/roles/${target.id}?${query}`,
          { method: 'PUT', body }
        );
      }

      setDialogOpen(false);
      notify(mode === 'add' ? 'Yeni rol eklendi.' : 'Rol güncellendi.');
      await load();
    } catch (err) {
      setDialogError(err.message || 'Rol kaydedilemedi.');
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (
      mutationLock.current ||
      !canWrite ||
      !deleteTarget?.deletable
    ) {
      return;
    }

    mutationLock.current = true;
    setBusy(true);

    try {
      await apiFetch(
        `/api/admin/roles/${deleteTarget.id}?unit=${encodeURIComponent(unitCode)}`,
        { method: 'DELETE' }
      );

      setDeleteTarget(null);
      notify('Rol silindi.', 'info');
      await load();
    } catch (err) {
      setDeleteTarget(null);
      notify(err.message || 'Rol silinemedi.', 'error');
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  };

  const closeSnackbar = (_, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar((previous) => ({ ...previous, open: false }));
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6fa' }}>
      <Header
        title="Rol ve Yetki Yönetimi"
        onBackClick={() => {
          if (!mutationLock.current) navigate(-1);
        }}
        backText="GERİ DÖN"
      />

      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
        {/* SAYFA BAŞLIĞI */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 2,
            mb: 3,
            pb: 2,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <Box>
            <Typography
              component="h1"
              sx={{ color: NAVY, fontWeight: 700, fontSize: { xs: '1.35rem', md: '1.6rem' } }}
            >
              Roller ve Yetkiler
            </Typography>
            <Typography variant="body2" sx={{ color: '#5b6573', mt: 0.5 }}>
              Bir rolün sayfa yetkilerini görmek için adına tıklayın; düzenleme satırın sağındadır.
            </Typography>
          </Box>

          {canWrite && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openAdd}
              disabled={busy || loading || !unitCode}
              sx={{ ...primaryButton, px: 2.5 }}
            >
              Yeni Rol Ekle
            </Button>
          )}
        </Box>

        {/* KURUL SEÇİMİ */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 2.5 },
            mb: 3,
            border: `1px solid ${BORDER}`,
            borderRadius: 3,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <>
                  <Typography
                    variant="caption"
                    sx={{ color: '#64748b', fontWeight: 800 }}
                  >
                    SEÇİLİ KURUL
                  </Typography>
                  <Typography
                    sx={{ color: NAVY, fontWeight: 700, lineHeight: 1.6 }}
                  >
                    {getUnitDisplayName(selectedUnit)}
                  </Typography>
                </>
            </Box>

            <Chip
              label={loading ? 'Yükleniyor…' : `${roles.length} rol`}
              sx={{
                bgcolor: PALE_YELLOW,
                color: NAVY,
                fontWeight: 800,
              }}
            />

            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              disabled={loading || busy}
              onClick={() => void load()}
              sx={outlineButton}
            >
              Yenile
            </Button>
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {loading && (
          <Box role="status" sx={{ mb: 3 }}>
            <LinearProgress
              sx={{
                borderRadius: 2,
                bgcolor: '#fff0b3',
                '& .MuiLinearProgress-bar': { bgcolor: NAVY },
              }}
            />
            <Typography variant="body2" sx={{ mt: 1, color: '#64748b' }}>
              Roller yükleniyor…
            </Typography>
          </Box>
        )}

        {/* ROL LİSTESİ: satıra tıklayınca sayfa yetkileri açılır */}
        {!loading && roles.length > 0 && (
          <Paper
            elevation={0}
            sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, overflow: 'hidden' }}
          >
            {roles.map((role, index) => {
              const open = openRoleId === role.id;
              const allowedPages = PAGES.filter(
                (page) => role.permissions?.[page.id]?.read
              );

              return (
                <Box key={role.id} sx={{ borderTop: index ? `1px solid ${BORDER}` : 0 }}>
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setOpenRoleId(open ? null : role.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setOpenRoleId(open ? null : role.id);
                      }
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1.25,
                      cursor: 'pointer',
                      bgcolor: open ? '#f8fafc' : '#fff',
                      '&:hover': { bgcolor: '#f8fafc' },
                      '&:focus-visible': { outline: `2px solid ${NAVY}`, outlineOffset: -2 },
                    }}
                  >
                    <ExpandMoreIcon
                      fontSize="small"
                      sx={{
                        color: '#94a3b8',
                        transform: open ? 'none' : 'rotate(-90deg)',
                        transition: 'transform .15s',
                        flexShrink: 0,
                      }}
                    />

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, color: '#1f2937', fontSize: '0.95rem' }}>
                        {role.name}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b' }}>
                        {role.memberCount} üye · {role.isSystem ? 'Hazır rol' : 'Özel rol'} ·{' '}
                        {isVotingRole(role) ? 'Oy kullanır ve imzalar' : 'Oy kullanmaz'}
                      </Typography>
                    </Box>

                    <Typography
                      variant="body2"
                      sx={{ color: '#475569', display: { xs: 'none', md: 'block' }, flexShrink: 0 }}
                    >
                      {allowedPages.length} sayfa yetkisi
                    </Typography>

                    <Box sx={{ display: 'flex', flexShrink: 0 }}>
                      {canWrite && role.editable && (
                        <Tooltip title="Düzenle">
                          <IconButton
                            size="small"
                            disabled={busy}
                            aria-label={`${role.name} rolünü düzenle`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(role);
                            }}
                            sx={{ color: '#475569' }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canWrite && role.deletable && (
                        <Tooltip title="Sil">
                          <IconButton
                            size="small"
                            color="error"
                            disabled={busy}
                            aria-label={`${role.name} rolünü sil`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(role);
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>

                  <Collapse in={open} timeout="auto" unmountOnExit>
                    <Box
                      sx={{
                        px: { xs: 2, md: 6.5 },
                        py: 2,
                        bgcolor: '#f8fafc',
                        borderTop: `1px dashed ${BORDER}`,
                      }}
                    >
                      {allowedPages.length ? (
                        <Box
                          component="table"
                          sx={{
                            borderCollapse: 'collapse',
                            fontSize: 14,
                            '& td': { py: 0.5, pr: 3, color: '#334155', verticalAlign: 'top' },
                          }}
                        >
                          <tbody>
                            {allowedPages.map((page) => {
                              const writable = Boolean(
                                page.write && role.permissions?.[page.id]?.write
                              );
                              return (
                                <tr key={page.id}>
                                  <td style={{ fontWeight: 600 }}>{page.name}</td>
                                  <td>{writable ? 'Görüntüleme ve işlem' : 'Yalnızca görüntüleme'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          Henüz sayfa yetkisi tanımlanmamış.
                        </Typography>
                      )}
                      {!(canWrite && role.editable) && (
                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 1 }}>
                          Bu rolü düzenleme yetkiniz yok.
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Paper>
        )}

        {!loading && !roles.length && !error && (
          <Paper
            variant="outlined"
            sx={{ p: 5, textAlign: 'center', borderRadius: 3 }}
          >
            <SecurityIcon sx={{ fontSize: 42, color: NAVY, mb: 1 }} />
            <Typography sx={{ color: NAVY, fontWeight: 700 }}>
              {unitCode ? 'Bu kurulda henüz rol yok.' : 'Önce bir kurul seçin.'}
            </Typography>
          </Paper>
        )}

        <Alert
          severity="info"
          sx={{
            mt: 3,
            bgcolor: '#edf2f8',
            color: NAVY,
            borderRadius: 2,
            '& .MuiAlert-icon': { color: NAVY },
          }}
        >
          Yetki değişiklikleri sunucuda hemen geçerli olur. Kullanıcının
          ekranındaki menülerin güncellenmesi için kurulu yeniden seçmesi
          veya tekrar giriş yapması gerekebilir.
        </Alert>
      </Container>

      {/* ROL EKLEME / DÜZENLEME */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="md"
        fullWidth
        aria-labelledby="role-dialog-title"
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <Box component="form" onSubmit={handleSave}>
          <DialogTitle
            id="role-dialog-title"
            sx={{
              bgcolor: NAVY,
              color: '#fff',
              borderBottom: `4px solid ${YELLOW}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              fontWeight: 800,
            }}
          >
            {mode === 'edit' ? 'Rolü Düzenle' : 'Yeni Rol Oluştur'}

            <IconButton
              disabled={busy}
              onClick={closeDialog}
              aria-label="Pencereyi kapat"
              sx={{ color: YELLOW }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
            {dialogError && (
              <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
                {dialogError}
              </Alert>
            )}

            <TextField
              label="Rol Adı"
              value={roleName}
              onChange={(event) => setRoleName(event.target.value)}
              required
              fullWidth
              disabled={busy || (mode === 'edit' && target?.isSystem)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
              sx={{ mt: 2, mb: 2 }}
              helperText={
                mode === 'edit' && target?.isSystem
                  ? 'Hazır rollerin adı değiştirilemez.'
                  : 'Örneğin: Kurul Raportörü'
              }
            />

            <Box
              sx={{
                p: 2,
                mb: 2.5,
                bgcolor: PALE_YELLOW,
                border: '1px solid #f0db90',
                borderRadius: 2,
              }}
            >
              {mode === 'add' ? (
                <FormControlLabel
                  sx={{ alignItems: 'flex-start' }}
                  control={
                    <Checkbox
                      checked={isBoardMember}
                      disabled={busy}
                      sx={checkboxStyle}
                      onChange={(event) =>
                        setIsBoardMember(event.target.checked)
                      }
                    />
                  }
                  label={
                    <Box sx={{ pt: 0.7 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Kurul üyesi rolü
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        Oy ve imza katılımcılığı için kullanılır.
                        Oluşturulduktan sonra bu özellik değiştirilemez.
                        İşlem yapabilmek için ilgili sayfa yetkileri de gerekir.
                      </Typography>
                    </Box>
                  }
                />
              ) : (
                <Typography variant="body2" sx={{ color: NAVY }}>
                  {isBoardMember
                    ? 'Bu rol oy ve imza katılımcılığı için tanımlıdır.'
                    : 'Bu rol oy kullanmayan kullanıcılar için tanımlıdır.'}
                  {' '}Rolün bu özelliği değiştirilemez.
                </Typography>
              )}
            </Box>

            <Typography sx={{ color: NAVY, fontWeight: 800, mb: 0.5 }}>
              Sayfa ve İşlem Yetkileri
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
              İşlem yetkisi açıldığında okuma da açılır. Okuma kapatılırsa
              aynı sayfanın işlem yetkisi de kapanır.
            </Typography>

            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: `1px solid ${BORDER}`, borderRadius: 2 }}
            >
              <Table size="small" sx={{ minWidth: 560 }}>
                <TableHead sx={{ bgcolor: PALE_YELLOW }}>
                  <TableRow>
                    <TableCell sx={{ color: NAVY, fontWeight: 800 }}>
                      SAYFA / İŞLEM
                    </TableCell>
                    <TableCell align="center" sx={{ width: 125 }}>
                      <FormControlLabel
                        sx={{ m: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            sx={checkboxStyle}
                            checked={allRead}
                            indeterminate={someRead}
                            disabled={busy || !readPages.length}
                            onChange={(event) =>
                              toggleAll('read', event.target.checked)
                            }
                          />
                        }
                        label={
                          <Typography variant="caption" sx={{ fontWeight: 800 }}>
                            Tümünü Oku
                          </Typography>
                        }
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ width: 140 }}>
                      <FormControlLabel
                        sx={{ m: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            sx={checkboxStyle}
                            checked={allWrite}
                            indeterminate={someWrite}
                            disabled={busy || !writePages.length}
                            onChange={(event) =>
                              toggleAll('write', event.target.checked)
                            }
                          />
                        }
                        label={
                          <Typography variant="caption" sx={{ fontWeight: 800 }}>
                            Tüm İşlemler
                          </Typography>
                        }
                      />
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {PAGES.map((page) => (
                    <TableRow key={page.id} hover>
                      <TableCell sx={{ py: 1.7 }}>
                        <Typography
                          variant="body2"
                          sx={{ color: NAVY, fontWeight: 700 }}
                        >
                          {page.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ display: 'block', color: '#64748b', mt: 0.4 }}
                        >
                          Okuma: {page.read}
                        </Typography>
                        {page.write && (
                          <Typography
                            variant="caption"
                            sx={{ display: 'block', color: '#64748b', mt: 0.3 }}
                          >
                            İşlem: {page.write}
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell align="center">
                        <Checkbox
                          size="small"
                          sx={checkboxStyle}
                          checked={perms[page.id].read}
                          disabled={busy || !canGrant(page.id, 'read')}
                          slotProps={{
                            input: { 'aria-label': `${page.name} okuma yetkisi` },
                          }}
                          onChange={(event) =>
                            setPerm(page.id, 'read', event.target.checked)
                          }
                        />
                      </TableCell>

                      <TableCell align="center">
                        {page.write ? (
                          <Checkbox
                            size="small"
                            sx={checkboxStyle}
                            checked={perms[page.id].write}
                            disabled={busy || !canGrant(page.id, 'write')}
                            slotProps={{
                              input: {
                                'aria-label': `${page.name} işlem yetkisi`,
                              },
                            }}
                            onChange={(event) =>
                              setPerm(page.id, 'write', event.target.checked)
                            }
                          />
                        ) : (
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                            —
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {!isAdmin && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Yalnızca kendi sahip olduğunuz yetkileri verebilirsiniz.
                Diğer kutular bu nedenle kapalıdır.
              </Alert>
            )}
          </DialogContent>

          <DialogActions
            sx={{
              p: 2.5,
              borderTop: `1px solid ${BORDER}`,
              justifyContent: 'space-between',
            }}
          >
            <Button
              onClick={closeDialog}
              disabled={busy}
              variant="outlined"
              sx={outlineButton}
            >
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={busy || !canWrite || !roleName.trim()}
              startIcon={<SaveIcon />}
              sx={primaryButton}
            >
              {busy ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* SİLME ONAYI */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!mutationLock.current) setDeleteTarget(null);
        }}
        maxWidth="xs"
        fullWidth
        aria-labelledby="delete-role-title"
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle
          id="delete-role-title"
          sx={{
            color: NAVY,
            fontWeight: 800,
            borderBottom: `3px solid ${YELLOW}`,
          }}
        >
          Rolü Sil
        </DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <Typography sx={{ lineHeight: 1.7 }}>
            <strong>{deleteTarget?.name}</strong> rolünü silmek
            istediğinize emin misiniz?
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Role atanmış üye varsa silinemez. Önce üyeleri uygun
            başka bir role taşıyın.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            disabled={busy}
            onClick={() => setDeleteTarget(null)}
            sx={outlineButton}
          >
            Vazgeç
          </Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            color="error"
            disabled={busy}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {busy ? 'Siliniyor…' : 'Rolü Sil'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4500}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={closeSnackbar}
          variant="filled"
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}