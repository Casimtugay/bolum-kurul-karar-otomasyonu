// JSON ve dosya istekleri aynı adresi, hata ve oturum kontrolünü kullanır.
export const API_BASE = (
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5020' : '')
).trim().replace(/\/+$/, '');
const K = { token: 'kurul_token', user: 'kurul_user', units: 'kurul_units', unit: 'kurul_unit' };
const read = (key) => {
  try { const value = sessionStorage.getItem(key); return value ? JSON.parse(value) : null; }
  catch { return null; }
};
export const getToken = () => sessionStorage.getItem(K.token);
export const getStoredUnit = () => read(K.unit);
export const loadSession = () => ({
  token: getToken(), user: read(K.user), unit: getStoredUnit(),
  units: Array.isArray(read(K.units)) ? read(K.units) : [],
});
export const saveLogin = (data) => {
  sessionStorage.setItem(K.token, data.token);
  sessionStorage.setItem(K.user, JSON.stringify(data.user));
  sessionStorage.setItem(K.units, JSON.stringify(Array.isArray(data.units) ? data.units : []));
  sessionStorage.removeItem(K.unit);
};
export const saveUnit = (token, unit) => {
  sessionStorage.setItem(K.token, token);
  sessionStorage.setItem(K.unit, JSON.stringify(unit));
  try { localStorage.setItem(LAST_UNIT_KEY, unit.code); } catch { /* yoksay */ }
};

// Girişten sonra son çalışılan kurul kendiliğinden açılır (yalnızca kurul kodu saklanır).
const LAST_UNIT_KEY = 'kurul_last_unit';
export const getLastUnitCode = () => {
  try { return localStorage.getItem(LAST_UNIT_KEY); } catch { return null; }
};
export const clearSession = () => Object.values(K).forEach((key) => sessionStorage.removeItem(key));

// Giriş gerektiren bir bağlantıyla (ör. e-postadaki "Katılıyorum") gelindiğinde
// adres saklanır; giriş ve kurul seçiminden sonra kullanıcı oraya döner.
const RETURN_KEY = 'kurul_return_to';
const isSafePath = (path) => typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
export const rememberReturnPath = (path) => {
  try { if (isSafePath(path) && path !== '/') sessionStorage.setItem(RETURN_KEY, path); } catch { /* yoksay */ }
};
export const takeReturnPath = () => {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return isSafePath(path) ? path : null;
  } catch { return null; }
};
export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status; }
}
const fallbackError = (status) => ({
  400: 'Gönderilen bilgileri kontrol edin.',
  401: 'Kullanıcı adı veya parola hatalı ya da oturum geçersiz.',
  403: 'Bu işlem için yetkiniz yok.', 404: 'İstenen kayıt bulunamadı.',
  409: 'Kayıt başka bir işlemle değişti. Güncel bilgileri yükleyin.',
  413: 'Gönderilen veri izin verilen boyutu aşıyor.',
  415: 'Bu dosya veya veri türü desteklenmiyor.',
  429: 'Çok fazla istek gönderildi. Biraz sonra tekrar deneyin.',
}[status] || `İstek başarısız (${status}).`);
const errorMessage = (data, status) => {
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (data?.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
    const messages = Object.values(data.errors).flat().filter((m) => typeof m === 'string' && m.trim());
    if (messages.length) return messages.join('\n');
  }
  return typeof data?.title === 'string' && data.title.trim() ? data.title : fallbackError(status);
};
const transportError = (error) => {
  if (error instanceof ApiError || error?.name === 'AbortError') return error;
  return new ApiError('Sunucuya bağlanılamadı veya yanıt tamamlanamadı. Tekrar denemeden önce işlem sonucunu kontrol edin.', 0);
};
// json=false iken FormData veya boş body gönderilir; Content-Type tarayıcıya bırakılır.
export async function apiRequest(path, { method = 'GET', body, auth = true, signal, json = false } = {}) {
  const token = auth ? getToken() : null;
  if (auth && !token) {
    clearSession(); window.location.replace('/');
    throw new ApiError('Devam etmek için giriş yapmalısınız.', 401);
  }
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers.Accept = 'application/json';
  if (json && body !== undefined) headers['Content-Type'] = 'application/json';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let response;
  try {
    response = await fetch(`${API_BASE}${normalizedPath}`, {
      method, headers, signal,
      body: json && body !== undefined ? JSON.stringify(body) : body,
    });
    if (response.status === 401 && token) {
      // Eski isteğin yanıtı yeni girişin token'ını silmesin.
      if (getToken() === token) { clearSession(); window.location.replace('/'); }
      throw new ApiError('Oturum geçersiz veya süresi dolmuş. Tekrar giriş yapın.', 401);
    }
    if (!response.ok) {
      let data = null;
      const text = await response.text();
      try { data = text ? JSON.parse(text) : null; } catch { /* Genel mesaj kullanılır. */ }
      throw new ApiError(errorMessage(data, response.status), response.status);
    }
    return response;
  } catch (error) { throw transportError(error); }
}
export async function readApiJson(response) {
  try {
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text.trim()) return null;
    try { return JSON.parse(text); }
    catch { throw new ApiError('Sunucudan beklenmeyen bir yanıt alındı. Tekrar denemeden önce işlem sonucunu kontrol edin.', response.status); }
  } catch (error) { throw transportError(error); }
}
export async function readApiBlob(response) {
  try { return await response.blob(); } catch (error) { throw transportError(error); }
}
export async function apiFetch(path, options = {}) {
  return readApiJson(await apiRequest(path, { ...options, json: true }));
}
