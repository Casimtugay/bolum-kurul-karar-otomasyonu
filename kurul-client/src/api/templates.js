import { apiFetch } from './client';

// Kurulun kendi karar şablonları (hazır şablonlara ek).
export const listTemplates = () => apiFetch('/api/templates');

export const saveTemplate = (template) =>
  template.id
    ? apiFetch(`/api/templates/${template.id}`, { method: 'PUT', body: template })
    : apiFetch('/api/templates', { method: 'POST', body: template });

export const deleteTemplate = (id) =>
  apiFetch(`/api/templates/${id}`, { method: 'DELETE' });

// Dosyadan düz metin çıkarır: PDF (pdf.js) veya Word .docx (docx-preview).
// Taranmış (resim) PDF'lerde metin katmanı olmadığından boş döner.
export async function extractDocumentText(file) {
  const name = (file?.name || '').toLowerCase();

  if (name.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join(''));
    }
    return pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  if (name.endsWith('.docx')) {
    const { renderAsync } = await import('docx-preview');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px';
    document.body.appendChild(host);
    try {
      await renderAsync(file, host, null, { inWrapper: false, experimental: false });
      return host.innerText.replace(/\n{3,}/g, '\n\n').trim();
    } finally {
      host.remove();
    }
  }

  throw new Error('Yalnızca PDF veya Word (.docx) dosyası içe aktarılabilir.');
}

// "İLGİ:", "GÜNDEM:", "KARAR:", "EKLER:" başlıklı resmi yazılardan alanları ayıklamayı dener.
export function splitDecisionText(text) {
  const labels = [
    ['reference', /^\s*İLG[İI]\s*[:：]/im],
    ['agenda', /^\s*GÜNDEM(?:\s*MADDES[İI])?\s*[:：]/im],
    ['content', /^\s*KARAR\s*[:：]/im],
    ['attachmentsNote', /^\s*EK(?:LER)?\s*[:：]/im],
  ];

  const found = labels
    .map(([key, re]) => {
      const match = re.exec(text);
      return match ? { key, start: match.index, bodyStart: match.index + match[0].length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  // Üye/imza listesi şablona alınmaz: sistem bunu kurul üyelerinden kendisi üretir.
  const membersAt = text.search(/^.*Kurulu?\s+Üyeleri\s*$/im);
  const limit = membersAt > 0 ? membersAt : text.length;

  // PDF satır sonlarında bölünen cümleler birleştirilir; paragraf (boş satır) korunur.
  const tidy = (part) => part
    .replace(/\s+\n/g, '\n')
    .replace(/([^.\n:;])\n(?=[^\n])/g, '$1 ')
    .trim();

  if (!found.length) return { content: tidy(text.slice(0, limit)) };

  const result = {};
  found.forEach((item, i) => {
    const end = Math.min(i + 1 < found.length ? found[i + 1].start : text.length, limit > item.start ? limit : text.length);
    result[item.key] = tidy(text.slice(item.bodyStart, end));
  });
  return result;
}
