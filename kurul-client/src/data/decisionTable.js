// Karar tablosu yardımcıları. Sütun genişliği yüzde olarak `width` alanında tutulur;
// sunucu PDF'i de aynı oranla basar (DecisionPdfRenderer).

export const MAX_TABLE_COLUMNS = 10;

export const newColumnKey = () =>
  `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const round = (n) => Math.round(n * 10) / 10;

// Genişliği olmayan sütunlar (eski şablonlar) diğerlerinin ortalamasını alır; toplam 100'e ölçeklenir.
export function columnWidths(columns) {
  const raw = columns.map((c) => (Number(c.width) > 0 ? Number(c.width) : null));
  const known = raw.filter((w) => w !== null);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const filled = raw.map((w) => w ?? fallback);
  const total = filled.reduce((a, b) => a + b, 0) || 1;
  return filled.map((w) => (w / total) * 100);
}

export const withWidths = (columns, widths) =>
  columns.map((c, i) => ({ ...c, width: round(widths[i]) }));

// Sütunları eşit genişliğe getirir.
export const equalize = (columns) =>
  withWidths(columns, columns.map(() => 100 / Math.max(columns.length, 1)));

export function createTable() {
  const columns = equalize([
    { key: newColumnKey(), label: 'Sütun 1' },
    { key: newColumnKey(), label: 'Sütun 2' },
  ]);
  return { columns, rows: [Object.fromEntries(columns.map((c) => [c.key, '']))] };
}
