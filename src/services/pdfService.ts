import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type SignerForPdf = {
  signerIndex: number;
  name: string;
  email: string;
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
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
};

export const generateFinalContractPdfBase64 = async (input: {
  title: string;
  contractText: string;
  signers: SignerForPdf[];
}) => {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = 800;

  const drawLine = (line: string, size = 11) => {
    if (y < 60) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = 800;
    }
    page.drawText(line, { x: 40, y, size, font, color: rgb(0, 0, 0) });
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
    drawLine(`${signer.signerIndex}. ${signer.name} (${signer.email}) - ${signer.signedAt ?? 'Pending'}`);

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
