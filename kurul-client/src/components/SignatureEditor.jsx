import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';

import { NAVY, BLUE, BORDER, SOFT } from '../styles/adminTheme';

// Beyaz kâğıda tükenmez kalemle atılmış imzanın fotoğrafından şeffaf imza üretir.
// 1) Fotoğraf yüklenir (telefonda kamera açılır, fotoğrafın yönü dikkate alınır).
// 2) Arka plan kaldırılır: her piksel kendi çevresinin parlaklığıyla karşılaştırılır
//    (yerel eşikleme); böylece gölge ve eşit olmayan ışıkta da kâğıt silinir.
// 3) İmza kenarlarına göre kırpılır; kullanıcı kutu içinde büyütür, kaydırır, döndürür.
// 4) Küçültmede ince kalem izleri solmasın diye çizgiler kalınlaştırılır ve
//    yarı saydam kenarlar sertleştirilir (PDF'te koyu ve keskin görünür).
// Sonuç 600×200 şeffaf PNG'dir (PDF'teki imza kutusuyla aynı oran).

const OUT_W = 600;
const OUT_H = 200;
const MAX_INPUT = 1600;
const INK_COLORS = {
  black: [10, 10, 14],
  navy: [10, 28, 92],
};

async function loadBitmap(file) {
  // Telefon fotoğraflarındaki EXIF yön bilgisi uygulanır.
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Bazı tarayıcılar seçeneği desteklemez; aşağıdaki yönteme düşülür.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Fotoğrafı en fazla MAX_INPUT pikselde gri tonlu parlaklık dizisine çevirir.
function toLuma(source) {
  const scale = Math.min(1, MAX_INPUT / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const luma = new Float32Array(w * h);
  for (let i = 0, p = 0; p < luma.length; i += 4, p += 1) {
    luma[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return { w, h, luma, rgba };
}

// Yerel eşikleme: piksel, çevresindeki pencerenin ortalamasından belirgin koyuysa mürekkeptir.
// sensitivity (0..1) arttıkça daha soluk çizgiler de mürekkep sayılır.
function extractInk({ w, h, luma, rgba }, sensitivity) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y += 1) {
    let row = 0;
    for (let x = 1; x <= w; x += 1) {
      row += luma[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }

  const radius = Math.max(8, Math.round(Math.max(w, h) / 24));
  const k = 0.32 - sensitivity * 0.26; // 0.32 (katı) … 0.06 (hassas)
  const raw = new Uint8ClampedArray(w * h);

  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const sum =
        integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] -
        integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const threshold = mean * (1 - k);
      const l = luma[y * w + x];
      if (l < threshold) {
        // Eşiğe yakın pikseller yarı saydam kalır (yumuşak kenar).
        const strength = Math.min(1, (threshold - l) / (mean * 0.07 + 1));
        raw[y * w + x] = Math.round(255 * Math.max(0.55, strength));
      }
    }
  }

  // Kâğıt dokusundaki tek tük koyu noktalar atılır: mürekkep pikselinin
  // komşularından en az ikisi de mürekkep olmalıdır (kalem izi süreklidir).
  const alpha = new Uint8ClampedArray(w * h);
  const colCount = new Uint32Array(w);
  const rowCount = new Uint32Array(h);
  let total = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      if (!raw[i]) continue;
      const neighbours =
        (raw[i - w - 1] > 0) + (raw[i - w] > 0) + (raw[i - w + 1] > 0) +
        (raw[i - 1] > 0) + (raw[i + 1] > 0) +
        (raw[i + w - 1] > 0) + (raw[i + w] > 0) + (raw[i + w + 1] > 0);
      if (neighbours >= 2) {
        alpha[i] = raw[i];
        colCount[x] += 1;
        rowCount[y] += 1;
        total += 1;
      }
    }
  }

  if (total < 30) return null;

  // Kırpma kutusu mürekkebin %99,5'ini kapsar; kalan birkaç uzak nokta kutuyu büyütemez.
  const trim = Math.floor(total * 0.0025);
  const edge = (counts) => {
    let acc = 0; let lo = 0; let hi = counts.length - 1;
    for (let i = 0; i < counts.length; i += 1) { acc += counts[i]; if (acc > trim) { lo = i; break; } }
    acc = 0;
    for (let i = counts.length - 1; i >= 0; i -= 1) { acc += counts[i]; if (acc > trim) { hi = i; break; } }
    return [lo, hi];
  };
  const pad = 6;
  const [cx0, cx1] = edge(colCount);
  const [cy0, cy1] = edge(rowCount);
  const minX = Math.max(0, cx0 - pad);
  const minY = Math.max(0, cy0 - pad);
  const maxX = Math.min(w - 1, cx1 + pad);
  const maxY = Math.min(h - 1, cy1 + pad);

  return { w, h, alpha, rgba, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

// Kırpılmış, şeffaf imza tuvali (mürekkep rengi uygulanmış).
function renderInk(ink, color) {
  const { box, alpha, rgba, w } = ink;
  const canvas = document.createElement('canvas');
  canvas.width = box.w;
  canvas.height = box.h;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(box.w, box.h);
  const fixed = INK_COLORS[color];
  for (let y = 0; y < box.h; y += 1) {
    for (let x = 0; x < box.w; x += 1) {
      const src = (box.y + y) * w + (box.x + x);
      const dst = (y * box.w + x) * 4;
      const a = alpha[src];
      if (!a) continue;
      if (fixed) {
        out.data[dst] = fixed[0];
        out.data[dst + 1] = fixed[1];
        out.data[dst + 2] = fixed[2];
      } else {
        // Orijinal renk biraz koyulaştırılır ki baskıda soluk kalmasın.
        out.data[dst] = rgba[src * 4] * 0.7;
        out.data[dst + 1] = rgba[src * 4 + 1] * 0.7;
        out.data[dst + 2] = rgba[src * 4 + 2] * 0.7;
      }
      out.data[dst + 3] = a;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

// Çıktıdaki mürekkebi koyulaştırır: yarı saydam kenarlar sertleştirilir (gamma),
// thickness > 0 ise çizgiler o kadar piksel kalınlaştırılır (alfa için en büyük değer süzgeci).
function strengthenInk(ctx, thickness) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  let alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = d[i * 4 + 3];

  for (let pass = 0; pass < thickness; pass += 1) {
    const next = new Uint8ClampedArray(alpha);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        let m = alpha[i];
        if (x > 0 && alpha[i - 1] > m) m = alpha[i - 1];
        if (x < w - 1 && alpha[i + 1] > m) m = alpha[i + 1];
        if (y > 0 && alpha[i - w] > m) m = alpha[i - w];
        if (y < h - 1 && alpha[i + w] > m) m = alpha[i + w];
        if (m !== alpha[i]) {
          next[i] = m;
          // Yeni eklenen kenar pikseli komşusunun rengini alır.
          const src = [i - 1, i + 1, i - w, i + w].find((j) => j >= 0 && j < alpha.length && alpha[j] === m);
          if (src !== undefined) {
            d[i * 4] = d[src * 4];
            d[i * 4 + 1] = d[src * 4 + 1];
            d[i * 4 + 2] = d[src * 4 + 2];
          }
        }
      }
    }
    alpha = next;
  }

  for (let i = 0; i < alpha.length; i += 1) {
    const a = alpha[i];
    d[i * 4 + 3] = a < 24 ? 0 : Math.round(255 * Math.min(1, ((a - 24) / 160) ** 0.6));
  }
  ctx.putImageData(img, 0, 0);
}

function rotate90(canvas) {
  const rotated = document.createElement('canvas');
  rotated.width = canvas.height;
  rotated.height = canvas.width;
  const ctx = rotated.getContext('2d');
  ctx.translate(rotated.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0);
  return rotated;
}

export default function SignatureEditor({ onCancel, onDone, doneLabel = 'Bu imzayı kullan' }) {
  const [luma, setLuma] = useState(null);
  const [sensitivity, setSensitivity] = useState(0.5);
  const [color, setColor] = useState('navy');
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Çizgi kalınlığı (piksel); ince tükenmez kalem izleri PDF'te koyu görünsün diye varsayılan 1.
  const [thickness, setThickness] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const previewRef = useRef(null);
  const dragRef = useRef(null);
  const fileRef = useRef(null);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Lütfen bir görsel dosyası seçin (JPG veya PNG).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const bitmap = await loadBitmap(file);
      setLuma(toLuma(bitmap));
      setRotation(0);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch {
      setError('Görsel açılamadı. Farklı bir görsel deneyin (JPG veya PNG).');
    } finally {
      setBusy(false);
    }
  };

  // Hassasiyet, renk veya döndürme değişince imza yeniden çıkarılır.
  const { inkCanvas, inkError } = useMemo(() => {
    if (!luma) return { inkCanvas: null, inkError: '' };
    const ink = extractInk(luma, sensitivity);
    if (!ink) {
      return {
        inkCanvas: null,
        inkError: 'Görselde imza bulunamadı. Hassasiyeti artırın veya imzanın daha yakından göründüğü bir görsel seçin.',
      };
    }
    let canvas = renderInk(ink, color);
    for (let i = 0; i < rotation; i += 1) canvas = rotate90(canvas);
    return { inkCanvas: canvas, inkError: '' };
  }, [luma, sensitivity, color, rotation]);

  // İmzanın kutuya sığdırılmış temel ölçeği (zoom = 1 iken %90 doluluk).
  const fitScale = inkCanvas
    ? Math.min((OUT_W * 0.9) / inkCanvas.width, (OUT_H * 0.9) / inkCanvas.height)
    : 1;

  const drawTo = useCallback((ctx) => {
    ctx.clearRect(0, 0, OUT_W, OUT_H);
    if (!inkCanvas) return;
    const s = fitScale * zoom;
    const dw = inkCanvas.width * s;
    const dh = inkCanvas.height * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(inkCanvas, (OUT_W - dw) / 2 + offset.x, (OUT_H - dh) / 2 + offset.y, dw, dh);
    strengthenInk(ctx, thickness);
  }, [inkCanvas, fitScale, zoom, offset, thickness]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (canvas) drawTo(canvas.getContext('2d', { willReadFrequently: true }));
  }, [drawTo]);

  // Sürükleyerek konumlandırma (fare ve dokunmatik).
  const toCanvasDelta = () => {
    const rect = previewRef.current.getBoundingClientRect();
    return { sx: OUT_W / rect.width, sy: OUT_H / rect.height };
  };

  const onPointerDown = (event) => {
    if (!inkCanvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, start: offset, ...toCanvasDelta() };
  };
  const onPointerMove = (event) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset({
      x: d.start.x + (event.clientX - d.x) * d.sx,
      y: d.start.y + (event.clientY - d.y) * d.sy,
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const finish = () => {
    if (!inkCanvas) return;
    const out = document.createElement('canvas');
    out.width = OUT_W;
    out.height = OUT_H;
    drawTo(out.getContext('2d', { willReadFrequently: true }));
    onDone(out.toDataURL('image/png'));
  };

  return (
    <Box>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
      />

      {!luma ? (
        <Box sx={{ textAlign: 'center', p: { xs: 2, sm: 4 }, border: `2px dashed ${BORDER}`, borderRadius: 3, bgcolor: '#fafbfd' }}>
          <Typography sx={{ color: NAVY, fontWeight: 800, mb: 1 }}>İmza görselinizi yükleyin</Typography>
          <Box component="ul" sx={{ textAlign: 'left', color: '#475569', fontSize: 14, maxWidth: 440, mx: 'auto', my: 2, pl: 2.5 }}>
            <li>Beyaz kâğıda attığınız imzanın fotoğrafını veya taranmış görselini seçin (JPG, PNG).</li>
            <li>İmza görselin büyük kısmını kaplasın; gölge ve başka yazı olmasın.</li>
            <li>Arka plan otomatik temizlenir; bir sonraki adımda boyut ve konumu ayarlayabilirsiniz.</li>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
            {onCancel && (
              <Button
                startIcon={<ArrowBackIcon />}
                disabled={busy}
                onClick={onCancel}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Önceki adıma dön
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <UploadFileOutlinedIcon />}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              sx={{ bgcolor: BLUE, fontWeight: 800, textTransform: 'none' }}
            >
              İmza görseli yükle
            </Button>
          </Box>
          {error && <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }}>{error}</Alert>}
        </Box>
      ) : (
        <Box>
          <Typography variant="body2" sx={{ color: '#475569', mb: 1 }}>
            İmzayı sürükleyerek konumlandırın; büyütüp küçültmek için kaydırıcıyı kullanın.
          </Typography>

          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: 600,
              aspectRatio: `${OUT_W} / ${OUT_H}`,
              mx: 'auto',
              border: `2px solid ${BLUE}`,
              borderRadius: 1,
              // Şeffaflık dama deseniyle gösterilir.
              backgroundColor: '#fff',
              backgroundImage:
                'linear-gradient(45deg,#eef1f6 25%,transparent 25%),linear-gradient(-45deg,#eef1f6 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef1f6 75%),linear-gradient(-45deg,transparent 75%,#eef1f6 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
              touchAction: 'none',
              cursor: inkCanvas ? 'grab' : 'default',
            }}
          >
            <Box
              component="canvas"
              ref={previewRef}
              width={OUT_W}
              height={OUT_H}
              aria-label="İmza yerleşim alanı"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              sx={{ width: '100%', height: '100%', display: 'block' }}
            />
            <Box sx={{ position: 'absolute', left: '8%', right: '8%', bottom: '18%', borderBottom: '1px dashed #94a3b8', pointerEvents: 'none' }} />
          </Box>

          {(error || inkError) && <Alert severity="warning" sx={{ mt: 2 }}>{error || inkError}</Alert>}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 3, mt: 2.5 }}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: NAVY }}>Boyut</Typography>
              <Slider
                value={zoom}
                min={0.3}
                max={2.5}
                step={0.05}
                onChange={(_, v) => setZoom(v)}
                aria-label="İmza boyutu"
                disabled={!inkCanvas}
              />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: NAVY }}>Arka plan temizleme hassasiyeti</Typography>
              <Slider
                value={sensitivity}
                min={0}
                max={1}
                step={0.05}
                onChange={(_, v) => setSensitivity(v)}
                aria-label="Arka plan temizleme hassasiyeti"
              />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: NAVY }}>Çizgi kalınlığı</Typography>
              <Slider
                value={thickness}
                min={0}
                max={3}
                step={1}
                marks
                onChange={(_, v) => setThickness(v)}
                aria-label="Çizgi kalınlığı"
                disabled={!inkCanvas}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: NAVY }}>Mürekkep:</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={color}
              onChange={(_, v) => v && setColor(v)}
              aria-label="Mürekkep rengi"
            >
              <ToggleButton value="navy">Lacivert</ToggleButton>
              <ToggleButton value="black">Siyah</ToggleButton>
              <ToggleButton value="original">Orijinal</ToggleButton>
            </ToggleButtonGroup>
            <Button size="small" startIcon={<RotateRightIcon />} onClick={() => setRotation((r) => (r + 1) % 4)} sx={{ textTransform: 'none', fontWeight: 700 }}>
              Döndür
            </Button>
            <Button size="small" startIcon={<CenterFocusStrongOutlinedIcon />} onClick={() => { setOffset({ x: 0, y: 0 }); setZoom(1); }} sx={{ textTransform: 'none', fontWeight: 700 }}>
              Ortala
            </Button>
            <Button size="small" startIcon={<UploadFileOutlinedIcon />} onClick={() => fileRef.current?.click()} sx={{ textTransform: 'none', fontWeight: 700, ml: { sm: 'auto' } }}>
              Başka görsel
            </Button>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => { setLuma(null); setError(''); }}
              sx={{ textTransform: 'none', fontWeight: 700, mr: 'auto' }}
            >
              Önceki adıma dön
            </Button>
            {onCancel && <Button onClick={onCancel} sx={{ textTransform: 'none', fontWeight: 700 }}>Vazgeç</Button>}
            <Button
              variant="contained"
              disabled={!inkCanvas}
              onClick={finish}
              sx={{ bgcolor: NAVY, fontWeight: 800, textTransform: 'none', '&:hover': { bgcolor: BLUE } }}
            >
              {doneLabel}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// İmzayı kutu içinde gösterir (dama deseni olmadan, beyaz zemin).
export function SignaturePreview({ src, height = 80 }) {
  return (
    <Box
      sx={{
        height,
        aspectRatio: `${OUT_W} / ${OUT_H}`,
        maxWidth: '100%',
        border: `1px solid ${BORDER}`,
        borderRadius: 1,
        bgcolor: '#fff',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        backgroundImage: `linear-gradient(${SOFT}, ${SOFT})`,
        backgroundSize: '100% 1px',
        backgroundPosition: '0 78%',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {src && <Box component="img" src={src} alt="İmza" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
    </Box>
  );
}
