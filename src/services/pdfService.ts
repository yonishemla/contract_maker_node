import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { env } from '../config';

type SignerForPdf = {
  signerIndex: number;
  name: string;
  idNumber: string;
  email: string | null;
  signedAt: string | null;
  signatureDataUrl: string | null;
};

const wrapText = (text: string, maxChars = 95) => {
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= maxChars) {
      lines.push(rawLine);
      continue;
    }

    let current = '';
    const words = rawLine.split(' ');
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
};

const resolveFontCandidates = () => {
  const fromEnv = env.PDF_FONT_PATH?.trim();
  const localCandidates = [
    path.resolve(process.cwd(), 'assets/fonts/NotoSansHebrew-Regular.ttf'),
    path.resolve(process.cwd(), 'assets/fonts/DejaVuSans.ttf')
  ];

  const systemCandidates = process.platform === 'win32'
    ? [
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/calibri.ttf',
        'C:/Windows/Fonts/segoeui.ttf'
      ]
    : [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
      ];

  return [fromEnv, ...localCandidates, ...systemCandidates].filter((x): x is string => Boolean(x));
};

const loadUnicodeFont = async (pdfDoc: PDFDocument): Promise<PDFFont | null> => {
  const candidates = resolveFontCandidates();
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      const bytes = fs.readFileSync(candidate);
      pdfDoc.registerFontkit(fontkit);
      const embedded = await pdfDoc.embedFont(bytes, { subset: true });
      console.log(`[PDF] Using Unicode font: ${candidate}`);
      return embedded;
    } catch (error) {
      console.warn(`[PDF] Failed loading font '${candidate}':`, error);
    }
  }

  return null;
};

const safeDraw = (
  page: ReturnType<PDFDocument['addPage']>,
  font: PDFFont,
  line: string,
  x: number,
  y: number,
  size: number
) => {
  try {
    page.drawText(line, { x, y, size, font, color: rgb(0, 0, 0) });
  } catch {
    const asciiFallback = line.replace(/[^\x20-\x7E]/g, '?');
    page.drawText(asciiFallback, { x, y, size, font, color: rgb(0, 0, 0) });
  }
};

export const generateFinalContractPdfBase64 = async (input: {
  title: string;
  contractText: string;
  signers: SignerForPdf[];
}) => {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]);

  const unicodeFont = await loadUnicodeFont(pdfDoc);
  const font = unicodeFont ?? await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = 800;

  const drawLine = (line: string, size = 11) => {
    if (y < 60) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = 800;
    }
    safeDraw(page, font, line, 40, y, size);
    y -= size + 5;
  };

  drawLine(input.title, 16);
  y -= 8;

  for (const line of wrapText(input.contractText)) {
    drawLine(line);
  }

  y -= 12;
  drawLine('Signed by:', 13);

  for (const signer of input.signers) {
    const signerMeta = [
      signer.idNumber ? `ID: ${signer.idNumber}` : null,
      signer.email ? `Email: ${signer.email}` : null
    ].filter(Boolean).join(', ');

    drawLine(`${signer.signerIndex}. ${signer.name}${signerMeta ? ` (${signerMeta})` : ''} - ${signer.signedAt ?? 'Pending'}`);

    if (signer.signatureDataUrl?.startsWith('data:image/png;base64,')) {
      try {
        const imageBytes = signer.signatureDataUrl.replace('data:image/png;base64,', '');
        const pngImage = await pdfDoc.embedPng(Buffer.from(imageBytes, 'base64'));
        const scaled = pngImage.scale(0.2);

        if (y - scaled.height < 60) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = 800;
        }

        page.drawImage(pngImage, {
          x: 60,
          y: y - scaled.height,
          width: scaled.width,
          height: scaled.height
        });
        y -= scaled.height + 12;
      } catch {
        drawLine('[Signature image could not be embedded]');
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
};
