import Tesseract from 'tesseract.js';
import { it, expect, vi } from 'vitest';
import { extractPdfText } from '../src/utils/pdfText.js';

// A complete tiny PDF fixture, built without a second PDF library.
function makePdf(text) {
  const stream = `BT /F1 12 Tf 40 200 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}
it('extracts an actual PDF using the installed pdf-parse v2 API', async () => {
  const result = await extractPdfText(makePdf('Health report: glucose 100 mg/dl and HbA1c 5.5 percent'));
  expect(result.text).toContain('glucose 100');
  expect(result.method).toBe('pdf-parse');
});

it('rasterizes PDF pages before passing them to image OCR', async () => {
  const recognize = vi.spyOn(Tesseract, 'recognize').mockResolvedValue({ data: { text: 'Scanned report glucose 100 mg/dl' } });
  try {
    const result = await extractPdfText(makePdf(''));
    expect(result.method).toBe('pdf-parse+tesseract');
    expect(result.text).toContain('Scanned report');
    const image = recognize.mock.calls[0][0];
    expect(Buffer.isBuffer(image)).toBe(true);
    expect(image.subarray(0, 5).toString()).not.toBe('%PDF-');
  } finally { recognize.mockRestore(); }
});
