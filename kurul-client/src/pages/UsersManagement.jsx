import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Container, IconButton, Button, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle, TextField,
  Snackbar, Alert, MenuItem, Select, FormControl, InputLabel,
  LinearProgress, Tabs, Tab, Pagination, Collapse, Tooltip, InputAdornment,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import EditIcon from '@mui/icons-material/Edit';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import BlockIcon from '@mui/icons-material/Block';
import VerifiedIcon from '@mui/icons-material/Verified';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import PeopleIcon from '@mui/icons-material/People';
import SearchIcon from '@mui/icons-material/Search';

import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api/client';
import { getUnitDisplayName } from '../data/templateData';
import {
  NAVY, YELLOW, PALE_YELLOW, BORDER,
  primaryButton, outlineButton, infoAlertSx,
} from '../styles/adminTheme';

const EMPTY_FORM = {
  title: '',
  fullName: '',
  username: '',
  email: '',
  phoneNumber: '',
  password: '',
  roleId: '',
};

const messageOf = (error) =>
  error?.message || 'İşlem tamamlanamadı. Tekrar deneyin.';

export default function UsersManagement() {
  const navigate = useNavigate();
  const { unit, units = [], isAdmin, can } = useAuth();

  const [selectedView, setSelectedView] = useState('board');

  const view = isAdmin ? selectedView : 'board';

  // Kurul, üst çubukta seçili olan kuruldur; başka kurula geçmek için oradan değiştirilir.
  const unitCode = unit?.code || '';

  const selectedUnit =
    units.find((item) => item.code === unitCode) ||
    (unit?.code === unitCode ? unit : null);

  const unitName = selectedUnit ? getUnitDisplayName(selectedUnit) : '';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6fa' }}>
      <Header
        title="Kullanıcı Yönetimi"
        onBackClick={() => navigate(-1)}
        backText="GERİ DÖN"
      />

      <UsersContent
        key={`${isAdmin ? 'admin' : 'member'}:${view}:${unitCode}`}
        view={view}
        onViewChange={setSelectedView}
        unitCode={unitCode}
        unitName={unitName}
        isAdmin={isAdmin}
        canRead={isAdmin || can('users', 'read')}
        canWrite={isAdmin || can('users', 'write')}
      />
    </Box>
  );
}

function UsersContent({
  view, onViewChange, unitCode, unitName,
  isAdmin, canRead, canWrite,
}) {
  const allAccounts = view === 'all';

  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);



  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    page: 1,
  });
  const [paging, setPaging] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });

  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [newPassword, setNewPassword] = useState('');
  const [deleteUsername, setDeleteUsername] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [openUserId, setOpenUserId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState([]);

  const aliveRef = useRef(false);
  const busyRef = useRef(false);
  const requestRef = useRef(0);

  const query = `unit=${encodeURIComponent(unitCode)}`;
  const target = dialog?.member;

  const isEdit = dialog?.type === 'edit';
  const formOpen = dialog?.type === 'add' || isEdit;
  const profileEditable = !isEdit || Boolean(target?.canEditProfile);

  const activating = dialog?.type === 'activate';
  const deactivating = dialog?.type === 'deactivate';
  const removing = dialog?.type === 'remove';
  const deleting = dialog?.type === 'delete';

  const confirmationOpen =
    activating || deactivating || removing || deleting;

  const blocked = busy || loading;
  const navigationBlocked = busy || Boolean(dialog);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const isCurrent = () =>
      aliveRef.current && request === requestRef.current;

    if (
      (allAccounts && !isAdmin) ||
      (!allAccounts && (!unitCode || !canRead))
    ) {
      if (isCurrent()) {
        setMembers([]);
        setRoles([]);
        setLoading(false);
        setError(
          !allAccounts && !unitCode
            ? 'Önce bir kurul seçmelisiniz.'
            : 'Bu sayfayı görüntüleme yetkiniz yok.'
        );
      }
      return;
    }

    if (isCurrent()) {
      setLoading(true);
      setError('');
    }

    try {
      if (allAccounts) {
        const params = new URLSearchParams({
          search: filters.search,
          status: filters.status,
          page: String(filters.page),
        });

        const data = await apiFetch(`/api/admin/accounts?${params}`);

        if (!data || !Array.isArray(data.items)) {
          throw new Error('Sunucudan beklenen hesap listesi alınamadı.');
        }

        if (isCurrent()) {
          setMembers(data.items);
          setRoles([]);
          setPaging({
            page: data.page,
            total: data.total,
            totalPages: data.totalPages,
          });
        }
      } else {
        const [memberList, roleList] = await Promise.all([
          apiFetch(`/api/admin/users?${query}`),
          apiFetch(`/api/admin/users/roles?${query}`),
        ]);

        if (!Array.isArray(memberList) || !Array.isArray(roleList)) {
          throw new Error('Sunucudan beklenen kullanıcı listesi alınamadı.');
        }

        if (isCurrent()) {
          setMembers(memberList);
          setRoles(roleList);
        }
      }
    } catch (err) {
      if (isCurrent()) {
        setMembers([]);
        setRoles([]);
        setError(messageOf(err));
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [
    allAccounts, isAdmin, unitCode, canRead, query,
    filters.search, filters.status, filters.page,
  ]);

  useEffect(() => {
    aliveRef.current = true;
    load();

    return () => {
      aliveRef.current = false;
      requestRef.current += 1;
    };
  }, [load]);

  const notify = (message, severity = 'success') => {
    if (aliveRef.current) {
      setSnackbar({ open: true, message, severity });
    }
  };

  const clearDialog = () => {
    setDialog(null);
    setDialogError('');
    setNewPassword('');
    setDeleteUsername('');
    setForm({ ...EMPTY_FORM });
  };

  const closeDialog = () => {
    if (!busyRef.current) clearDialog();
  };

  const openDialog = async (type, member = null) => {
    if (busyRef.current || loading) return;

    setDialogError('');
    setNewPassword('');
    setDeleteUsername('');

    if (type === 'add') {
      const assignable = roles.filter((role) => role.assignable);
      const defaultRole =
        assignable.find((role) => role.kind === 'Uye') ||
        assignable[0];

      setForm({
        ...EMPTY_FORM,
        roleId: defaultRole?.id ?? '',
      });
    } else if (type === 'edit') {
      setForm({
        title: member.title || '',
        fullName: member.fullName || '',
        username: member.username || '',
        email: member.email || '',
        phoneNumber: member.phoneNumber || member.phone || '',
        password: '',
        roleId: member.roleId,
      });
    }

    setDialog({ type, member });
  };

  const setField = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const mayChangeStatus = (member) =>
    isAdmin &&
    !member.isSelf &&
    (
      allAccounts
        ? member.canChangeStatus === true
        : member.canManage === true
    );

  async function perform(action, successMessage, severity = 'success') {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setDialogError('');

    try {
      await action();
      if (!aliveRef.current) return;

      clearDialog();
      notify(successMessage, severity);
      await load();
    } catch (err) {
      if (aliveRef.current) setDialogError(messageOf(err));
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }

  const handleSave = async (event) => {
    event.preventDefault();

    if (busyRef.current || !canWrite || !formOpen || allAccounts) return;

    const roleId = Number(form.roleId);
    const selectedRole = roles.find((role) => role.id === roleId);

    if (
      !Number.isInteger(roleId) ||
      roleId <= 0 ||
      !selectedRole ||
      (!selectedRole.assignable && !(isEdit && target.roleId === roleId))
    ) {
      setDialogError('Atama yetkiniz olan geçerli bir rol seçin.');
      return;
    }

    if (!isEdit) {
      if (!form.fullName.trim() || form.fullName.trim().length < 3) {
        setDialogError('Ad soyad en az 3 karakter olmalıdır.');
        return;
      }

      if (!form.email.trim()) {
        setDialogError('E-posta adresi gereklidir.');
        return;
      }

      const username = (form.username.trim() || form.email.split('@')[0]).trim().toLowerCase();

      if (username.length < 3) {
        setDialogError('Kullanıcı adı en az 3 karakter olmalıdır.');
        return;
      }

      if (!form.password || form.password.length < 8) {
        setDialogError('Yeni hesap parolası en az 8 karakter olmalıdır.');
        return;
      }

      await perform(
        () => apiFetch(`/api/admin/users?${query}`, {
          method: 'POST',
          body: {
            username,
            fullName: form.fullName.trim(),
            title: form.title.trim(),
            email: form.email.trim(),
            phoneNumber: form.phoneNumber ? form.phoneNumber.trim() : '',
            password: form.password,
            roleId,
          },
        }),
        'Kullanıcı kurula başarıyla eklendi.'
      );
      return;
    }

    if (!target?.canManage) return;

    const body = { roleId };

    if (target.canEditProfile) {
      if (form.fullName.trim().length < 3) {
        setDialogError('Ad soyad en az 3 karakter olmalıdır.');
        return;
      }

      if (!form.email.trim()) {
        setDialogError('E-posta adresi gereklidir.');
        return;
      }

      Object.assign(body, {
        fullName: form.fullName.trim(),
        title: form.title.trim(),
        email: form.email.trim(),
        phoneNumber: form.phoneNumber.trim(),
      });
    }

    await perform(
      () => apiFetch(`/api/admin/users/${target.userId}?${query}`, {
        method: 'PUT',
        body,
      }),
      'Kullanıcı güncellendi.'
    );
  };

  const handlePassword = async (event) => {
    event.preventDefault();
    if (!target?.canResetPassword || busyRef.current || allAccounts) return;

    if (!newPassword.trim() || newPassword.length < 8) {
      setDialogError('Parola en az 8 karakter olmalıdır.');
      return;
    }

    await perform(
      () => apiFetch(
        `/api/admin/users/${target.userId}/password?${query}`,
        {
          method: 'POST',
          body: { newPassword },
        }
      ),
      'Parola sıfırlandı. Önceki oturumlar geçersiz kılındı.'
    );
  };

  const handleConfirm = async (event) => {
    event.preventDefault();
    if (!target || busyRef.current) return;

    if (deleting) {
      if (!allAccounts || !isAdmin || !target.canDelete) return;

      if (deleteUsername.trim() !== target.username) {
        setDialogError('Kullanıcı adını aynen yazın.');
        return;
      }

      await perform(
        () => apiFetch(`/api/admin/accounts/${target.userId}`, {
          method: 'DELETE',
          body: { username: deleteUsername.trim() },
        }),
        'Hesap kalıcı olarak silindi.',
        'info'
      );
      return;
    }

    if (removing) {
      if (
        allAccounts || !canWrite ||
        !target.canManage || target.isSelf
      ) return;

      await perform(
        () => apiFetch(`/api/admin/users/${target.userId}?${query}`, {
          method: 'DELETE',
        }),
        'Kullanıcı seçilen kuruldan çıkarıldı.',
        'info'
      );
      return;
    }

    if (!activating && !deactivating) return;
    if (!mayChangeStatus(target)) return;
    if (activating && target.isActive !== false) return;
    if (deactivating && target.isActive !== true) return;

    const action = activating ? 'activate' : 'deactivate';

    await perform(
      () => apiFetch(
        `/api/admin/accounts/${target.userId}/${action}`,
        { method: 'POST' }
      ),
      activating
        ? 'Hesap aktifleştirildi. Giriş için aktif kurul üyeliği de gereklidir.'
        : 'Hesap pasife alındı. Tüm kurullara erişimi kapatıldı.',
      activating ? 'success' : 'info'
    );
  };

  const handleSearch = (event) => {
    event.preventDefault();
    if (blocked || navigationBlocked) return;

    const search = searchInput.trim();

    if (filters.search === search && filters.page === 1) {
      load();
      return;
    }

    setLoading(true);
    setFilters((current) => ({ ...current, search, page: 1 }));
  };

  const toggleGroup = (key) =>
    setCollapsedGroups((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ));

  const filterText = quickFilter.trim().toLocaleLowerCase('tr-TR');
  const visibleMembers = filterText
    ? members.filter((member) =>
      [member.title, member.fullName, member.username, member.email, member.roleName]
        .some((value) => String(value || '').toLocaleLowerCase('tr-TR').includes(filterText)))
    : members;

  const groups = (() => {
    const byKey = new Map();
    const add = (key, label, order, member) => {
      if (!byKey.has(key)) byKey.set(key, { key, label, order, members: [] });
      byKey.get(key).members.push(member);
    };

    visibleMembers.forEach((member) => {
      if (allAccounts) {
        if (member.systemRole === 'Admin') add('admin', 'Sistem yöneticileri', 0, member);
        else if (member.isActive === false) add('inactive', 'Pasif hesaplar', 2, member);
        else add('active', 'Aktif hesaplar', 1, member);
        return;
      }
      const name = member.roleName || 'Rolü belirtilmemiş';
      const index = roles.findIndex((role) => role.name === member.roleName);
      add(`role:${name}`, name, index < 0 ? roles.length : index, member);
    });

    return [...byKey.values()]
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'tr'))
      .map((group) => ({
        ...group,
        members: [...group.members].sort((a, b) =>
          String(a.fullName).localeCompare(String(b.fullName), 'tr')),
      }));
  })();

  const confirmationTitle = deleting
    ? 'Hesabı Kalıcı Sil'
    : activating
      ? 'Hesabı Aktifleştir'
      : deactivating
        ? 'Hesabı Pasife Al'
        : 'Kuruldan Çıkar';

  const addDisabled =
    blocked || !unitCode || !roles.some((role) => role.assignable);

  const dialogTitleSx = {
    bgcolor: NAVY,
    color: '#fff',
    borderBottom: `4px solid ${YELLOW}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    fontWeight: 800,
  };

  const lightDialogTitleSx = {
    color: NAVY,
    fontWeight: 800,
    borderBottom: `3px solid ${YELLOW}`,
  };

  const dialogPaper = { paper: { sx: { borderRadius: 3 } } };

  return (
    <>
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
              {allAccounts ? 'Tüm Hesaplar' : 'Kurul Kullanıcıları'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#5b6573', mt: 0.5 }}>
              {allAccounts
                ? 'Sistemdeki tüm hesapları görüntüleyebilir, aktifleştirebilir veya pasife alabilirsiniz.'
                : 'Bir kişinin ayrıntıları için adına tıklayın; işlemler satırın sağındadır.'}
            </Typography>
          </Box>

          {!allAccounts && canWrite && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => openDialog('add')}
              disabled={addDisabled}
              sx={{ ...primaryButton, px: 2.5 }}
            >
              Kurula Kullanıcı Ekle
            </Button>
          )}
        </Box>

        {isAdmin && (
          <Tabs
            value={view}
            onChange={(_, value) => {
              if (!navigationBlocked) onViewChange(value);
            }}
            sx={{
              mb: 3,
              bgcolor: '#fff',
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              px: 1,
              '& .MuiTabs-indicator': { bgcolor: YELLOW, height: 3 },
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 700,
                color: '#64748b',
              },
              '& .MuiTab-root.Mui-selected': { color: NAVY },
            }}
          >
            <Tab
              value="board"
              label="Kurul üyeleri"
              disabled={navigationBlocked}
            />
            <Tab
              value="all"
              label="Tüm hesaplar"
              disabled={navigationBlocked}
            />
          </Tabs>
        )}

        {/* KURUL SEÇİMİ / ARAMA */}
        {allAccounts ? (
          <>
            <Alert severity="info" sx={{ ...infoAlertSx, mb: 3 }}>
              Kurul üyeliği olmayan hesaplar da burada görünür.
              Üyelik eklemek için üst çubuktan kurulu seçin, “Kurul üyeleri”
              sekmesinde mevcut kullanıcı adını kullanın.
              Hesap silme yalnızca aktif üyeliği ve karar/dosya bağlantısı
              olmayan kullanıcılar için açıktır.
            </Alert>

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
                component="form"
                onSubmit={handleSearch}
                sx={{
                  display: 'flex',
                  gap: 2,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <TextField
                  label="Ad, kullanıcı adı veya e-posta"
                  size="small"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  disabled={blocked || navigationBlocked}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  sx={{ minWidth: 260, flex: 1 }}
                />

                <FormControl
                  size="small"
                  sx={{ minWidth: 170 }}
                  disabled={blocked || navigationBlocked}
                >
                  <InputLabel id="account-status-label">
                    Hesap durumu
                  </InputLabel>
                  <Select
                    labelId="account-status-label"
                    label="Hesap durumu"
                    value={filters.status}
                    onChange={(event) => {
                      const status = event.target.value;
                      if (status === filters.status) return;

                      setLoading(true);
                      setFilters((current) => ({
                        ...current,
                        status,
                        page: 1,
                      }));
                    }}
                  >
                    <MenuItem value="all">Tümü</MenuItem>
                    <MenuItem value="active">Aktif</MenuItem>
                    <MenuItem value="inactive">Pasif</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SearchIcon />}
                  disabled={blocked || navigationBlocked}
                  sx={primaryButton}
                >
                  Ara
                </Button>

                <Chip
                  label={loading ? 'Yükleniyor…' : `${paging.total} hesap`}
                  sx={{ bgcolor: PALE_YELLOW, color: NAVY, fontWeight: 800 }}
                />

                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  disabled={blocked || navigationBlocked}
                  onClick={load}
                  sx={outlineButton}
                >
                  Yenile
                </Button>
              </Box>
            </Paper>
          </>
        ) : (
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
              <TextField
                size="small"
                placeholder="İsim, kullanıcı adı veya e-posta ara"
                value={quickFilter}
                onChange={(event) => setQuickFilter(event.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ minWidth: 240, flex: 1 }}
              />

              <Chip
                label={loading ? 'Yükleniyor…' : `${members.length} üye`}
                sx={{ bgcolor: PALE_YELLOW, color: NAVY, fontWeight: 800 }}
              />

              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                disabled={blocked || navigationBlocked || !canRead}
                onClick={load}
                sx={outlineButton}
              >
                Yenile
              </Button>
            </Box>
          </Paper>
        )}

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
              Kullanıcılar yükleniyor…
            </Typography>
          </Box>
        )}

        {/* KULLANICI LİSTESİ: gruplu, satıra tıklayınca ayrıntı açılır */}
        {!loading && visibleMembers.length > 0 && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {groups.map((group) => {
              const collapsed = collapsedGroups.includes(group.key);

              return (
                <Paper
                  key={group.key}
                  elevation={0}
                  sx={{ border: `1px solid ${BORDER}`, borderRadius: 2, overflow: 'hidden' }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={!collapsed}
                    sx={{
                      all: 'unset',
                      boxSizing: 'border-box',
                      width: '100%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 2,
                      py: 1.25,
                      bgcolor: '#f7f8fa',
                      borderBottom: collapsed ? 0 : `1px solid ${BORDER}`,
                      '&:focus-visible': { outline: `2px solid ${NAVY}`, outlineOffset: -2 },
                    }}
                  >
                    <ExpandMoreIcon
                      fontSize="small"
                      sx={{
                        color: '#64748b',
                        transform: collapsed ? 'rotate(-90deg)' : 'none',
                        transition: 'transform .15s',
                      }}
                    />
                    <Typography sx={{ fontWeight: 700, color: NAVY, fontSize: '0.95rem', flex: 1 }}>
                      {group.label}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                      {group.members.length} kişi
                    </Typography>
                  </Box>

                  <Collapse in={!collapsed} timeout="auto" unmountOnExit>
                    {group.members.map((member, index) => (
                      <UserRow
                        key={member.userId}
                        member={member}
                        first={index === 0}
                        open={openUserId === member.userId}
                        onToggle={() => setOpenUserId(
                          (current) => (current === member.userId ? null : member.userId)
                        )}
                        allAccounts={allAccounts}
                        isAdmin={isAdmin}
                        canWrite={canWrite}
                        blocked={blocked}
                        mayChangeStatus={mayChangeStatus}
                        openDialog={openDialog}
                      />
                    ))}
                  </Collapse>
                </Paper>
              );
            })}
          </Box>
        )}

        {!loading && members.length > 0 && visibleMembers.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            “{quickFilter}” ile eşleşen kullanıcı yok.
          </Alert>
        )}

        {!loading && members.length === 0 && !error && (
          <Paper
            variant="outlined"
            sx={{ p: 5, textAlign: 'center', borderRadius: 3 }}
          >
            <PeopleIcon sx={{ fontSize: 42, color: NAVY, mb: 1 }} />
            <Typography sx={{ color: NAVY, fontWeight: 700 }}>
              {allAccounts
                ? 'Bu filtrelere uygun hesap bulunamadı.'
                : 'Bu kurulda üye yok.'}
            </Typography>
          </Paper>
        )}

        {allAccounts && !loading && !error && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
              mt: 3,
            }}
          >
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              Toplam {paging.total} hesap
            </Typography>

            <Pagination
              count={paging.totalPages}
              page={paging.page}
              disabled={navigationBlocked}
              sx={{
                '& .MuiPaginationItem-root': { color: NAVY, fontWeight: 700 },
                '& .MuiPaginationItem-root.Mui-selected': {
                  bgcolor: NAVY,
                  color: '#fff',
                  '&:hover': { bgcolor: NAVY },
                },
              }}
              onChange={(_, page) => {
                if (page === paging.page) return;

                setLoading(true);
                setFilters((current) => ({ ...current, page }));
              }}
            />
          </Box>
        )}
      </Container>

      {/* KULLANICI EKLE / DÜZENLE MODALI */}
      <Dialog
        open={formOpen}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
        aria-labelledby="user-dialog-title"
        slotProps={dialogPaper}
      >
        <Box component="form" onSubmit={handleSave}>
          <DialogTitle id="user-dialog-title" sx={dialogTitleSx}>
            {isEdit ? 'Kullanıcıyı Düzenle' : 'Yeni Kurul Üyesi Ekle'}
            <IconButton
              aria-label="Pencereyi kapat"
              disabled={busy}
              onClick={closeDialog}
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

            {!isEdit && (
              <Alert severity="info" sx={{ ...infoAlertSx, mt: 2, mb: 2 }}>
                Kurula yeni üye eklemek için aşağıdaki alanları doldurun. Kullanıcı belirlediğiniz parola ile sisteme giriş yapabilecektir.
              </Alert>
            )}

            {isEdit && !profileEditable && (
              <Alert severity="info" sx={{ ...infoAlertSx, mt: 2, mb: 2 }}>
                Burada yalnızca kurul rolünü değiştirebilirsiniz.
                Kişisel bilgiler için sistem yöneticisine başvurun.
              </Alert>
            )}

            <Box
              component="fieldset"
              disabled={busy}
              sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
            >
              {!isEdit ? (
                /* ================= MANUEL EKLEME MODU ================= */
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                    mt: 1,
                  }}
                >
                  <TextField
                    label="Ünvan"
                    size="small"
                    value={form.title}
                    onChange={setField('title')}
                    disabled={busy}
                    placeholder="Örn: Prof. Dr., Doç. Dr., vb."
                  />
                  <TextField
                    label="Ad Soyad"
                    size="small"
                    value={form.fullName}
                    onChange={setField('fullName')}
                    required
                    disabled={busy}
                    placeholder="Örn: Ahmet Yılmaz"
                  />
                  <TextField
                    label="E-posta"
                    size="small"
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((curr) => ({
                        ...curr,
                        email: val,
                        username: (!curr.username || curr.username === (curr.email.split('@')[0] || ''))
                          ? (val.split('@')[0] || '').toLowerCase()
                          : curr.username,
                      }));
                    }}
                    required
                    disabled={busy}
                    placeholder="Örn: ayilmaz@selcuk.edu.tr"
                  />
                  <TextField
                    label="Kullanıcı Adı"
                    size="small"
                    value={form.username}
                    onChange={setField('username')}
                    required
                    disabled={busy}
                    helperText="Sistem girişi için kullanılacak kullanıcı adı"
                  />
                  <TextField
                    label="Telefon / Dahili"
                    size="small"
                    value={form.phoneNumber}
                    onChange={setField('phoneNumber')}
                    disabled={busy}
                    placeholder="Örn: Dahili veya cep no"
                  />
                  <TextField
                    label="Yeni Hesap Parolası"
                    size="small"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={form.password}
                    onChange={setField('password')}
                    helperText="En az 8 karakter girin"
                    disabled={busy}
                  />
                  <FormControl
                    size="small"
                    required
                    disabled={busy}
                    sx={{ gridColumn: { xs: 'auto', sm: 'span 2' } }}
                  >
                    <InputLabel id="user-role-label">Kurul Rolü</InputLabel>
                    <Select
                      labelId="user-role-label"
                      value={form.roleId}
                      label="Kurul Rolü"
                      onChange={setField('roleId')}
                    >
                      {roles.map((role) => (
                        <MenuItem
                          key={role.id}
                          value={role.id}
                          disabled={!role.assignable}
                        >
                          {role.name}
                          {!role.assignable ? ' (atanamaz)' : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              ) : (
                /* ================= DÜZENLEME MODU (MEVCUT YAPI) ================= */
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                    mt: 1,
                  }}
                >
                {isEdit && (
  <TextField
    label="Kullanıcı adı"
    size="small"
    value={target?.username || ''}
    disabled
    fullWidth
  />
)}
                  <TextField
                    label="Ünvan"
                    size="small"
                    value={form.title}
                    onChange={setField('title')}
                    disabled={busy || !profileEditable}
                  />
                  <TextField
                    label="Ad Soyad"
                    size="small"
                    value={form.fullName}
                    onChange={setField('fullName')}
                    required={profileEditable}
                    disabled={busy || !profileEditable}
                  />
                 <TextField
  label="Telefon / Dahili"
  size="small"
  value={form.phoneNumber || ''}
  onChange={setField('phoneNumber')}
  disabled={busy || !profileEditable}
  placeholder="Dahili veya cep no"
/>
                  <TextField
                    label="E-posta"
                    size="small"
                    type="email"
                    value={form.email}
                    onChange={setField('email')}
                    required={profileEditable}
                    disabled={busy || !profileEditable}
                  />
                  <FormControl
                    size="small"
                    required
                    disabled={busy}
                    sx={{ gridColumn: { xs: 'auto', sm: 'span 2' } }}
                  >
                    <InputLabel id="user-role-edit-label">Rol</InputLabel>
                    <Select
                      labelId="user-role-edit-label"
                      value={form.roleId}
                      label="Rol"
                      onChange={setField('roleId')}
                    >
                      {roles.map((role) => (
                        <MenuItem
                          key={role.id}
                          value={role.id}
                          disabled={!role.assignable && role.id !== target?.roleId}
                        >
                          {role.name}
                          {!role.assignable && role.id !== target?.roleId ? ' (atanamaz)' : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}
            </Box>

            <Typography
              variant="caption"
              sx={{ color: '#64748b', display: 'block', mt: 2 }}
            >
              Rol değişikliği erişim yetkilerini etkiler. Mevcut kararların
              kayıtlı katılımcı, oy ve imza bilgileri değiştirilmez.
            </Typography>
          </DialogContent>

          <DialogActions
            sx={{
              p: 2.5,
              borderTop: `1px solid ${BORDER}`,
              justifyContent: 'space-between',
            }}
          >
            <Button
              disabled={busy}
              onClick={closeDialog}
              variant="outlined"
              sx={outlineButton}
            >
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              startIcon={<SaveIcon />}
              sx={primaryButton}
            >
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* PAROLA SIFIRLA */}
      <Dialog
        open={dialog?.type === 'password'}
        onClose={closeDialog}
        maxWidth="xs"
        fullWidth
        aria-labelledby="password-dialog-title"
        slotProps={dialogPaper}
      >
        <Box component="form" onSubmit={handlePassword}>
          <DialogTitle id="password-dialog-title" sx={dialogTitleSx}>
            Parola Sıfırla
            <IconButton
              aria-label="Pencereyi kapat"
              disabled={busy}
              onClick={closeDialog}
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

            <Typography
              variant="body2"
              sx={{ mt: 2, mb: 2, color: '#64748b', lineHeight: 1.7 }}
            >
              <strong>{target?.title} {target?.fullName}</strong> için yeni
              parola belirleyin. Yeni parolayı kullanıcıya ayrıca iletmeniz
              gerekir.
            </Typography>

            <Alert severity="info" sx={{ ...infoAlertSx, mb: 2 }}>
              Önceki oturumlar geçersiz kılınır. Kullanıcı yeni parolasıyla
              yeniden giriş yapmalıdır.
            </Alert>

            <TextField
              autoFocus
              required
              fullWidth
              size="small"
              type="password"
              autoComplete="new-password"
              label="Yeni parola"
              helperText="En az 8 karakter"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={busy}
            />
          </DialogContent>

          <DialogActions
            sx={{
              p: 2.5,
              borderTop: `1px solid ${BORDER}`,
              justifyContent: 'space-between',
            }}
          >
            <Button
              disabled={busy}
              onClick={closeDialog}
              variant="outlined"
              sx={outlineButton}
            >
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              startIcon={<VpnKeyIcon />}
              sx={primaryButton}
            >
              {busy ? 'Kaydediliyor…' : 'Sıfırla'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* ONAY PENCERELERİ: kuruldan çıkar, pasife al, aktifleştir, kalıcı sil */}
      <Dialog
        open={confirmationOpen}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
        aria-labelledby="confirm-dialog-title"
        slotProps={dialogPaper}
      >
        <Box component="form" onSubmit={handleConfirm}>
          <DialogTitle id="confirm-dialog-title" sx={lightDialogTitleSx}>
            {confirmationTitle}
          </DialogTitle>

          <DialogContent sx={{ pt: '20px !important' }}>
            {dialogError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {dialogError}
              </Alert>
            )}

            <Typography sx={{ color: NAVY, fontWeight: 700 }}>
              {target?.title} {target?.fullName} (@{target?.username})
            </Typography>

            <Alert
              severity={activating ? 'info' : 'warning'}
              sx={{ mt: 2 }}
            >
              {deleting
                ? 'Bu hesap ve kapatılmış kurul üyelikleri kalıcı silinecek. İşlem geri alınamaz. Geçmiş işlem kayıtları korunur. Sunucu, silme koşullarını yeniden kontrol eder.'
                : activating
                  ? 'Hesap yeniden açılır. Giriş için en az bir aktif kurul üyeliği de gerekir. Eski oturumlar tekrar geçerli olmaz. Kapatılmış kurul üyelikleri otomatik açılmaz.'
                  : deactivating
                    ? 'Kullanıcının tüm kurullara erişimi kapatılır. Açık oturumları sonraki yetkili sunucu isteğinde reddedilir.'
                    : `Yalnızca ${unitName} üyeliği kapatılır. Başka aktif kurul üyeliği varsa o kurula erişebilir. Hiç aktif üyeliği kalmazsa yeniden giriş yapamaz.`}
            </Alert>

            {deleting ? (
              <TextField
                autoFocus
                required
                fullWidth
                margin="normal"
                label="Silmek için kullanıcı adını yazın"
                helperText={`Aynen yazın: ${target?.username || ''}`}
                value={deleteUsername}
                onChange={(event) => setDeleteUsername(event.target.value)}
                disabled={busy}
                autoComplete="off"
              />
            ) : (
              <Typography variant="body2" sx={{ color: '#64748b', mt: 2 }}>
                Kullanıcı kaydı ve geçmiş kararlardaki oy ve imzalar silinmez.
              </Typography>
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
              disabled={busy}
              onClick={closeDialog}
              variant="outlined"
              sx={outlineButton}
            >
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant="contained"
              color={activating ? 'success' : 'error'}
              disabled={
                busy ||
                (deleting && deleteUsername.trim() !== target?.username)
              }
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              {busy
                ? 'İşleniyor…'
                : deleting
                  ? 'Kalıcı sil'
                  : activating
                    ? 'Hesabı aktifleştir'
                    : deactivating
                      ? 'Hesabı pasife al'
                      : 'Kuruldan çıkar'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') {
            setSnackbar((current) => ({ ...current, open: false }));
          }
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() =>
            setSnackbar((current) => ({ ...current, open: false }))
          }
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

// Tek kullanıcı satırı: ad ve kısa bilgi; sağda işlem düğmeleri; tıklayınca ayrıntılar.
function UserRow({
  member, first, open, onToggle, allAccounts, isAdmin, canWrite,
  blocked, mayChangeStatus, openDialog,
}) {
  const showEdit = !allAccounts && canWrite && member.canManage;
  const showReset = !allAccounts && canWrite && member.canResetPassword;
  const showRemove = !allAccounts && canWrite && member.canManage && !member.isSelf;
  const showStatus = mayChangeStatus(member) && typeof member.isActive === 'boolean';
  const showDelete =
    allAccounts && isAdmin && !member.isSelf && member.systemRole !== 'Admin';

  const inactive = member.isActive === false;
  const roleLabel = allAccounts
    ? (member.systemRole === 'Admin' ? 'Sistem yöneticisi' : 'Kullanıcı')
    : member.roleName;

  const action = (title, icon, onClick, { color = 'default', disabled = false } = {}) => (
    <Tooltip title={title}>
      <span>
        <IconButton
          size="small"
          color={color}
          aria-label={`${title}: ${member.fullName}`}
          disabled={blocked || disabled}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          sx={{ color: color === 'default' ? '#475569' : undefined }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );

  const detail = (label, value) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: '#1f2937', overflowWrap: 'anywhere' }}>
        {value || '—'}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ borderTop: first ? 0 : `1px solid ${BORDER}` }}>
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
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
          <Typography
            sx={{
              fontWeight: 600,
              color: inactive ? '#94a3b8' : '#1f2937',
              fontSize: '0.95rem',
              lineHeight: 1.4,
            }}
          >
            {member.title} {member.fullName}
            {member.isSelf && (
              <Box component="span" sx={{ color: '#64748b', fontWeight: 400 }}> (siz)</Box>
            )}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: '#64748b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {member.username}
            {member.email ? ` · ${member.email}` : ''}
          </Typography>
        </Box>

        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            gap: 1,
            flexShrink: 0,
          }}
        >
          {inactive && (
            <Typography variant="caption" sx={{ color: '#b91c1c', fontWeight: 600 }}>
              Pasif
            </Typography>
          )}
          <Typography variant="body2" sx={{ color: '#475569', minWidth: 120, textAlign: 'right' }}>
            {roleLabel}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexShrink: 0 }}>
          {showEdit && action('Düzenle', <EditIcon fontSize="small" />, () => openDialog('edit', member))}
          {showReset && action('Parola sıfırla', <VpnKeyIcon fontSize="small" />, () => openDialog('password', member))}
          {showStatus && action(
            member.isActive ? 'Hesabı pasife al' : 'Hesabı aktifleştir',
            member.isActive ? <BlockIcon fontSize="small" /> : <VerifiedIcon fontSize="small" />,
            () => openDialog(member.isActive ? 'deactivate' : 'activate', member),
            { color: member.isActive ? 'default' : 'success' }
          )}
          {showRemove && action('Kuruldan çıkar', <PersonRemoveIcon fontSize="small" />, () => openDialog('remove', member), { color: 'error' })}
          {showDelete && action('Hesabı sil', <DeleteIcon fontSize="small" />, () => openDialog('delete', member), {
            color: 'error',
            disabled: member.canDelete !== true,
          })}
        </Box>
      </Box>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box
          sx={{
            px: { xs: 2, md: 6.5 },
            py: 2,
            bgcolor: '#f8fafc',
            borderTop: `1px dashed ${BORDER}`,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0,1fr))', lg: 'repeat(4, minmax(0,1fr))' },
            gap: 2,
          }}
        >
          {detail('Kullanıcı adı', member.username)}
          {detail('E-posta', member.email)}
          {detail('Dahili / Telefon', member.phoneNumber)}
          {detail('Hesap durumu', typeof member.isActive === 'boolean'
            ? (member.isActive ? 'Aktif' : 'Pasif')
            : null)}
          {!allAccounts && detail('Kurul rolü', member.roleName)}
          {!allAccounts && detail(
            'Oy ve imza',
            member.isBoardMember && !inactive ? 'Oy kullanır, kararları imzalar' : 'Oy/imza rolü yok'
          )}

          {allAccounts && (
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.5 }}>
                Kurul üyelikleri
              </Typography>
              {member.systemRole === 'Admin' ? (
                <Typography variant="body2">Sistem yöneticisi tüm kurullara erişebilir.</Typography>
              ) : member.memberships?.length > 0 ? (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {member.memberships.map((membership) => (
                    <Typography component="li" variant="body2" key={membership.code}>
                      {membership.boardName}
                      <Box component="span" sx={{ color: '#64748b' }}> · {membership.duty}</Box>
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: '#b45309' }}>
                  Aktif kurul üyeliği yok; giriş için aktif hesap ve kurul üyeliği gerekir.
                </Typography>
              )}
              {!member.isSelf && member.systemRole !== 'Admin' && member.deleteBlockedReason && (
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 1 }}>
                  Silinememe nedeni: {member.deleteBlockedReason}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
