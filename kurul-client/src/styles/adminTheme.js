// Yönetim sayfalarının (Roller, Kullanıcılar) ortak görünümü.
// Renkleri ve düğme stillerini tek yerden değiştirmek için.
// Selçuk Üniversitesi web sitesiyle uyumlu palet (theme.js ile aynı renkler).

export const NAVY = '#0f1f4f';
export const BLUE = '#1b4a94';
export const TITLE = '#27385a';
export const SOFT = '#e3eefb';
export const YELLOW = '#fcc419';
export const PALE_YELLOW = SOFT; // eski ad korunuyor, artık açık mavi
export const BORDER = '#dfe5ed';

export const primaryButton = {
  bgcolor: YELLOW,
  color: NAVY,
  fontWeight: 800,
  textTransform: 'none',
  borderRadius: 2,
  boxShadow: 'none',
  '&:hover': {
    bgcolor: '#f0b400',
    boxShadow: 'none',
  },
};

export const outlineButton = {
  color: BLUE,
  borderColor: '#b9c9e0',
  textTransform: 'none',
  fontWeight: 700,
  borderRadius: 2,
  '&:hover': {
    bgcolor: SOFT,
    borderColor: BLUE,
  },
};

export const checkboxStyle = {
  color: '#94a3b8',
  '&.Mui-checked': { color: BLUE },
  '&.MuiCheckbox-indeterminate': { color: BLUE },
};

// Üstteki lacivert şeritte devre dışı kalan sarı düğme okunaklı kalsın
export const bannerButtonDisabled = {
  '&.Mui-disabled': {
    bgcolor: '#3a4f85',
    color: '#d4dce5',
  },
};

// Bilgilendirme kutuları
export const infoAlertSx = {
  bgcolor: SOFT,
  color: TITLE,
  borderRadius: 2,
  '& .MuiAlert-icon': { color: BLUE },
};