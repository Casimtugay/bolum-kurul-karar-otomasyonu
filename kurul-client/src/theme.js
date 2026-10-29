import { createTheme } from '@mui/material/styles';

// Montserrat'ı yalnızca temalı sayfalar için yükle (Login etkilenmesin diye index.css'e eklenmedi).
if (typeof document !== 'undefined' && !document.getElementById('montserrat-font')) {
  const link = document.createElement('link');
  link.id = 'montserrat-font';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
}

const BLUE = '#1b4a94';
const NAVY = '#0f1f4f';
const SOFT = '#e3eefb';
const TITLE = '#27385a';
const YELLOW = '#fcc419';

// Gölgeler yumuşak tutulur: kartlar neredeyse düz, menü ve pencereler hafif belirgin.
// 800 kalınlık yüklenmez; sayfalardaki 800'ler 700 olarak görünür (daha sakin başlıklar).
const SOFT_SHADOW = '0 1px 2px rgba(15,31,79,0.06), 0 1px 3px rgba(15,31,79,0.04)';
const FLOAT_SHADOW = '0 6px 20px rgba(15,31,79,0.12)';
const shadows = ['none', ...Array.from({ length: 24 }, (_, i) => (i < 4 ? SOFT_SHADOW : FLOAT_SHADOW))];

// Selçuk Üniversitesi web sitesiyle uyumlu tema. Login hariç tüm sayfalara uygulanır.
const theme = createTheme({
  shadows,
  palette: {
    primary: { main: BLUE, dark: NAVY, light: SOFT, contrastText: '#fff' },
    secondary: { main: YELLOW, contrastText: NAVY },
    background: { default: '#f5f6f8', paper: '#ffffff' },
    text: { primary: '#1f2a44', secondary: '#4b5563' },
    divider: '#e2e6ec',
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: "'Montserrat', 'Segoe UI', Helvetica, Arial, sans-serif",
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.55 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 6, boxShadow: 'none' },
        contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
      },
    },
    MuiPaper: {
      styleOverrides: { rounded: { borderRadius: 8 } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 10 } },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontWeight: 700 } },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, color: TITLE, backgroundColor: '#f1f4f8' },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 500 } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 5 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BLUE },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { '&.Mui-focused': { color: BLUE } } },
    },
  },
});

export default theme;
