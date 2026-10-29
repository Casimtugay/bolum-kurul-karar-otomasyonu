import React, { useState } from 'react';
import {
  Box, Typography, Button, IconButton, TextField,
  Table, TableHead, TableBody, TableRow, TableCell, Collapse
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

// Kararın içindeki tablo (öğrenci / danışman vb.). Sütunlar şablondan gelir.
export default function DecisionTable({ columns, rows, setRows }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const emptyRow = () => Object.fromEntries(columns.map((c) => [c.key, '']));

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (index) => setRows((prev) => prev.filter((_, i) => i !== index));
  const updateCell = (index, key, value) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));

  // Excel'den kopyalanan satırları ekler (hücreler TAB ile ayrılır, sütun sırası tabloyla aynı olmalı)
  const handlePaste = () => {
    const newRows = pasteText
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const cells = line.split('\t');
        return Object.fromEntries(columns.map((c, i) => [c.key, (cells[i] || '').trim()]));
      });
    setRows((prev) => [...prev, ...newRows]);
    setPasteText('');
    setPasteOpen(false);
  };

  return (
    <Box sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: '8px', bgcolor: '#ffffff' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#1b4a94' }}>
          Karar Tablosu ({rows.length} satır)
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<ContentPasteIcon />}
            onClick={() => setPasteOpen((o) => !o)}
            sx={{ textTransform: 'none', color: '#1b4a94', borderColor: '#1b4a94' }}>
            Excel'den Yapıştır
          </Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={addRow}
            sx={{ textTransform: 'none', bgcolor: '#1b4a94', '&:hover': { bgcolor: '#0f1f4f' } }}>
            Satır Ekle
          </Button>
        </Box>
      </Box>

      <Collapse in={pasteOpen}>
        <Box sx={{ mb: 2, p: 2, bgcolor: '#f8fafc', borderRadius: '6px' }}>
          <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 1 }}>
            Excel'de şu sütunları bu sırayla seçip kopyalayın: {columns.map((c) => c.label).join(' | ')}
          </Typography>
          <TextField fullWidth multiline rows={5} value={pasteText}
            onChange={(e) => setPasteText(e.target.value)} placeholder="Buraya yapıştırın (Ctrl+V / Cmd+V)" />
          <Button size="small" variant="contained" sx={{ mt: 1, bgcolor: '#1b4a94' }}
            onClick={handlePaste} disabled={!pasteText.trim()}>
            Satırları Ekle
          </Button>
        </Box>
      </Collapse>

      {rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: '#94a3b8', py: 2, textAlign: 'center' }}>
          Henüz satır yok. "Satır Ekle" veya "Excel'den Yapıştır" kullanın.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f1f5f9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: 40 }}>#</TableCell>
                {columns.map((c) => (
                  <TableCell key={c.key} sx={{ fontWeight: 'bold' }}>{c.label}</TableCell>
                ))}
                <TableCell sx={{ width: 40 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{i + 1}</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <TextField variant="standard" fullWidth value={row[c.key] ?? ''}
                        onChange={(e) => updateCell(i, c.key, e.target.value)} />
                    </TableCell>
                  ))}
                  <TableCell>
                    <IconButton size="small" onClick={() => removeRow(i)}>
                      <DeleteIcon fontSize="small" sx={{ color: '#d32f2f' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}