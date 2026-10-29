import { apiFetch, apiRequest, readApiJson, readApiBlob, ApiError } from './client';
const base = (id) => `/api/decisions/${encodeURIComponent(id)}/attachments`;
export async function listAttachments(id) { return apiFetch(base(id)); }
export async function uploadAttachments(id, files) {
  const selected = Array.from(files || []);
  if (!selected.length) throw new ApiError('Yüklemek için en az bir dosya seçin.', 400);
  if (selected.some((file) => !(file instanceof File)))
    throw new ApiError('Dosya seçimi geçersiz. Dosyaları yeniden seçin.', 400);
  const form = new FormData();
  selected.forEach((file) => form.append('files', file));
  return readApiJson(await apiRequest(base(id), { method: 'POST', body: form }));
}
export async function deleteAttachment(id, attachmentId) {
  await apiRequest(`${base(id)}/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' });
}
// Önizleme için dosyanın içeriği (indirmeden).
export async function fetchAttachmentBlob(id, attachment) {
  if (attachment?.id == null) throw new ApiError('Önizlenecek dosya bilgisi bulunamadı.', 400);
  return readApiBlob(await apiRequest(`${base(id)}/${encodeURIComponent(attachment.id)}`));
}
export async function downloadAttachment(id, attachment) {
  if (attachment?.id == null) throw new ApiError('İndirilecek dosya bilgisi bulunamadı.', 400);
  const response = await apiRequest(`${base(id)}/${encodeURIComponent(attachment.id)}`);
  const url = URL.createObjectURL(await readApiBlob(response));
  const link = document.createElement('a');
  try {
    link.href = url; link.download = attachment.name || 'ek-dosya';
    document.body.appendChild(link); link.click();
  } finally {
    link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export async function verifyAttachments(id) { return apiFetch(`${base(id)}/verify`); }
