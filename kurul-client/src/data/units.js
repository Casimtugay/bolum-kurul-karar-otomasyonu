import { apiFetch } from '../api/client';

// Eski importlarla geçici uyumluluk.
// Gerçek kurul bilgileri bu diziden okunmamalıdır.
export const UNITS = Object.freeze([]);

const requiredFields = [
  'code',
  'name',
  'unitType',
  'parentName',
  'boardName',
  'titleLine1',
  'titleLine2',
  'membersLabel',
  'logo',
];

function normalizeUnit(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    requiredFields.some(
      (field) =>
        typeof data[field] !== 'string' ||
        !data[field].trim()
    )
  ) {
    throw new Error(
      'Kurulun başlık veya logo bilgileri eksik.'
    );
  }

  // Logolar uygulamanın public klasöründen sunulur.
  // Harici adres veya başka sunucuya yönlenen // adresi kabul edilmez.
  if (
    !data.logo.startsWith('/') ||
    data.logo.startsWith('//') ||
    data.logo.includes('\\')
  ) {
    throw new Error('Kurulun logo yolu geçersiz.');
  }

  return {
    ...data,
    academicUnitId: data.id,
    id: data.code,
  };
}

export async function getCurrentUnit() {
  return normalizeUnit(
    await apiFetch('/api/units/current')
  );
}

export async function getDecisionUnit(decisionId) {
  return normalizeUnit(
    await apiFetch(
      `/api/units/for-decision/${encodeURIComponent(decisionId)}`
    )
  );
}

// Bilinmeyen değer hiçbir zaman başka bir kurula dönüştürülmez.
// Eski bir ekran kullanıyorsa API'den aldığı listeyi ikinci argümanla vermelidir.
export function findUnit(value = '', units = []) {
  const target = String(value)
    .trim()
    .toLocaleLowerCase('tr-TR');

  if (!target || !Array.isArray(units)) return null;

  return (
    units.find((unit) =>
      [unit.code, unit.id, unit.boardName].some(
        (candidate) =>
          typeof candidate === 'string' &&
          candidate
            .trim()
            .toLocaleLowerCase('tr-TR') === target
      )
    ) || null
  );
}