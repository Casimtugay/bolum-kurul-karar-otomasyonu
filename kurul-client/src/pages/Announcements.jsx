import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import {
  CustomAnnouncementForm,
  CustomAnnouncementList,
} from '../components/CustomAnnouncements';

// Kurul duyuruları: Başkan duyuru yayımlar, üyeler katılım durumunu bildirir.
// (Toplantı gündemini ayrıca yayımlama paneli istenmediği için kaldırıldı.)
export default function Announcements() {
  const { unit, isAdmin } = useAuth();
  // Özel duyuruyu sunucu yalnızca kurul Başkanı ve sistem yöneticisi için kabul eder.
  const isBaskan = isAdmin || unit?.unitRole === 'Baskan';

  return (
    <PageLayout title="Kurul Duyuruları">
      {isBaskan && <CustomAnnouncementForm key={`custom:${unit?.code || ''}`} />}

      <CustomAnnouncementList
        key={`custom-list:${unit?.code || ''}`}
        canManage={isBaskan}
      />
    </PageLayout>
  );
}
