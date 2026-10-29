import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import theme from './theme';

import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import SelectUnit from './pages/SelectUnit';
import DecisionPanel from './pages/DecisionPanel';
import SharedDashboard from './components/SharedDashboard';
import VotingPanel from './components/VotingPanel';
import PdfPreview from './pages/PdfPreview';
import Archive from './pages/Archive';
import LogsManagement from './pages/LogsManagement';
import RolesManagement from './pages/RolesManagement';
import UsersManagement from './pages/UsersManagement';
import UserManual from './pages/UserManual';
import Rsvp from './pages/Rsvp';
import VerifyDocument from './pages/VerifyDocument';
import MySignature from './pages/MySignature';

// YENİ EKLENEN SAYFALAR:
import Home from './pages/Home';
import Announcements from './pages/Announcements';

// Karar ekranlarını görmek için oylama veya arşiv okuma yetkisi yeterli
const VIEW_DECISIONS = ['oylama:read', 'arsiv:read'];

// Üniversite temasını Login dışındaki tüm sayfalara uygular.
const themed = (element) => <ThemeProvider theme={theme}>{element}</ThemeProvider>;

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Login olduğu gibi kalır, tema uygulanmaz */}
          <Route path="/" element={<Login />} />

          {/* E-postadaki katılım bağlantısı: giriş gerektirmez */}
          <Route path="/katilim/:token" element={themed(<Rsvp />)} />
          <Route path="/dogrula" element={themed(<VerifyDocument />)} />
          <Route path="/dogrula/:code" element={themed(<VerifyDocument />)} />
          <Route path="/parola-degistir" element={themed(<ProtectedRoute requireUnit={false} allowPasswordChange><ChangePassword /></ProtectedRoute>)} />

          {/* Kurul seçimi: giriş yapmış herkes (kurul seçilmeden önce sol menü yok) */}
          <Route path="/select-unit" element={themed(<ProtectedRoute requireUnit={false}><SelectUnit /></ProtectedRoute>)} />

          {/* Tüm iç sayfalar AppShell içinde: üst çubuk ve sol menü sayfa değişince kaybolmaz */}
          <Route element={themed(<AppShell />)}>
            {/* ANA SAYFA ROTASI (Giriş yapan her kurul üyesi görebilir) */}
            <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />

            {/* TOPLANTI DUYURULARI ROTASI */}
            <Route path="/duyurular" element={<ProtectedRoute need="oylama:read"><Announcements /></ProtectedRoute>} />

            {/* Dashboard: seçili kurulun kararları. Eski adresler de aynı sayfaya gider. */}
            {['/dashboard', '/bolum-kurulu-dashboard', '/bilgisayar-abd-dashboard', '/bilisim-abd-dashboard'].map((path) => (
              <Route key={path} path={path} element={<ProtectedRoute need="oylama:read"><SharedDashboard /></ProtectedRoute>} />
            ))}

            <Route path="/yeni-karar" element={<ProtectedRoute need="yeni-karar:write"><DecisionPanel /></ProtectedRoute>} />
            <Route path="/oylama/:id" element={<ProtectedRoute need={VIEW_DECISIONS}><VotingPanel /></ProtectedRoute>} />
            <Route path="/tutanak/:id" element={<ProtectedRoute need={VIEW_DECISIONS}><PdfPreview /></ProtectedRoute>} />
            <Route path="/tutanak" element={<ProtectedRoute need={VIEW_DECISIONS}><PdfPreview /></ProtectedRoute>} />
            <Route path="/archive" element={<ProtectedRoute need="arsiv:read"><Archive /></ProtectedRoute>} />

            {/* Yönetim sayfaları: yetkisi olan herkes (varsayılan: Admin ve Başkan; Logs herkes) */}
            <Route path="/roles" element={<ProtectedRoute need="roles:read"><RolesManagement /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute need="users:read"><UsersManagement /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute need="logs:read"><LogsManagement /></ProtectedRoute>} />

            <Route path="/yetkisiz-erisim" element={<h2 style={{ padding: 32 }}>Bu sayfaya erişim yetkiniz yok.</h2>} />

            <Route path="/user-manual" element={<UserManual />} />
            <Route path="/imzam" element={<ProtectedRoute><MySignature /></ProtectedRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;