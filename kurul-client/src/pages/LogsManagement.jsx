import React, {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  Alert,
  LinearProgress,
} from '@mui/material';

import AssignmentIcon from '@mui/icons-material/Assignment';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';

import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api/client';
import { getUnitDisplayName } from '../data/templateData';
import {
  NAVY,
  YELLOW,
  PALE_YELLOW,
  BORDER,
  primaryButton,
  outlineButton,
  infoAlertSx,
} from '../styles/adminTheme';

const LEVEL_STYLE = {
  info: { bgcolor: '#e8edf4', color: NAVY },
  warn: { bgcolor: '#fff3cd', color: '#7a5600' },
  error: { bgcolor: '#fde2e2', color: '#b42318' },
};

const EMPTY_FILTERS = {
  unitCode: 'all',
  level: '',
  username: '',
  from: '',
  to: '',
};

function formatTime(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('tr-TR');
}

export default function LogsManagement() {
  const { token, unit } = useAuth();

  return (
    <LogsContent
      key={`${unit?.code || ''}:${token || ''}`}
    />
  );
}

function LogsContent() {
  const navigate = useNavigate();
  const { unit, units, isAdmin } = useAuth();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [live, setLive] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const snapshot = useRef(null);

  const changeFilter = (field, value) => {
    snapshot.current = null;
    setPage(0);
    setFilters((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    snapshot.current = null;
    setPage(0);
    setFilters({ ...EMPTY_FILTERS });
  };

  const reload = () => {
    snapshot.current = null;
    setPage(0);
    setRefresh((value) => value + 1);
  };

  useEffect(() => {
    let cancelled = false;
    let timer;
    let controller;

    setLoading(true);
    setError('');
    setLogs([]);

    const invalidRange =
      filters.from &&
      filters.to &&
      filters.from > filters.to;

    if (invalidRange) {
      setTotal(0);
      setLoading(false);
      setError(
        'Başlangıç tarihi bitiş tarihinden sonra olamaz.'
      );

      return undefined;
    }

    async function load() {
      controller = new AbortController();

      const query = new URLSearchParams({
        page: String(page + 1),
        pageSize: String(pageSize),
        tz: String(-new Date().getTimezoneOffset()),
      });

      if (isAdmin) {
        query.set('unit', filters.unitCode);
      }

      if (filters.level) {
        query.set('level', filters.level);
      }

      if (filters.username.trim()) {
        query.set('user', filters.username.trim());
      }

      if (filters.from) {
        query.set('from', filters.from);
      }

      if (filters.to) {
        query.set('to', filters.to);
      }

      // Canlı ilk sayfa yeni kayıtları da alır.
      // Geçmiş sayfalarda önceki liste sınırı korunur.
      if (
        snapshot.current !== null &&
        !(live && page === 0)
      ) {
        query.set('snapshotId', snapshot.current);
      }

      try {
        const data = await apiFetch(
          `/api/logs?${query.toString()}`,
          { signal: controller.signal }
        );

        if (cancelled) return;

        if (
          !data ||
          !Array.isArray(data.items) ||
          !Number.isInteger(data.total) ||
          data.total < 0 ||
          !Number.isInteger(data.page) ||
          data.page < 1 ||
          typeof data.snapshotId !== 'string' ||
          !/^\d+$/.test(data.snapshotId)
        ) {
          throw new Error(
            'Sunucudan geçerli log sayfası alınamadı.'
          );
        }

        snapshot.current = data.snapshotId;

        setLogs(data.items);
        setTotal(data.total);
        setError('');

        if (data.page - 1 !== page) {
          setPage(data.page - 1);
        }
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;

        setError(
          err.message || 'Log kayıtları yüklenemedi.'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);

          // Önceki istek tamamlanmadan yenisi başlamaz.
          if (live && page === 0) {
            timer = window.setTimeout(load, 3000);
          }
        }
      }
    }

    // Arama alanında her tuş için istek göndermeyelim.
    timer = window.setTimeout(load, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [filters, page, pageSize, live, refresh, isAdmin]);

  const handlePageChange = (_, nextPage) => {
    setPage(nextPage);
  };

  const handlePageSizeChange = (event) => {
    setPage(0);
    setPageSize(Number(event.target.value));
  };

  const hasFilters =
    filters.level !== '' ||
    filters.username !== '' ||
    filters.from !== '' ||
    filters.to !== '' ||
    (isAdmin && filters.unitCode !== 'all');

  const headCell = {
    color: NAVY,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6fa' }}>
      <Header
        title="Log Kayıtları"
        onBackClick={() => navigate(-1)}
        backText="GERİ DÖN"
      />

      <Container
        maxWidth="xl"
        sx={{ py: { xs: 2, md: 4 } }}
      >
        {/* SAYFA BAŞLIĞI */}
        <Paper
          elevation={0}
          sx={{
            bgcolor: NAVY,
            color: 'white',
            borderRadius: 3,
            borderBottom: `5px solid ${YELLOW}`,
            p: { xs: 2.5, md: 3.5 },
            mb: 3,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Box
              sx={{
                width: 54,
                height: 54,
                borderRadius: 2,
                bgcolor: 'rgba(255,193,7,0.13)',
                color: YELLOW,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <AssignmentIcon sx={{ fontSize: 30 }} />
            </Box>

            <Box>
              <Typography
                variant="overline"
                sx={{ color: YELLOW, fontWeight: 800 }}
              >
                SİSTEM YÖNETİMİ
              </Typography>

              <Typography
                component="h1"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '1.5rem', md: '1.9rem' },
                }}
              >
                Log Kayıtları
              </Typography>
            </Box>
          </Box>

          <Typography
            variant="body2"
            sx={{ color: '#d5dfeb', mt: 2, lineHeight: 1.8 }}
          >
            Giriş, karar, oylama, imza ve yönetim işlemlerinin
            kayıtlarını buradan izleyebilirsiniz.
          </Typography>
        </Paper>

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
              {isAdmin ? (
                <FormControl fullWidth size="small">
                  <InputLabel id="logs-unit-label">
                    Görüntülenecek kayıtlar
                  </InputLabel>

                  <Select
                    labelId="logs-unit-label"
                    value={filters.unitCode}
                    label="Görüntülenecek kayıtlar"
                    onChange={(event) =>
                      changeFilter(
                        'unitCode',
                        event.target.value
                      )
                    }
                    sx={{
                      color: NAVY,
                      fontWeight: 700,
                      '& .MuiSelect-select': {
                        whiteSpace: 'normal',
                        lineHeight: 1.6,
                        pr: '36px !important',
                      },
                    }}
                  >
                    <MenuItem
                      value="all"
                      sx={{
                        whiteSpace: 'normal',
                        lineHeight: 1.6,
                        py: 1.5,
                        fontSize: '0.85rem',
                      }}
                    >
                      Tüm kurullar ve giriş kayıtları
                    </MenuItem>

                    {units.map((item) => (
                      <MenuItem
                        key={item.code}
                        value={item.code}
                        sx={{
                          whiteSpace: 'normal',
                          lineHeight: 1.6,
                          py: 1.5,
                          fontSize: '0.85rem',
                        }}
                      >
                        {getUnitDisplayName(item)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <>
                  <Typography
                    variant="caption"
                    sx={{ color: '#64748b', fontWeight: 800 }}
                  >
                    SEÇİLİ KURUL
                  </Typography>
                  <Typography
                    sx={{
                      color: NAVY,
                      fontWeight: 700,
                      lineHeight: 1.6,
                    }}
                  >
                    {unit ? getUnitDisplayName(unit) : ''}
                  </Typography>
                </>
              )}
            </Box>

            <Chip
              label={loading ? 'Yükleniyor…' : `${total} kayıt`}
              sx={{
                bgcolor: PALE_YELLOW,
                color: NAVY,
                fontWeight: 800,
              }}
            />
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* FİLTRELER */}
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
              gap: 2,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant={live ? 'contained' : 'outlined'}
              aria-pressed={live}
              onClick={() => setLive((value) => !value)}
              startIcon={
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    bgcolor: live ? '#16a34a' : '#94a3b8',
                  }}
                />
              }
              sx={live ? primaryButton : outlineButton}
            >
              {live ? 'Canlı akış açık' : 'Canlı akış kapalı'}
            </Button>

            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="logs-level-label">Seviye</InputLabel>

              <Select
                labelId="logs-level-label"
                value={filters.level}
                label="Seviye"
                onChange={(event) =>
                  changeFilter('level', event.target.value)
                }
              >
                <MenuItem value="">Tümü</MenuItem>
                <MenuItem value="info">INFO</MenuItem>
                <MenuItem value="warn">WARN</MenuItem>
                <MenuItem value="error">ERROR</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              type="date"
              label="Başlangıç"
              slotProps={{
                inputLabel: { shrink: true },
              }}
              value={filters.from}
              onChange={(event) =>
                changeFilter('from', event.target.value)
              }
            />

            <TextField
              size="small"
              type="date"
              label="Bitiş"
              slotProps={{
                inputLabel: { shrink: true },
              }}
              value={filters.to}
              onChange={(event) =>
                changeFilter('to', event.target.value)
              }
            />

            <TextField
              size="small"
              label="Kullanıcı"
              placeholder="Kullanıcı adı ara…"
              value={filters.username}
              slotProps={{
                htmlInput: { maxLength: 100 },
              }}
              onChange={(event) =>
                changeFilter(
                  'username',
                  event.target.value
                )
              }
              sx={{ flexGrow: 1, minWidth: 200 }}
            />

            <Button
              variant="outlined"
              startIcon={<FilterAltOffIcon />}
              disabled={!hasFilters}
              onClick={clearFilters}
              sx={outlineButton}
            >
              Filtreleri Temizle
            </Button>

            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              disabled={loading}
              onClick={reload}
              sx={outlineButton}
            >
              Yenile
            </Button>
          </Box>
        </Paper>

        {live && page > 0 && (
          <Alert severity="info" sx={{ ...infoAlertSx, mb: 3 }}>
            Geçmiş kayıtları incelerken canlı yenileme
            duraklatılır. İlk sayfaya dönünce devam eder.
          </Alert>
        )}

        {loading && (
          <Box role="status" sx={{ mb: 2 }}>
            <LinearProgress
              sx={{
                borderRadius: 2,
                bgcolor: '#fff0b3',
                '& .MuiLinearProgress-bar': { bgcolor: NAVY },
              }}
            />
            <Typography
              variant="body2"
              sx={{ mt: 1, color: '#64748b' }}
            >
              Kayıtlar yükleniyor…
            </Typography>
          </Box>
        )}

        {/* LOG TABLOSU */}
        <Paper
          elevation={0}
          sx={{
            border: `1px solid ${BORDER}`,
            borderTop: `4px solid ${YELLOW}`,
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,31,63,0.04)',
          }}
        >
          <TableContainer>
            <Table size="small" sx={{ minWidth: 760 }}>
              <TableHead sx={{ bgcolor: PALE_YELLOW }}>
                <TableRow>
                  <TableCell sx={headCell}>Seviye</TableCell>
                  <TableCell sx={headCell}>Zaman</TableCell>

                  {isAdmin && (
                    <TableCell sx={headCell}>Kurul</TableCell>
                  )}

                  <TableCell sx={headCell}>İşlem</TableCell>
                  <TableCell sx={headCell}>Ayrıntı</TableCell>
                  <TableCell sx={headCell}>Kullanıcı</TableCell>
                  <TableCell sx={headCell}>IP</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell>
                      <Chip
                        label={String(log.level || '').toUpperCase()}
                        size="small"
                        sx={{
                          ...(LEVEL_STYLE[log.level] ||
                            LEVEL_STYLE.info),
                          fontWeight: 800,
                          fontSize: '0.7rem',
                        }}
                      />
                    </TableCell>

                    <TableCell
                      sx={{
                        fontSize: '0.85rem',
                        color: '#64748b',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatTime(log.time)}
                    </TableCell>

                    {isAdmin && (
                      <TableCell
                        sx={{
                          fontSize: '0.8rem',
                          color: '#64748b',
                        }}
                      >
                        {log.unitName || '—'}
                      </TableCell>
                    )}

                    <TableCell
                      sx={{
                        fontSize: '0.85rem',
                        color: NAVY,
                        fontWeight: 600,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {log.message}
                    </TableCell>

                    <TableCell
                      sx={{
                        fontSize: '0.8rem',
                        color: '#64748b',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {log.detail || ''}
                    </TableCell>

                    <TableCell sx={{ color: '#334155' }}>
                      {log.username || '—'}
                    </TableCell>

                    <TableCell
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        color: '#64748b',
                      }}
                    >
                      {log.ip || ''}
                    </TableCell>
                  </TableRow>
                ))}

                {logs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={isAdmin ? 7 : 6}
                      align="center"
                      sx={{ py: 5, color: '#64748b' }}
                    >
                      {loading ? (
                        'Yükleniyor…'
                      ) : error ? (
                        'Kayıtlar gösterilemiyor.'
                      ) : (
                        <>
                          <AssignmentIcon
                            sx={{
                              display: 'block',
                              mx: 'auto',
                              mb: 1,
                              fontSize: 38,
                              color: NAVY,
                            }}
                          />
                          <Typography
                            sx={{ color: NAVY, fontWeight: 700 }}
                          >
                            Filtrelere uygun log kaydı bulunamadı.
                          </Typography>
                        </>
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
            page={page}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[10, 25, 50, 100]}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handlePageSizeChange}
            labelRowsPerPage="Sayfa başına:"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}–${to} / ${count}`
            }
            getItemAriaLabel={(type) =>
              type === 'next'
                ? 'Sonraki sayfa'
                : type === 'previous'
                  ? 'Önceki sayfa'
                  : type === 'first'
                    ? 'İlk sayfa'
                    : 'Son sayfa'
            }
            sx={{
              borderTop: `1px solid ${BORDER}`,
              color: NAVY,
              '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows':
                { fontWeight: 600 },
            }}
          />
        </Paper>

        <Typography
          variant="caption"
          sx={{
            color: '#64748b',
            display: 'block',
            mt: 1.5,
          }}
        >
          Tarihler tarayıcınızın yerel saatine göre gösterilir.
          Yeni kayıtları almak için Yenile düğmesini veya
          ilk sayfada canlı modu kullanabilirsiniz.
        </Typography>
      </Container>
    </Box>
  );
}
