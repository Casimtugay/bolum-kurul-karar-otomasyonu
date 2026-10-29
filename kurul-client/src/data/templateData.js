// src/data/templateData.js

// Birimlere göre şablon listesi
export const templatesByUnit = {
  'Bölüm Kurulu': [
    '2026-2027 Güz Dönemi Ders Görevlendirmeleri',
    'Staj Komisyonu Raporu Onayı',
    'Yatay Geçiş Kontenjan Belirleme'
  ],
  'Bilgisayar Müh. ABD Kurulu': [
    'Lisansüstü Tez Konusu Onayı',
    'Danışman Atama İşlemleri',
    'Yabancı Uyruklu Öğrenci Kabulü',
    'Öğrenci Mazeret Sınav Talebi'
  ],
  'Bilişim Teknolojileri ABD Kurulu': [
    'Öğrenci Kabul ve Kayıt Onayı',
    'Özel Öğrenci Başvurusu',
    'Danışman Atama İşlemleri',
    'Yabancı Uyruklu Öğrenci Kabulü'
  ]
};

// Seçilen şablona göre otomatik dolacak metinleri ve karar tablosunun sütunlarını döndürür.
// tableColumns boşsa kararda tablo olmaz.
export const rawTemplateDetails = (templateName) => {
  switch (templateName) {
    case '2026-2027 Güz Dönemi Ders Görevlendirmeleri':
      return {
        ilgili: "Dekanlığın 01.09.2026 tarihli yazısı hk.",
        gundem: templateName,
        kararMetni: "Bölümümüz öğretim üyelerinin 2026-2027 Eğitim-Öğretim yılı Güz yarıyılında verecekleri lisans ve lisansüstü ders görevlendirmelerinin, aşağıdaki tabloda belirtildiği şekliyle kabul edilmesine ve Dekanlık makamına arz edilmesine oy birliği ile karar verilmiştir.",
        eklerMetni: "",
        tableColumns: [
          { key: 'ders_kodu', label: 'Ders Kodu' },
          { key: 'ders_adi', label: 'Ders Adı' },
          { key: 'ogretim_uyesi', label: 'Öğretim Üyesi' }
        ]
      };

    case 'Danışman Atama İşlemleri':
      return {
        ilgili: "Fen Bilimleri Enstitüsü Müdürlüğünün ... tarih ve ... sayılı yazısı",
        gundem: "2026-2027 Eğitim Öğretim Yılı Güz Yarıyılı lisansüstü öğrenci danışman atamalarının görüşülmesi.",
        kararMetni: "Fen Bilimleri Enstitüsü Müdürlüğü'nün ilgili yazısı gereği, anabilim dalımıza kayıt yaptıran öğrencilere atanan danışman önerilerimiz aşağıdaki çizelgede belirtilmiş olup atanan danışmanlar oy birliğiyle uygun görülmüştür.",
        eklerMetni: "",
        tableColumns: [
          { key: 'ogrenci_no', label: 'Öğrenci Numarası' },
          { key: 'ad_soyad', label: 'Adı ve Soyadı' },
          { key: 'program', label: 'Programı' },
          { key: 'danisman', label: 'Atanan Danışman' }
        ]
      };

    case 'Yabancı Uyruklu Öğrenci Kabulü':
      return {
        ilgili: "Fen Bilimleri Enstitüsü Müdürlüğünün ... tarih ve ... sayılı yazısı",
        gundem: "... Eğitim Öğretim yılı ... yarıyılında lisansüstü eğitim için Anabilim Dalımıza kabul edilecek yabancı uyruklu öğrencilerin görüşülmesi.",
        kararMetni: "Anabilim Dalımıza müracaat eden ve kabul edilen yabancı uyruklu öğrencilerin isimleri ve atandığı danışmanlar aşağıdaki çizelgede verilmiştir. Bu yabancı uyruklu öğrencilerin kabul edilmesi ve belirtilen danışmanların atanması Anabilim Dalı Kurulumuzca oy birliği ile uygun görülmüştür.",
        eklerMetni: "",
        tableColumns: [
          { key: 'ad_soyad', label: 'Yabancı Uyruklu Öğrencinin Adı Soyadı' },
          { key: 'program', label: 'Kabul Edildiği Program' },
          { key: 'danisman', label: 'Atandığı Danışman' }
        ]
      };

    case 'Öğrenci Kabul ve Kayıt Onayı':
      return {
        ilgili: "Fen Bilimleri Enstitüsü Müdürlüğünün ... tarih ve ... sayılı yazısı",
        gundem: "Anabilim Dalımıza kabul edilen öğrencilerin kayıt işlemlerinin görüşülmesi.",
        kararMetni: "Anabilim Dalımıza kabul edilen öğrencilerin aşağıdaki çizelgede belirtilen programlara kayıtlarının yapılması oy birliği ile uygun görülmüştür.",
        eklerMetni: "",
        tableColumns: [
          { key: 'ogrenci_no', label: 'Öğrenci Numarası' },
          { key: 'ad_soyad', label: 'Adı ve Soyadı' },
          { key: 'program', label: 'Programı' }
        ]
      };

    case 'Lisansüstü Tez Konusu Onayı':
      return {
        ilgili: "Fen Bilimleri Enstitüsü Öğrenci İşleri yazısı hk.",
        gundem: "Lisansüstü tez konularının onaylanması.",
        kararMetni: "Anabilim dalımız yüksek lisans/doktora/lisansüstü öğrencilerinin tez konu önerileri incelenmiş olup, uygun olduğuna oy birliği ile karar verilmiştir.",
        eklerMetni: "1) Tez Konu Önerisi Formları",
        tableColumns: []
      };

    case '':
      // Şablon seçimi sıfırlanırsa (Özel Gündem) form temizlenir
      return { ilgili: '', gundem: '', kararMetni: '', eklerMetni: '', tableColumns: [] };

    default:
      // Tanımlı olmayan diğer tüm şablonlar için varsayılan genel bir metin doldurur
      return {
        ilgili: "İlgili yönetmelik maddesi hk.",
        gundem: templateName,
        kararMetni: `${templateName} konusu kurul üyelerince görüşülmüş olup, uygun olduğuna oy birliği ile karar verilmiştir.`,
        eklerMetni: "",
        tableColumns: []
      };

      
  }
};

// Şablon metinlerindeki sabit "oy birliği" ifadesi, oylama sonucuna göre dolacak yer tutucuya çevrilir:
// "oy birliği ile karar verilmiştir" -> "{OY_SONUCU} karar verilmiştir"
export const getTemplateDetails = (templateName) => {
  const details = rawTemplateDetails(templateName);
  return {
    ...details,
    kararMetni: (details.kararMetni || '').replace(/oy birliği ile|oy birliğiyle/g, '{OY_SONUCU}'),
  };
};

// Kurul seçimi ve sayfa başlıklarında kullanılacak tam birim adları.
export const UNIT_DISPLAY_NAMES = {
  'bilgisayar-bolum':
    'TEKNOLOJİ FAKÜLTESİ BİLGİSAYAR MÜHENDİSLİĞİ BÖLÜMÜ',

  'bilisim-abd':
    'FEN BİLİMLERİ ENSTİTÜSÜ BİLİŞİM TEKNOLOJİLERİ MÜHENDİSLİĞİ ANABİLİM DALI',

  'bilgisayar-abd':
    'FEN BİLİMLERİ ENSTİTÜSÜ BİLGİSAYAR MÜHENDİSLİĞİ ANABİLİM DALI',
};

export function getUnitDisplayName(unit) {
  return (
    UNIT_DISPLAY_NAMES[unit?.code] ||
    unit?.boardName ||
    unit?.name ||
    'Kurul seçilmedi'
  );
}