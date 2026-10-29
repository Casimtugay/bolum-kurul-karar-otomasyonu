import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Typography, Box, Paper, TextField,
  Button, IconButton, Dialog, InputAdornment,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';

import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';

import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api/client';

// Giriş yalnızca kurumsal adresle yapılır (admin dahil); sunucu da aynı kuralı uygular.
const LOGIN_DOMAIN = '@selcuk.edu.tr';
const isInstitutionalEmail = (value) =>
  value.toLocaleLowerCase('tr-TR').endsWith(LOGIN_DOMAIN) && value.length > LOGIN_DOMAIN.length;

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captcha, setCaptcha] = useState(null);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [captchaError, setCaptchaError] = useState('');
  // Sunucu güvenlik kodunu kapattıysa (LoginCaptcha:Enabled=false) alan gösterilmez.
  const [captchaEnabled, setCaptchaEnabled] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const loginInProgress = useRef(false);
  const mounted = useRef(false);
  const captchaRequest = useRef(null);
  const captchaSequence = useRef(0);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const loadCaptcha = async () => {
    captchaRequest.current?.abort();

    const controller = new AbortController();
    const sequence = ++captchaSequence.current;
    captchaRequest.current = controller;

    setCaptcha(null);
    setCaptchaInput('');
    setCaptchaError('');
    setCaptchaLoading(true);

    try {
      const data = await apiFetch('/api/auth/captcha', {
        auth: false,
        signal: controller.signal,
      });

      if (data?.enabled === false) {
        if (mounted.current && sequence === captchaSequence.current) {
          setCaptchaEnabled(false);
        }
        return;
      }

      if (
        typeof data?.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id) ||
        typeof data.image !== 'string' ||
        !data.image.startsWith('data:image/png;base64,') ||
        !Number.isFinite(Date.parse(data.expiresAt))
      ) {
        throw new Error('Sunucudan geçerli güvenlik kodu alınamadı.');
      }

      if (mounted.current && sequence === captchaSequence.current) {
        setCaptchaEnabled(true);
        setCaptcha(data);
      }
    } catch (error) {
      if (
        error?.name !== 'AbortError' &&
        mounted.current &&
        sequence === captchaSequence.current
      ) {
        setCaptchaError(
          error.message || 'Güvenlik kodu yüklenemedi.'
        );
      }
    } finally {
      if (mounted.current && sequence === captchaSequence.current) {
        setCaptchaLoading(false);
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    void loadCaptcha();

    return () => {
      mounted.current = false;
      captchaSequence.current += 1;
      captchaRequest.current?.abort();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loginInProgress.current || captchaLoading) return;

    setErrorMsg('');

    const trimmedUsername = username.trim();

    if (!trimmedUsername || !password) {
      setErrorMsg('E-posta adresinizi ve parolanızı giriniz.');
      return;
    }

    if (!isInstitutionalEmail(trimmedUsername)) {
      setErrorMsg('Kurumsal e-posta adresinizi yazın (kullanıcıadı@selcuk.edu.tr).');
      return;
    }

    const useCaptcha = captchaEnabled !== false;

    if (useCaptcha) {
      if (!captcha) {
        setErrorMsg('Önce güvenlik kodunu yenileyin.');
        return;
      }

      if (!/^\d{4}$/.test(captchaInput.trim())) {
        setErrorMsg('Görseldeki 4 rakamı giriniz.');
        return;
      }

      if (Date.parse(captcha.expiresAt) <= Date.now()) {
        setErrorMsg('Güvenlik kodunun süresi doldu. Yeni kodu giriniz.');
        await loadCaptcha();
        return;
      }
    }

    loginInProgress.current = true;
    setLoading(true);

    const submittedCaptcha = captcha;
    if (useCaptcha) setCaptcha(null);

    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: useCaptcha
          ? {
              username: trimmedUsername,
              password,
              captchaId: submittedCaptcha.id,
              captchaAnswer: captchaInput.trim(),
            }
          : { username: trimmedUsername, password },
      });

      if (
        typeof data?.token !== 'string' ||
        !data.token.trim() ||
        !data.user
      ) {
        throw new Error('Sunucudan geçerli oturum bilgisi alınamadı.');
      }

      if (!mounted.current) return;

      login(data);
      navigate('/select-unit', { replace: true });
    } catch (error) {
      if (!mounted.current) return;

      setErrorMsg(
        error.message || 'Giriş işlemi tamamlanamadı.'
      );

      if (useCaptcha) await loadCaptcha();
    } finally {
      loginInProgress.current = false;

      if (mounted.current) {
        setLoading(false);
      }
    }
  };

  // Görünüm Selçuk Üniversitesi OBİS giriş ekranına benzetilmiştir:
  // geometrik desenli zemin, gri kart, büyük amblem, koyu "GİRİŞ" düğmesi; kurumsal lacivert ve altın vurgular.
  const NAVY = '#0b3d91';
  const GOLD = '#f2b705';
  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#e3ecfd',
      borderRadius: 0,
      '& fieldset': { border: 0 },
      '&.Mui-focused fieldset': { border: `2px solid ${NAVY}` },
    },
    '& input': { py: 1.3, fontSize: '0.95rem' },
  };

  const captchaRequired = captchaEnabled !== false;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 6,
        boxSizing: 'border-box',
        bgcolor: '#f4f5f5',
        backgroundImage: 'url(/selcuk-bg.png)',
        backgroundRepeat: 'repeat',
        backgroundSize: '420px',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <Paper
          elevation={0}
          sx={{
            pt: 4,
            pb: 3,
            px: { xs: 3, sm: 5 },
            borderRadius: 0,
            bgcolor: '#ececec',
            borderTop: `5px solid ${NAVY}`,
            boxShadow: '0 6px 24px rgba(11,61,145,0.28)',
            textAlign: 'center',
          }}
        >
          <Box
            component="img"
            src="/selcukuni.png"
            alt="Selçuk Üniversitesi"
            sx={{ width: 150, height: 150, objectFit: 'contain' }}
          />

          <Typography component="h1" sx={{ fontWeight: 700, color: NAVY, fontSize: '1.2rem', mt: 1.5 }}>
            Bölüm Kurul Karar Otomasyonu
          </Typography>

          <Box sx={{ width: 64, height: 3, bgcolor: GOLD, mx: 'auto', mt: 1.5, mb: 2.5 }} />

          <Box
            component="form"
            onSubmit={handleSubmit}
            aria-busy={loading}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, textAlign: 'left' }}
          >
            {location.state?.passwordChanged && (
              <Alert severity="success">
                Parolanız değiştirildi. Yeni parolanızla giriş yapın.
              </Alert>
            )}

            {errorMsg && (
              <Alert severity="error" sx={{ whiteSpace: 'pre-line' }}>
                {errorMsg}
              </Alert>
            )}

            <TextField
              fullWidth
              name="username"
              autoComplete="username"
              placeholder="kullaniciadi@selcuk.edu.tr"
              required
              disabled={loading}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              sx={fieldSx}
              slotProps={{
                htmlInput: {
                  'aria-label': 'Kurumsal e-posta adresi',
                  inputMode: 'email',
                  autoCapitalize: 'none',
                  spellCheck: false,
                },
              }}
            />

            <TextField
              fullWidth
              name="password"
              autoComplete="current-password"
              placeholder="Parola"
              type={showPassword ? 'text' : 'password'}
              required
              disabled={loading}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              sx={fieldSx}
              slotProps={{
                htmlInput: { 'aria-label': 'Parola' },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        type="button"
                        edge="end"
                        size="small"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                        title={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                        sx={{ color: NAVY }}
                      >
                        {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            {captchaRequired && (
              <Box sx={{ alignSelf: 'center', width: 252, mt: 0.5 }}>
                <Box sx={{ display: 'flex', border: '1px solid #c8c8c8', bgcolor: '#d6d6d6', height: 64 }}>
                  <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                    {captcha ? (
                      <Box
                        component="img"
                        src={captcha.image}
                        alt="Güvenlik kodu"
                        onError={() => {
                          setCaptcha(null);
                          setCaptchaError('Güvenlik kodu görseli açılamadı. Yenileyin.');
                        }}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <Typography variant="caption" sx={{ color: '#555' }} role="status">
                        {captchaLoading ? 'Kod yükleniyor…' : loading ? 'Kontrol ediliyor…' : 'Kodu yenileyin'}
                      </Typography>
                    )}
                  </Box>
                  <IconButton
                    type="button"
                    onClick={() => void loadCaptcha()}
                    disabled={loading || captchaLoading}
                    title="Güvenlik kodunu yenile"
                    aria-label="Güvenlik kodunu yenile"
                    sx={{ borderRadius: 0, width: 50, borderLeft: '1px solid #c8c8c8', color: NAVY }}
                  >
                    <RefreshIcon />
                  </IconButton>
                </Box>
                <Box
                  component="input"
                  name="captcha"
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Güvenlik Kodu"
                  aria-label="Görseldeki dört rakam"
                  required
                  disabled={loading || captchaLoading || !captcha}
                  value={captchaInput}
                  onChange={(event) => setCaptchaInput(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  sx={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid #c8c8c8',
                    borderTop: 0,
                    bgcolor: '#fff',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    py: 1.2,
                    outline: 'none',
                    letterSpacing: 2,
                    '&:focus': { borderColor: NAVY },
                  }}
                />
                {captchaError && (
                  <Alert severity="error" sx={{ mt: 1 }}>{captchaError}</Alert>
                )}
              </Box>
            )}

            <Button
              type="submit"
              variant="contained"
              disabled={loading || captchaLoading || (captchaRequired && !captcha)}
              sx={{
                alignSelf: 'center',
                mt: 1,
                minWidth: 150,
                py: 1.1,
                borderRadius: 0,
                background: `linear-gradient(135deg, ${NAVY} 0%, #1658c9 100%)`,
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                letterSpacing: 1,
                boxShadow: '0 4px 12px rgba(11,42,107,0.3)',
                '&:hover': { background: NAVY, boxShadow: '0 4px 12px rgba(11,42,107,0.4)' },
                '&.Mui-disabled': { color: 'rgba(255,255,255,0.75)', opacity: 0.8 },
              }}
            >
              {loading ? 'GİRİŞ YAPILIYOR…' : 'GİRİŞ'}
            </Button>
          </Box>

          <Box sx={{ borderTop: '1px solid #cfcfcf', mt: 3, pt: 2, display: 'flex', justifyContent: 'center', gap: 3 }}>
            <Button
              type="button"
              size="small"
              disabled={loading}
              onClick={() => setForgotPasswordOpen(true)}
              sx={{ textTransform: 'none', color: '#d6334a', fontWeight: 600 }}
            >
              Şifremi Unuttum
            </Button>
            <Button
              type="button"
              size="small"
              disabled={loading}
              onClick={() => navigate('/user-manual')}
              sx={{ textTransform: 'none', color: NAVY, fontWeight: 600 }}
            >
              Kullanım Kılavuzu
            </Button>
          </Box>
        </Paper>
      </Box>

      <Typography variant="caption" sx={{ color: '#475569', mt: 3 }}>
        © {new Date().getFullYear()} Selçuk Üniversitesi · Bölüm Kurul Karar Otomasyonu
      </Typography>

      <Dialog
        open={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="forgot-password-title"
      >
        <DialogTitle id="forgot-password-title" sx={{ color: '#001f3f', fontWeight: 700 }}>
          Parola Sıfırlama
        </DialogTitle>

        <DialogContent>
          <Typography variant="body2" sx={{ color: '#475569' }}>
            Parolanızı unuttuysanız sistem yöneticinizle iletişime
            geçin. Kimliğiniz doğrulandıktan sonra hesabınız için
            geçici bir parola tanımlanır. Bu parolayla giriş
            yaptığınızda yeni parolanızı belirlemeniz gerekir.
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setForgotPasswordOpen(false)} sx={{ color: '#001f3f', fontWeight: 700 }}>
            Tamam
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
