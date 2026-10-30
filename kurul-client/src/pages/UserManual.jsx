import React from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import { useAuth } from '../contexts/AuthContext';
import selcukLogo from '../assets/selcuk.png';

const NAVY = '#102544';
const YELLOW = '#F4C542';

const PROCESS_STEPS = [
  'Duyuru',
  'Karar hazırlama',
  'Oylama',
  'İmza',
  'Arşiv',
];

const SECTIONS = [
  {
    id: 'giris',
    title: 'Giriş ve kurul değiştirme',
    steps: [
      'Kurumsal e-posta adresinizle (kullaniciadi@selcuk.edu.tr) ve parolanızla giriş yapın. Sistem yöneticisi dahil herkes bu biçimde girer.',
      'Parolayı yazarken alanın sağındaki göz simgesiyle parolanızı gösterip gizleyebilirsiniz.',
      'Görseldeki 4 rakamlı güvenlik kodunu yazın. Kod okunmuyorsa veya süresi dolmuşsa yenileme düğmesiyle yeni kod alın.',
      'Parolanızı değiştirmeniz istenirse önce bu adımı tamamlayın.',
      'Girişten sonra en son çalıştığınız kurul kendiliğinden açılır.',
      'Başka bir kurula geçmek için üst çubukta logonun yanındaki kurul adına tıklayın ve listeden kurulu seçin.',
    ],
    note: 'Görebileceğiniz menüler ve yapabileceğiniz işlemler, seçili kuruldaki rolünüze göre belirlenir. Kurullar birbirinden bağımsızdır; bir kuruldaki kararlar ve üyelikler diğerini etkilemez.',
  },
  {
    id: 'duyurular',
    title: 'Kurul duyuruları ve katılım bildirme',
    steps: [
      'Kurul başkanı “Duyurular” sayfasındaki formdan duyuru metnini yazar; isterse toplantı tarihi, saati, yeri, çevrimiçi bağlantısı ve gündem maddelerini ekler.',
      'Alıcı olarak tüm kurul üyeleri veya yalnızca seçilen üyeler belirlenir.',
      '“Önizle ve Yayımla” ile duyuru kontrol edilir ve yayımlanır. Alıcılara sistem içi bildirim oluşturulur ve kurumsal adreslerine e-posta gönderilir.',
      'Üyeler duyurunun altındaki “Katılacağım” veya “Katılamayacağım” düğmeleriyle katılım durumlarını bildirir. E-postadaki bağlantıyla da giriş yapmadan cevap verilebilir.',
      'Kurul başkanı her duyurunun altında kaç kişinin katılacağını, katılamayacağını ve cevap vermediğini görür; “Kişi listesi” ile kimin ne cevap verdiğini inceler.',
      'Zil simgesindeki sayı okunmamış bildirimlerinizi gösterir. Okuduğunuz duyuruyu “Okudum” düğmesiyle işaretleyebilirsiniz.',
    ],
    note: 'Duyuru yayımlama yalnızca kurul başkanına ve sistem yöneticisine açıktır.',
  },
  {
    id: 'karar-hazirlama',
    title: 'Yeni karar hazırlama',
    steps: [
      '“Yeni Karar” sayfasını açın. Hazırlık üç adımdan oluşur: şablon seçimi, bilgilerin doldurulması, PDF önizleme ve oylamaya sunma.',
      'Şablon seçin: hazır şablonlardan biri, kurulunuzun eklediği bir şablon veya boş karar.',
      'Form; Genel Karar Bilgileri, Karar Metni, Karar Tablosu, Ekler ve Toplantıya Katılan Üyeler bölümlerinden oluşur. Bir bölümün başlığına tıklayarak açıp kapatabilirsiniz; kapalıyken sağ tarafta kısa özeti görünür.',
      'Toplantı tarihini ve numarasını kontrol edin; İlgi, Gündem Konusu ve Karar Metni alanlarını doldurun, gerekiyorsa ek dosyaları seçin.',
      'Karar Tablosu bölümünde "Tablo Oluştur" ile kendi tablonuzu kurabilirsiniz. Sütun ve satır ekleyip silebilir, sütun başlığına tıklayıp adını değiştirebilir, başlıklar arasındaki çizgiyi sürükleyerek sütun genişliğini ayarlayabilirsiniz. Sütun ve satırların "⋮" menüsünden taşıma ve araya ekleme yapılır. PDF\'de tablo aynı oranlarla basılır.',
      '“Toplantıya katılan üyeler” listesinden toplantıya katılan üyeleri işaretleyin. Kurul başkanının seçili olması zorunludur.',
      'Yalnızca seçilen üyeler oy kullanır ve PDF’te imza kutusu alır. Seçilmeyen üyeler belgede yer almaz.',
      'PDF önizleme adımında belgeyi kontrol edin. “PDF’yi indir” ile önizlemeyi bilgisayarınıza kaydedebilirsiniz.',
      'Belge uygunsa “Oylamaya Sun” düğmesine basın. Karar kaydedilir, metni ve ekleri kilitlenir ve seçilen üyelere oylama bildirimi gider.',
    ],
    note: 'Karar, “Oylamaya Sun” denene kadar kaydedilmez. Ek dosyalar yüklenemezse karar taslak olarak kalır; karar sayfasından ekleri tamamlayıp oylamaya sunabilirsiniz. Oylama için toplantı yeter sayısı aranmaz.',
  },
  {
    id: 'sablonlar',
    title: 'Kurul şablonu ekleme',
    steps: [
      'Şablon seçme adımında “Yeni şablon ekle” kartına tıklayın.',
      'İsterseniz “PDF / Word’den içe aktar” ile eski bir karar belgesini seçin. Belgedeki İLGİ, GÜNDEM, KARAR ve EKLER bölümleri ilgili alanlara kendiliğinden yerleşir.',
      'Alanları dilediğiniz gibi düzenleyin. “PDF önizle” ile şablonun kurul formatında nasıl görüneceğini kontrol edin.',
      'Yarım kalan şablonu “Taslak olarak kaydet” ile saklayın; hazır olduğunda “Kaydet ve kullanıma aç” ile şablon listesine ekleyin.',
      'Taslak şablonlar ayrı bir bölümde listelenir. Kurul şablonları kalem simgesiyle düzenlenebilir veya silinebilir.',
    ],
    note: 'İçe aktarmada belgenin metni alınır, sayfa düzeni alınmaz. Taranmış (resim) PDF’lerde metin bulunmadığından içe aktarma yapılamaz; bu durumda metni elle yazın.',
  },
  {
    id: 'oylama',
    title: 'Oy kullanma',
    steps: [
      '“Kurul Kararları” listesinde her kararın oylama durumu (Kabul, Ret, Bekleyen) görünür. Oyunuzu bekleyen kararlarda sarı “Oy kullan” düğmesi bulunur.',
      'Kararı açın. Oy kullanma bölümü ve anlık oy durumu sayfanın en üstündedir; karar metni hemen altındadır.',
      'Belgenin tamamını görmek için “PDF’yi görüntüle” düğmesini, ek dosyalar için “Ek Dosyaları İncele” düğmesini kullanın.',
      '“Kabul” veya “Ret” seçeneğini kullanın. Ret oyu için gerekçe yazmanız gerekir.',
      'Katılan üyelerin tamamı oy verdiğinde sistem sonucu hesaplar. Kabul edilen karar imza aşamasına geçer; reddedilen karar arşive düşer.',
    ],
    note: 'Oylar eşitse başkanın oyu sonucu belirler. Kullanılmış oy geri alınamaz. Yalnızca karar hazırlanırken toplantıya katılan olarak seçilen üyeler oy kullanır.',
  },
  {
    id: 'imza',
    title: 'Kararı imzalama',
    steps: [
      'Oyunuzu kullandıktan sonra diğer üyeleri beklemenize gerek yoktur: oy bölümündeki “İmzalamaya geç” düğmesine basın.',
      'Açılan pencerede isterseniz karar belgesini yeni sekmede inceleyin ve inceleme onayını işaretleyin.',
      'Kayıtlı imzanız varsa hazır gelir. Yoksa “İmza görseli yükle” ile kâğıda attığınız imzanın fotoğrafını veya taranmış görselini seçin; arka plan otomatik temizlenir. Boyut, konum ve çizgi kalınlığını ayarlayıp “Bu imzayı kullan” deyin.',
      'Parolanızı girip “İmzala”ya basın. İmzanız alınır ve oylama kabulle tamamlandığında karar belgesine otomatik eklenir.',
      'Son oyu veren üye ve oylama bittikten sonra imzalayacak üyeler, karar sayfasındaki imza bölümünden imzalar.',
      'Katılan bütün üyeler imzaladığında karar “İmzalandı” durumuna geçer; PDF sistem sertifikasıyla mühürlenir. İmzalayan herkese makbuz bildirimi ve e-postası gönderilir.',
    ],
    note: 'Karar reddedilirse erken verilen imzalar kullanılmaz. Ret oyu veren katılımcılar da kabul edilen kararı imzalar. İmzanızı önceden “İmzam” sayfasından kaydedebilirsiniz. Bu imza sistem içi onay imzasıdır; nitelikli elektronik imza değildir.',
  },
  {
    id: 'takip',
    title: 'Kurul başkanı için canlı takip',
    steps: [
      'Karar sayfasında “Oy ve imza durumu” tablosu başkan için açık gelir. Her üyenin oyu (Kabul, Ret, Bekliyor) ve imza durumu (İmzaladı, İmza verdi, Bekliyor) burada görünür.',
      '“İmza verdi”, üyenin oylama sürerken imzasını verdiğini; imzanın oylama tamamlanınca karara ekleneceğini gösterir.',
      'Tablo ve sayaçlar sayfa açıkken birkaç saniyede bir kendiliğinden güncellenir.',
      'İmza aşamasında, imzası bekleyen üyelere hatırlatma e-postası taslağı hazırlayabilirsiniz.',
    ],
  },
  {
    id: 'ekler',
    title: 'Ek dosyalar, PDF ve belge doğrulama',
    steps: [
      'Kararın ek dosyalarını karar sayfasındaki “Ek Dosyaları İncele” düğmesinden görüntüleyip indirebilirsiniz.',
      'Yetkiliyseniz “Ek dosyaları yönet” ile taslak karara dosya ekleyebilir veya silebilirsiniz. Oylamaya sunulan kararın ekleri kilitlenir.',
      'İmzalanan kararın PDF’inde karekod ve doğrulama kodu bulunur. Karekodu okutan veya kodu doğrulama sayfasına yazan herkes belgenin geçerliliğini kontrol edebilir.',
      'Bütünlük kontrolü hata verirse işlemi sürdürmeden sistem yöneticisine başvurun.',
    ],
  },
  {
    id: 'arsiv',
    title: 'Arama ve arşiv',
    steps: [
      'Üst menüdeki arama simgesinden veya liste sayfalarının arama alanından konu ya da numara ile arama yapabilirsiniz.',
      'Karar listesinde durum ve toplantı tarihi filtreleriyle sonuçları daraltın.',
      'İmzalanmış, reddedilmiş ve iptal edilmiş kararları “Karar Arşivi” sayfasından inceleyin.',
    ],
  },
  {
    id: 'iptal',
    title: 'İptal ve yeniden değerlendirme',
    steps: [
      'Süreç ilerleyemiyorsa yetkili kullanıcı karar sayfasındaki “Karar Süreci” bölümünü kullanır.',
      '“Süreci Gerekçeyle İptal Et” ile gerekçe yazılarak süreç kapatılır. Eski oylar ve imza kayıtları geçmişte korunur.',
      'Yeniden değerlendirme seçeneğiyle kararın metni ve tablosu yeni bir taslağa kopyalanır; eski oylar, imzalar ve PDF aktarılmaz.',
      'Gerekli ek dosyaları yeni taslağa ayrıca yükleyin.',
    ],
    note: 'İmzalanmış karar bu işlemle iptal edilemez. Bu düğmeler yalnızca uygun durumlarda ve yetkili kullanıcılara gösterilir.',
  },
  {
    id: 'yonetim',
    title: 'Kullanıcılar ve roller',
    steps: [
      '“Kullanıcılar” sayfası, üst çubukta seçili kurulun üyelerini rollerine göre gruplanmış bir liste olarak gösterir. Kişinin ayrıntıları için adına tıklayın.',
      'Yetkiliyseniz “Kurula Kullanıcı Ekle” ile üye ekleyebilir, satırın sağındaki düğmelerle üyeyi düzenleyebilir, parolasını belirleyebilir veya kuruldan çıkarabilirsiniz.',
      '“Roller” sayfasında kurulun rolleri listelenir. Bir role tıklayarak sayfa yetkilerini görebilir, yetkiliyseniz rol ekleyip düzenleyebilirsiniz.',
      'Başka bir kurulun kullanıcılarını veya rollerini yönetmek için önce üst çubuktan o kurula geçin.',
    ],
    note: 'İşlem kayıtları yalnızca sistem yöneticisine açıktır.',
  },
  {
    id: 'hesap',
    title: 'Parola, imza ve güvenli çıkış',
    steps: [
      'Sağ üstteki hesap menüsünden “Parolamı Değiştir” ve “İmzam” sayfalarını açabilirsiniz.',
      '“İmzam” sayfasında imza görselinizi bir kez yükleyip kaydedin; kararları imzalarken hazır gelir.',
      'Parolanızı unuttuysanız giriş ekranındaki “Şifremi Unuttum” açıklamasındaki gibi sistem yöneticisine başvurun. Yönetici parolanızı sıfırladıktan sonra dilerseniz “Parolamı Değiştir” sayfasından kendi parolanızı belirleyebilirsiniz.',
      'Ortak bilgisayarlarda işiniz bittiğinde hesap menüsünden “Güvenli Çıkış” yapın.',
    ],
  },
];

export default function UserManual() {
  const navigate = useNavigate();

  const {
    token,
    user,
    unit,
    can,
    mustChangePassword,
    authChecking,
    authError,
    retryAuth,
  } = useAuth();

  const signedIn = Boolean(token && user);

  const returnTarget = !signedIn
    ? '/'
    : mustChangePassword
      ? '/parola-degistir'
      : !unit
        ? '/select-unit'
        : can('oylama', 'read')
          ? '/dashboard'
          : can('arsiv', 'read')
            ? '/archive'
            : can('yeni-karar', 'write')
              ? '/duyurular'
              : '/select-unit';

  const returnLabel = !signedIn
    ? 'Giriş ekranına dön'
    : mustChangePassword
      ? 'Parola değiştirmeye dön'
      : returnTarget === '/dashboard'
        ? 'Kurul paneline dön'
        : returnTarget === '/archive'
          ? 'Arşive dön'
          : returnTarget === '/duyurular'
            ? 'Duyurulara dön'
            : 'Kurul seçimine dön';

  const returnDisabled = Boolean(
    signedIn && (authChecking || authError)
  );

  const handleReturn = () => {
    if (returnDisabled) return;

    navigate(returnTarget, { replace: true });
  };

  const returnButton = (
    <Button
      type="button"
      startIcon={<ArrowBackIcon />}
      onClick={handleReturn}
      disabled={returnDisabled}
      variant="outlined"
      sx={{
        color: NAVY,
        borderColor: '#BCC8D8',
        bgcolor: '#fff',
        borderRadius: 2,
        textTransform: 'none',
        fontWeight: 600,
        '&:hover': {
          bgcolor: '#FFF8DE',
          borderColor: NAVY,
        },
      }}
    >
      {signedIn && authChecking
        ? 'Oturum kontrol ediliyor…'
        : returnLabel}
    </Button>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#F3F5F9',
      }}
    >
      <Box
        component="header"
        sx={{
          bgcolor: NAVY,
          color: '#fff',
          borderBottom: `4px solid ${YELLOW}`,
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            py: 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              flexShrink: 0,
              bgcolor: '#fff',
              borderRadius: 2,
              p: 1,
              boxSizing: 'border-box',
            }}
          >
            <Box
              component="img"
              src={selcukLogo}
              alt="Selçuk Üniversitesi"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                color: YELLOW,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                mb: 0.5,
              }}
            >
              SELÇUK ÜNİVERSİTESİ
            </Typography>

            <Typography
              component="h1"
              sx={{
                fontSize: { xs: 21, md: 28 },
                fontWeight: 700,
              }}
            >
              KULLANIM KILAVUZU
            </Typography>

            <Typography
              sx={{
                color: '#D2DCE9',
                fontSize: 14,
                mt: 0.5,
              }}
            >
              BÖLÜM KURUL KARAR OTOMASYONU
            </Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box sx={{ mb: 3 }}>
          {returnButton}
        </Box>

        {signedIn && authError && (
          <Alert
            severity="error"
            sx={{ mb: 3 }}
            action={
              <Button
                type="button"
                color="inherit"
                onClick={retryAuth}
              >
                Tekrar dene
              </Button>
            }
          >
            {authError}
          </Alert>
        )}

        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 3 },
            mb: 3,
            border: '1px solid #E8D79A',
            borderRadius: 3,
            bgcolor: '#FFFBEF',
          }}
        >
          <Typography
            component="h2"
            sx={{
              color: NAVY,
              fontWeight: 700,
              fontSize: 20,
              mb: 1,
            }}
          >
            Nereden başlamalıyım?
          </Typography>

          <Typography
            sx={{
              color: '#536176',
              lineHeight: 1.8,
              fontSize: 14,
            }}
          >
            Kurul başkanıysanız toplantıyı “Duyurular” sayfasından
            üyelere duyurun, ardından “Yeni Karar” sayfasında şablon
            seçip kararı hazırlayın, toplantıya katılan üyeleri işaretleyin
            ve PDF’i kontrol ederek oylamaya sunun. Kurul üyesiyseniz
            duyurulara katılım durumunuzu bildirin; kararları inceleyip
            oyunuzu kullanın ve “İmzalamaya geç” ile kararı imzalayın.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(5, minmax(0, 1fr))',
              },
              gap: 1.5,
              mt: 2.5,
            }}
          >
            {PROCESS_STEPS.map((label, index) => (
              <Box
                key={label}
                sx={{
                  p: 1.5,
                  bgcolor: '#fff',
                  border: '1px solid #EDE4C9',
                  borderRadius: 2,
                }}
              >
                <Typography
                  sx={{
                    color: '#796019',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ADIM {index + 1}
                </Typography>

                <Typography
                  sx={{
                    color: NAVY,
                    fontWeight: 700,
                    fontSize: 14,
                    mt: 0.5,
                  }}
                >
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: '245px minmax(0, 1fr)',
            },
            alignItems: 'start',
            gap: 3,
          }}
        >
          <Paper
            component="nav"
            aria-label="Kılavuz bölümleri"
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              border: '1px solid #DFE5ED',
              position: {
                xs: 'static',
                md: 'sticky',
              },
              top: 20,
              maxHeight: {
                md: 'calc(100vh - 40px)',
              },
              overflowY: {
                md: 'auto',
              },
            }}
          >
            <Typography
              sx={{
                fontWeight: 700,
                color: NAVY,
                px: 1,
                mb: 1,
              }}
            >
              İçindekiler
            </Typography>

            {SECTIONS.map((section, index) => (
              <Button
                key={section.id}
                component="a"
                href={`#${section.id}`}
                fullWidth
                sx={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  textTransform: 'none',
                  color: '#42546B',
                  fontSize: 13,
                  lineHeight: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  '&:hover': {
                    bgcolor: '#FFF8DE',
                    color: NAVY,
                  },
                }}
              >
                {index + 1}. {section.title}
              </Button>
            ))}
          </Paper>

          <Box
            component="main"
            sx={{ minWidth: 0 }}
          >
            <Alert
              severity="info"
              sx={{
                mb: 3,
                borderRadius: 2,
              }}
            >
              İmzalar, kâğıda attığınız imzanın görseli ve hesap
              parolanızla atılan sistem içi onay imzasıdır; nitelikli
              elektronik imza değildir.
            </Alert>

            {SECTIONS.map((section, index) => (
              <Paper
                key={section.id}
                id={section.id}
                component="section"
                aria-labelledby={`${section.id}-title`}
                elevation={0}
                sx={{
                  p: { xs: 2.5, md: 3 },
                  mb: 2.5,
                  border: '1px solid #DFE5ED',
                  borderRadius: 3,
                  scrollMarginTop: 24,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: YELLOW,
                      color: NAVY,
                      fontWeight: 800,
                      borderRadius: 1.5,
                    }}
                  >
                    {index + 1}
                  </Box>

                  <Typography
                    id={`${section.id}-title`}
                    component="h2"
                    sx={{
                      fontWeight: 700,
                      fontSize: 18,
                      color: NAVY,
                    }}
                  >
                    {section.title}
                  </Typography>
                </Box>

                <Box
                  component="ol"
                  sx={{
                    m: 0,
                    pl: 2.5,
                    color: '#42546B',
                    fontSize: 14,
                    lineHeight: 1.85,
                    '& li': {
                      pl: 0.5,
                      mb: 1,
                    },
                    '& li:last-child': {
                      mb: 0,
                    },
                    '& li::marker': {
                      color: NAVY,
                      fontWeight: 700,
                    },
                  }}
                >
                  {section.steps.map((step) => (
                    <li key={step}>
                      {step}
                    </li>
                  ))}
                </Box>

                {section.note && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 1.5,
                      bgcolor: '#FFFBEF',
                      borderLeft: `3px solid ${YELLOW}`,
                      borderRadius: 1,
                    }}
                  >
                    <Typography
                      sx={{
                        color: '#5C543B',
                        fontSize: 13,
                        lineHeight: 1.75,
                      }}
                    >
                      {section.note}
                    </Typography>
                  </Box>
                )}
              </Paper>
            ))}

            <Box sx={{ pt: 1, pb: 3 }}>
              {returnButton}
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}