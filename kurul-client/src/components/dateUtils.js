
export const parseDate = (value) => {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

export const formatDate = (value) => {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';
};

export const formatLongDate = (value) => {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
      })
    : '';
};

export const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
};

export const isUpcoming = (value) => {
  const date = parseDate(value);
  if (!date) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date >= today;
};

export const meetingLabel = (item) =>
  `${item.meetingYear || new Date().getFullYear()}/${item.meetingNo || item.meetingNumber || ''}. Toplantı`;