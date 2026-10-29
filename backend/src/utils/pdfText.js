import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';

export const extractPdfText = async buffer => {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    if (info.total > 20) throw new Error('Reports must have at most 20 pages');
    const result = await parser.getText();
    if (result.pages.every(page => page.text.trim().length >= 30)) return { text: result.text, method: 'pdf-parse' };
    // Tesseract accepts images, not PDF bytes. Rasterize pages that lack text.
    const texts = [];
    for (const page of result.pages) {
      if (page.text.trim().length >= 30) { texts.push(page.text); continue; }
      const screenshots = await parser.getScreenshot({ partial: [page.num], desiredWidth: 1600, imageBuffer: true, imageDataUrl: false });
      const image = screenshots.pages[0]?.data;
      if (!image) throw new Error('Could not render a scanned PDF page');
      const ocr = await Tesseract.recognize(Buffer.from(image), 'eng', { logger: () => {} });
      texts.push(ocr.data.text);
    }
    return { text: texts.join('\n'), method: 'pdf-parse+tesseract' };
  } finally { await parser.destroy(); }
};
