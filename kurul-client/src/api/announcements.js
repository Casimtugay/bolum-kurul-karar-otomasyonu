import { apiFetch } from './client';

// Toplantı duyurusu, özel duyuru ve bildirim uçları (AnnouncementsController, NotificationsController).

// Seçili kurulun yayımlanmış toplantı duyuruları (gündem maddeleriyle birlikte).
export async function getAnnouncements() {
  const data = await apiFetch('/api/announcements');
  if (!Array.isArray(data)) throw new Error('Duyuru listesi alınamadı.');
  return data;
}

// Bir toplantının gündem taslağı ve yayın durumu (yalnızca yetkili kişi).
export async function getAgenda(meetingId, { signal } = {}) {
  return apiFetch(
    `/api/meetings/${encodeURIComponent(meetingId)}/agenda`,
    { signal }
  );
}


export async function saveAgenda(meetingId, items) {
  return apiFetch(`/api/meetings/${meetingId}/agenda`, {
    method: 'PUT',
    body: {
      items: items.map((item) => ({
        title: item.title.trim(),
        description: (item.description || '').trim(),
      })),
    },
  });
}

// Taslağı yeni sürüm olarak yayımlar ve üyelere sistem içi bildirim oluşturur.
// Aynı içerik tekrar yayımlanırsa { alreadyPublished: true } döner.
export async function publishMeeting(meetingId, expectedHash) {
  if (!expectedHash) {
    throw new Error('Önce toplantının gündemini yükleyip önizleyin.');
  }

  const query = new URLSearchParams({ expectedHash });

  return apiFetch(
    `/api/meetings/${encodeURIComponent(meetingId)}/publish?${query}`,
    { method: 'POST' }
  );
}

// Yayımlanan gündem için alıcı, konu ve metni hazırlar. E-posta gönderilmez.
export async function prepareAnnouncementEmail(meetingId) {
  return apiFetch(`/api/meetings/${meetingId}/announcement-email`, { method: 'POST' });
}

// Kullanıcının bu duyuruya ait bildirimlerini okundu yapar.
export async function markAnnouncementRead(meetingId) {
  return apiFetch(`/api/announcements/${meetingId}/read`, { method: 'POST' });
}

export async function getNotifications() {
  return apiFetch('/api/notifications');
}

export async function markNotificationRead(id) {
  return apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
}

// Kurul Başkanı'nın özel duyurusu. Kurul, seçili oturumdan alınır.
// recipientIds boşsa kurulun tüm aktif üyelerine gönderilir.
export async function publishCustomAnnouncement({
  content,
  meetingDate,
  meetingTime,
  location,
  onlineLink,
  agendaItems,
  recipientIds,
}) {
  return apiFetch('/api/announcements/custom-publish', {
    method: 'POST',
    body: {
      content,
      meetingDate,
      meetingTime,
      location,
      onlineLink,
      agendaItems,
      recipientIds,
    },
  });
}

// Üyeye gönderilen (Başkan için kurulun tüm) özel duyuruları.
export async function getCustomAnnouncements() {
  return apiFetch('/api/announcements/custom');
}

export async function markCustomAnnouncementRead(announcementId) {
  return apiFetch(`/api/announcements/custom/${announcementId}/read`, { method: 'POST' });
}

// E-postadaki kişiye özel bağlantı: giriş gerektirmez (RsvpController).
export async function getRsvp(token) {
  return apiFetch(`/api/rsvp/${encodeURIComponent(token)}`, { auth: false });
}

export async function answerRsvp(token, intent) {
  return apiFetch(`/api/rsvp/${encodeURIComponent(token)}`, {
    method: 'POST',
    auth: false,
    body: { intent },
  });
}

// intent: 'Katilacak' | 'Katilmayacak'
export async function updateAnnouncementAttendance(announcementId, intent) {
  return apiFetch(`/api/announcements/${announcementId}/attendance`, {
    method: 'POST',
    body: { intent },
  });
}

export async function markAllNotificationsRead() {
  return apiFetch('/api/notifications/read-all', { method: 'POST' });
}

// Zil simgesinin sayacını yenilemek için.
export const refreshNotifications = () => {
  window.dispatchEvent(new Event('notifications:refresh'));
};