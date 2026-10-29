import { apiFetch, apiRequest, readApiJson } from './client';

// "Belge Doğrula": giriş gerektirmez.
export async function getVerification(code) {
  return apiFetch(`/api/verify/${encodeURIComponent(code)}`, { auth: false });
}

// Elindeki PDF'nin kayıtlı PDF'lerden biriyle birebir aynı olup olmadığını sorar.
export async function checkVerificationFile(code, file) {
  const body = new FormData();
  body.append('file', file);
  const response = await apiRequest(`/api/verify/${encodeURIComponent(code)}/file`, {
    method: 'POST',
    auth: false,
    body,
  });
  return readApiJson(response);
}
