import React, { useState, useEffect } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  InputBase,
  Chip,
  Fade,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CampaignIcon from '@mui/icons-material/Campaign';
import GavelIcon from '@mui/icons-material/Gavel';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import ArchiveIcon from '@mui/icons-material/Archive';
import PeopleIcon from '@mui/icons-material/People';
import SecurityIcon from '@mui/icons-material/Security';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// App.jsx içindeki tanımlı rotalarla birebir eşleştirilmiş modüller (yalnızca yetkili olunanlar gösterilir)
const QUICK_LINKS = [
  { title: 'Toplantı Duyuruları', path: '/duyurular', icon: CampaignIcon, need: ['oylama', 'read'] },
  { title: 'Kurul Kararları', path: '/dashboard', icon: GavelIcon, need: ['oylama', 'read'] },
  { title: 'Yeni Karar Hazırla', path: '/yeni-karar', icon: AddCircleIcon, need: ['yeni-karar', 'write'] },
  { title: 'Karar Arşivi', path: '/archive', icon: ArchiveIcon, need: ['arsiv', 'read'] },
  { title: 'Kullanıcılar', path: '/users', icon: PeopleIcon, need: ['users', 'read'] },
  { title: 'Roller', path: '/roles', icon: SecurityIcon, need: ['roles', 'read'] },
  { title: 'İşlem Kayıtları', path: '/logs', icon: HistoryEduIcon, need: ['logs', 'read'] },
  { title: 'Kullanım Kılavuzu', path: '/user-manual', icon: MenuBookIcon },
];

// Her kategori aramayı farklı bir sayfaya götürür.
// Yalnızca kullanıcının girebildiği sayfalar listelenir (App.jsx rota yetkileriyle aynı).
const SEARCH_TARGETS = [
  { label: 'Tümü', path: '/dashboard', need: ['oylama', 'read'] },
  { label: 'Kararlar', path: '/dashboard', need: ['oylama', 'read'] },
  { label: 'Duyurular', path: '/duyurular', need: ['oylama', 'read'] },
  { label: 'Arşiv', path: '/archive', need: ['arsiv', 'read'] },
];

export default function SearchModal({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Tümü');
  const navigate = useNavigate();
  const { can } = useAuth();

  const targets = SEARCH_TARGETS.filter((t) => can(...t.need));
  const activeTarget = targets.find((t) => t.label === filter) || targets[0];

  // ESC tuşuyla modalı kapatma
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const term = query.trim().slice(0, 200);
    if (!term || !activeTarget) return;
    onClose();
    // Arama terimi seçili kategorinin sayfasına filtre olarak gider.
    navigate(`${activeTarget.path}?search=${encodeURIComponent(term)}`);
  };

  const handleNavigate = (path) => {
    onClose();
    navigate(path);
  };

  return (
    <Dialog
      fullScreen
      open={Boolean(open)}
      onClose={onClose}
      TransitionComponent={Fade}
      transitionDuration={200}
      sx={{
        zIndex: 99999,
        '& .MuiDialog-paper': {
          bgcolor: '#0a1633 !important',
          backgroundImage: 'radial-gradient(circle at 50% 20%, #102554 0%, #070f24 100%)',
          color: '#ffffff',
          m: 0,
          p: { xs: 2.5, sm: 4, md: 6 },
          overflowY: 'auto',
        },
      }}
    >
      <Box sx={{ maxWidth: 840, mx: 'auto', width: '100%', pt: { xs: 2, md: 3 } }}>
        {/* Üst Kısım: Başlık ve Kapat Butonu */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography sx={{ fontSize: { xs: '1.2rem', md: '1.5rem' }, fontWeight: 700, color: '#ffffff' }}>
            Kurul İçeriklerinde Arayın
          </Typography>
          <IconButton
            onClick={onClose}
            sx={{
              bgcolor: 'rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              borderRadius: 2,
              p: 1,
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)', color: '#ffffff' },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Arama Input Çubuğu */}
        <Box
          component="form"
          onSubmit={handleSearchSubmit}
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: 'rgba(255, 255, 255, 0.07)',
            border: '1.5px solid rgba(255, 255, 255, 0.16)',
            borderRadius: '50px',
            px: 2.5,
            py: 1,
            mb: 1.5,
            boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
            '&:focus-within': {
              borderColor: '#38bdf8',
              bgcolor: 'rgba(255, 255, 255, 0.11)',
            },
          }}
        >
          <SearchIcon sx={{ color: '#94a3b8', mr: 1.5, fontSize: 26 }} />
          <InputBase
            autoFocus
            fullWidth
            placeholder="Konu veya karar numarası yazın (örn. staj, 2026/9)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{
              color: '#ffffff',
              fontSize: '1rem',
              '& input::placeholder': { color: '#8295b5', opacity: 1 },
            }}
          />
          <IconButton
            type="submit"
            sx={{
              bgcolor: 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              borderRadius: '50%',
              p: 1,
              '&:hover': { bgcolor: '#0284c7' },
            }}
          >
            <ArrowForwardIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Bilgilendirme */}
        <Box sx={{ display: 'flex', gap: 3, mb: 3, px: 1 }}>
          <Typography sx={{ color: '#8295b5', fontSize: '0.8rem' }}>
            ℹ Konu veya karar numarası ile arayın
          </Typography>
          <Typography sx={{ color: '#8295b5', fontSize: '0.8rem' }}>
            ⌨ ESC tuşu ile kapatın
          </Typography>
        </Box>

        {/* Filtre Butonları */}
        <Box sx={{ display: 'flex', gap: 1.2, mb: 4, flexWrap: 'wrap' }}>
          {targets.map(({ label: item }) => {
            const active = activeTarget?.label === item;
            return (
              <Chip
                key={item}
                label={item}
                onClick={() => setFilter(item)}
                sx={{
                  bgcolor: active ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: active ? '#38bdf8' : '#94a3b8',
                  border: active ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '20px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  px: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.12)' },
                }}
              />
            );
          })}
        </Box>

        {/* Hızlı Erişim Modülleri */}
        <Typography sx={{ color: '#ffffff', fontWeight: 700, fontSize: '0.95rem', mb: 2 }}>
          Hızlı Erişim Modülleri
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 1.5,
          }}
        >
          {QUICK_LINKS.filter((item) => !item.need || can(...item.need)).map((item, idx) => {
            const Icon = item.icon;
            return (
              <Box
                key={idx}
                component="button"
                type="button"
                onClick={() => handleNavigate(item.path)}
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 2.5,
                  p: 1.8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.12)',
                    borderColor: 'rgba(56, 189, 248, 0.5)',
                    transform: 'translateY(-2px)',
                    color: '#ffffff',
                  },
                }}
              >
                <Icon sx={{ color: '#38bdf8', fontSize: 22, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {item.title}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Dialog>
  );
}