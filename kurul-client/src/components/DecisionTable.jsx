import React, { useRef, useState } from 'react';
import {
  Box, Typography, Button, IconButton, TextField, Menu, MenuItem, ListItemIcon, ListItemText,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import {
  MAX_TABLE_COLUMNS, columnWidths, equalize, newColumnKey, withWidths,
} from '../data/decisionTable';

// Kararın içindeki tablo (öğrenci / danışman vb.). Sütunlar şablondan gelir veya burada
// oluşturulur. Her sütunun genişliği yüzde olarak tutulur ve PDF'de aynı oranla basılır.
// setColumns verilmezse sütunlar sabittir, yalnızca satırlar düzenlenir.

const MIN_WIDTH = 6;
const SIDE = 44;

export default function DecisionTable({ columns, setColumns, rows, setRows, onRemove, disabled = false }) {
  const editableColumns = Boolean(setColumns) && !disabled;
  const widths = columnWidths(columns);
  const gridRef = useRef(null);
  const [columnMenu, setColumnMenu] = useState(null);
  const [rowMenu, setRowMenu] = useState(null);

  const emptyRow = () => Object.fromEntries(columns.map((c) => [c.key, '']));

  const addRow = (at = rows.length) =>
    setRows((prev) => [...prev.slice(0, at), emptyRow(), ...prev.slice(at)]);
  const removeRow = (index) => setRows((prev) => prev.filter((_, i) => i !== index));
  const moveRow = (index, dir) =>
    setRows((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const updateCell = (index, key, value) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));

  const renameColumn = (index, label) =>
    setColumns(columns.map((c, i) => (i === index ? { ...c, label } : c)));

  const addColumn = (at = columns.length) => {
    if (columns.length >= MAX_TABLE_COLUMNS) return;
    const column = { key: newColumnKey(), label: `Sütun ${columns.length + 1}` };
    setColumns(equalize([...columns.slice(0, at), column, ...columns.slice(at)]));
    setRows((prev) => prev.map((r) => ({ ...r, [column.key]: '' })));
  };

  const removeColumn = (index) => {
    const { key } = columns[index];
    const rest = columns.filter((_, i) => i !== index);
    if (rest.length === 0) {
      onRemove?.();
      return;
    }
    // Silinen sütunun payı kalanlara oranlı dağıtılır.
    setColumns(withWidths(rest, columnWidths(rest)));
    setRows((prev) => prev.map((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    }));
  };

  const moveColumn = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= columns.length) return;
    const next = withWidths(columns, widths);
    [next[index], next[target]] = [next[target], next[index]];
    setColumns(next);
  };

  // Başlıklar arasındaki tutamak sürüklenince yalnızca iki komşu sütunun payı değişir.
  const startResize = (index, event) => {
    if (!editableColumns) return;
    event.preventDefault();
    const area = (gridRef.current?.getBoundingClientRect().width || 1) - SIDE * 2;
    const startX = event.clientX;
    const left = widths[index];
    const right = widths[index + 1];
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);

    const onMove = (e) => {
      const delta = ((e.clientX - startX) / area) * 100;
      const nextLeft = Math.min(Math.max(left + delta, MIN_WIDTH), left + right - MIN_WIDTH);
      const next = [...widths];
      next[index] = nextLeft;
      next[index + 1] = left + right - nextLeft;
      setColumns(withWidths(columns, next));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const template = `${SIDE}px ${widths.map((w) => `minmax(0, ${w}fr)`).join(' ')} ${SIDE}px`;
  const cellSx = { borderBottom: '1px solid #e2e8f0', px: 1, py: 0.75, minWidth: 0 };

  return (
    <Box sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: '#ffffff' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#1b4a94' }}>
          Karar Tablosu ({columns.length} sütun · {rows.length} satır)
        </Typography>
        {!disabled && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {editableColumns && (
              <Button size="small" variant="outlined" startIcon={<ViewColumnIcon />}
                onClick={() => addColumn()} disabled={columns.length >= MAX_TABLE_COLUMNS}
                sx={{ textTransform: 'none', color: '#1b4a94', borderColor: '#1b4a94' }}>
                Sütun Ekle
              </Button>
            )}
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => addRow()}
              sx={{ textTransform: 'none', bgcolor: '#1b4a94', '&:hover': { bgcolor: '#0f1f4f' } }}>
              Satır Ekle
            </Button>
            {editableColumns && onRemove && (
              <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={onRemove}
                sx={{ textTransform: 'none' }}>
                Tabloyu Kaldır
              </Button>
            )}
          </Box>
        )}
      </Box>

      {editableColumns && (
        <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 1.5 }}>
          Sütun başlığına tıklayıp adını değiştirin. Genişliği ayarlamak için başlıklar arasındaki
          çizgiyi sürükleyin; PDF'de de aynı oran kullanılır. En fazla {MAX_TABLE_COLUMNS} sütun eklenebilir.
        </Typography>
      )}

      <Box sx={{ overflowX: 'auto' }}>
        <Box ref={gridRef} role="table" aria-label="Karar tablosu"
          sx={{ display: 'grid', gridTemplateColumns: template, minWidth: columns.length * 150 + SIDE * 2 }}>
          {/* Başlık satırı */}
          <Box role="columnheader" sx={{ ...cellSx, bgcolor: '#f1f5f9', fontWeight: 700, display: 'flex', alignItems: 'center' }}>#</Box>
          {columns.map((c, i) => (
            <Box key={c.key} role="columnheader"
              sx={{ ...cellSx, bgcolor: '#f1f5f9', position: 'relative', display: 'flex', alignItems: 'center', gap: 0.25 }}>
              {editableColumns ? (
                <>
                  <TextField variant="standard" fullWidth value={c.label}
                    onChange={(e) => renameColumn(i, e.target.value)}
                    placeholder="Sütun başlığı"
                    slotProps={{ htmlInput: { 'aria-label': `${i + 1}. sütun başlığı`, maxLength: 80 }, input: { disableUnderline: true, sx: { fontWeight: 700, fontSize: '0.88rem' } } }} />
                  <IconButton size="small" aria-label={`${c.label || i + 1} sütunu seçenekleri`}
                    onClick={(e) => setColumnMenu({ anchor: e.currentTarget, index: i })}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </>
              ) : (
                <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>{c.label}</Typography>
              )}
              {editableColumns && i < columns.length - 1 && (
                <Box
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Sütun genişliğini ayarla"
                  onPointerDown={(e) => startResize(i, e)}
                  sx={{
                    position: 'absolute', top: 4, bottom: 4, right: -5, width: 10, zIndex: 1,
                    cursor: 'col-resize', touchAction: 'none',
                    '&::after': { content: '""', position: 'absolute', left: 4, top: 0, bottom: 0, width: 2, bgcolor: '#cbd5e1', borderRadius: 1 },
                    '&:hover::after': { bgcolor: '#1b4a94' },
                  }}
                />
              )}
            </Box>
          ))}
          <Box sx={{ ...cellSx, bgcolor: '#f1f5f9' }} />

          {/* Veri satırları */}
          {rows.map((row, ri) => (
            <React.Fragment key={ri}>
              <Box role="cell" sx={{ ...cellSx, color: '#64748b', pt: 1.5 }}>{ri + 1}</Box>
              {columns.map((c) => (
                <Box key={c.key} role="cell" sx={cellSx}>
                  <TextField size="small" fullWidth multiline maxRows={8} disabled={disabled}
                    value={row[c.key] ?? ''}
                    onChange={(e) => updateCell(ri, c.key, e.target.value)}
                    slotProps={{ htmlInput: { 'aria-label': `${ri + 1}. satır, ${c.label}` } }} />
                </Box>
              ))}
              <Box sx={{ ...cellSx, px: 0, pt: 1 }}>
                {!disabled && (
                  <IconButton size="small" aria-label={`${ri + 1}. satır seçenekleri`}
                    onClick={(e) => setRowMenu({ anchor: e.currentTarget, index: ri })}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </React.Fragment>
          ))}
        </Box>
      </Box>

      {rows.length === 0 && (
        <Typography variant="body2" sx={{ color: '#94a3b8', py: 2, textAlign: 'center' }}>
          Henüz satır yok. "Satır Ekle" ile başlayın.
        </Typography>
      )}

      <Menu anchorEl={columnMenu?.anchor} open={Boolean(columnMenu)} onClose={() => setColumnMenu(null)}>
        {columnMenu && [
          <MenuItem key="l" disabled={columnMenu.index === 0}
            onClick={() => { moveColumn(columnMenu.index, -1); setColumnMenu(null); }}>
            <ListItemIcon><ArrowBackIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Sola taşı</ListItemText>
          </MenuItem>,
          <MenuItem key="r" disabled={columnMenu.index === columns.length - 1}
            onClick={() => { moveColumn(columnMenu.index, 1); setColumnMenu(null); }}>
            <ListItemIcon><ArrowForwardIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Sağa taşı</ListItemText>
          </MenuItem>,
          <MenuItem key="a" disabled={columns.length >= MAX_TABLE_COLUMNS}
            onClick={() => { addColumn(columnMenu.index + 1); setColumnMenu(null); }}>
            <ListItemIcon><ViewColumnIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Sağına sütun ekle</ListItemText>
          </MenuItem>,
          <MenuItem key="e"
            onClick={() => { setColumns(equalize(columns)); setColumnMenu(null); }}>
            <ListItemIcon><ViewColumnIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Tüm sütunları eşit genişlik yap</ListItemText>
          </MenuItem>,
          <MenuItem key="d" sx={{ color: '#d32f2f' }}
            onClick={() => { removeColumn(columnMenu.index); setColumnMenu(null); }}>
            <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: '#d32f2f' }} /></ListItemIcon>
            <ListItemText>Sütunu sil</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <Menu anchorEl={rowMenu?.anchor} open={Boolean(rowMenu)} onClose={() => setRowMenu(null)}>
        {rowMenu && [
          <MenuItem key="ab" onClick={() => { addRow(rowMenu.index); setRowMenu(null); }}>
            <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Üstüne satır ekle</ListItemText>
          </MenuItem>,
          <MenuItem key="be" onClick={() => { addRow(rowMenu.index + 1); setRowMenu(null); }}>
            <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Altına satır ekle</ListItemText>
          </MenuItem>,
          <MenuItem key="u" disabled={rowMenu.index === 0}
            onClick={() => { moveRow(rowMenu.index, -1); setRowMenu(null); }}>
            <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Yukarı taşı</ListItemText>
          </MenuItem>,
          <MenuItem key="d" disabled={rowMenu.index === rows.length - 1}
            onClick={() => { moveRow(rowMenu.index, 1); setRowMenu(null); }}>
            <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Aşağı taşı</ListItemText>
          </MenuItem>,
          <MenuItem key="x" sx={{ color: '#d32f2f' }}
            onClick={() => { removeRow(rowMenu.index); setRowMenu(null); }}>
            <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: '#d32f2f' }} /></ListItemIcon>
            <ListItemText>Satırı sil</ListItemText>
          </MenuItem>,
        ]}
      </Menu>
    </Box>
  );
}
