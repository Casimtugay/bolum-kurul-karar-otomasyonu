import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';

import { NAVY, YELLOW } from '../styles/adminTheme';

// İmzalayacak üyeye imzanın nasıl işlendiğini ve kuralları anlatır.
const SECTIONS = [
  {
    title: 'Neden parolanız soruluyor?',
    items: [
      'Oturumu açık kalmış bir bilgisayarda başka birinin sizin adınıza imza atmasını önlemek için parolanız her imzada yeniden doğrulanır.',
      'Hatalı parola girişleri kayda geçer ve deneme sayısı sınırlıdır. Parola yanlışsa imza kaydedilmez.',
    ],
  },
  {
    title: 'İmzanız nasıl işlenir?',
    items: [
      'Kâğıda attığınız imzanın fotoğrafı tarayıcınızda işlenir: arka plan temizlenir, imza kırpılıp şeffaf görüntüye dönüştürülür. Çektiğiniz fotoğrafın kendisi sunucuya gönderilmez.',
      'İmza görüntüsü, PDF’de adınızın altındaki kutuya yerleşir. Görüntünün SHA-256 özeti, imza zamanıyla birlikte işlem kaydına yazılır.',
      'İsterseniz imzanızı “İmzam” sayfasına kaydedip sonraki kararlarda yeniden kullanabilirsiniz.',
    ],
  },
  {
    title: 'Neyi imzalıyorsunuz?',
    items: [
      'İmza penceresinde gördüğünüz PDF, oylama bitince sabitlenen imzaya esas karar metnidir; indirdiğiniz dosyanın özeti sunucudaki kayıtla karşılaştırılır.',
      'İmzanız bu sabit belgenin özetine bağlanır. Belge sonradan değiştirilirse imzalar geçersiz olur ve sistem bunu gösterir.',
      'Ek dosyaların adları PDF’de listelenir; içerikleri ayrıca kontrol edilir.',
    ],
  },
  {
    title: 'Kurallar',
    items: [
      'Yalnızca toplantıya katılan olarak işaretlenen üyeler imzalar ve her üye yalnızca kendi adına imza atabilir.',
      'Karşı oy kullandıysanız da imzanız gerekir; oyunuz kayıtlarda ayrıca tutulur.',
      'Atılan imza geri alınamaz. Hata varsa karar başkan tarafından iptal edilip yeniden değerlendirilir.',
      'İmza hazırlığının süresi sınırlıdır; süre dolarsa pencereyi kapatıp yeniden başlatın.',
    ],
  },
  {
    title: 'İmzadan sonra',
    items: [
      'Size “Kararı imzaladınız” bildirimi ve kayıtlı kurumsal e-posta adresinize makbuz gönderilir. Bu imzayı siz atmadıysanız hemen bölüm başkanlığına bildirin ve parolanızı değiştirin.',
      'Tüm üyeler imzalayınca karar PDF’si sistem sertifikasıyla mühürlenir. Mühürlü dosyada yapılan en küçük değişiklik mührü bozar.',
      'PDF’nin altındaki karekod ve doğrulama kodu ile belgenin güncel durumu giriş yapmadan doğrulanabilir.',
    ],
  },
];

export default function SigningRulesDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle
        sx={{
          bgcolor: NAVY,
          color: '#fff',
          borderBottom: `4px solid ${YELLOW}`,
          fontWeight: 800,
        }}
      >
        İmza kuralları ve bilgilendirme
      </DialogTitle>

      <DialogContent sx={{ pt: '20px !important' }}>
        {SECTIONS.map((section) => (
          <Box key={section.title} sx={{ mb: 2.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: NAVY, mb: 0.75 }}>
              {section.title}
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.75 }}>
              {section.items.map((item) => (
                <Typography component="li" variant="body2" key={item} sx={{ color: '#334155', lineHeight: 1.55 }}>
                  {item}
                </Typography>
              ))}
            </Box>
          </Box>
        ))}

        <Typography
          variant="caption"
          sx={{ display: 'block', color: '#64748b', borderTop: '1px solid #e2e8f0', pt: 1.5 }}
        >
          Bu imza sistem içi onay imzasıdır; 5070 sayılı Elektronik İmza Kanunu kapsamında
          güvenli (nitelikli) elektronik imza değildir. Parolanızı kimseyle paylaşmayın.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', fontWeight: 700, bgcolor: NAVY }}>
          Anladım
        </Button>
      </DialogActions>
    </Dialog>
  );
}
