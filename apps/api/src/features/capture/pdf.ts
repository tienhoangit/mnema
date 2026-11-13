function decodePdfLiteralString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === 'n') {
        out += '\n';
        i++;
      } else if (next === 'r') {
        out += '\r';
        i++;
      } else if (next === 't') {
        out += '\t';
        i++;
      } else if (next === '(' || next === ')' || next === '\\') {
        out += next;
        i++;
      } else if (/[0-7]{1,3}/.test(raw.slice(i + 1, i + 4))) {
        const octMatch = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
        if (octMatch) {
          out += String.fromCharCode(parseInt(octMatch[0], 8));
          i += octMatch[0].length;
        }
      } else {
        out += next;
        i++;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (!clean) return '';
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2).padEnd(2, '0');
    bytes.push(parseInt(pair, 16) || 0);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  return bytes.map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : b === 0 ? '' : String.fromCharCode(b))).join('');
}

function isPdfDelimiterOrSpace(ch: string | undefined): boolean {
  return (
    ch === undefined ||
    ch === ' ' ||
    ch === '\t' ||
    ch === '\r' ||
    ch === '\n' ||
    ch === '\f' ||
    ch === '\0' ||
    ch === '(' ||
    ch === ')' ||
    ch === '<' ||
    ch === '>' ||
    ch === '[' ||
    ch === ']' ||
    ch === '{' ||
    ch === '}' ||
    ch === '/' ||
    ch === '%'
  );
}

function extractBtEtBlocks(contentStream: string): string[] {
  const blocks: string[] = [];
  let inLiteral = false;
  let parenDepth = 0;
  let inHex = false;
  let inComment = false;
  let blockStart = -1;

  for (let i = 0; i < contentStream.length; i++) {
    const ch = contentStream[i];

    if (inComment) {
      if (ch === '\n' || ch === '\r') inComment = false;
      continue;
    }

    if (inLiteral) {
      if (ch === '\\') {
        i++; // skip escaped character
      } else if (ch === '(') {
        parenDepth++;
      } else if (ch === ')') {
        parenDepth--;
        if (parenDepth <= 0) {
          inLiteral = false;
          parenDepth = 0;
        }
      }
      continue;
    }

    if (inHex) {
      if (ch === '>') inHex = false;
      continue;
    }

    if (ch === '%') {
      inComment = true;
      continue;
    }
    if (ch === '(') {
      inLiteral = true;
      parenDepth = 1;
      continue;
    }
    if (ch === '<' && contentStream[i + 1] !== '<') {
      inHex = true;
      continue;
    }

    if (
      blockStart === -1 &&
      ch === 'B' &&
      contentStream[i + 1] === 'T' &&
      isPdfDelimiterOrSpace(contentStream[i - 1]) &&
      isPdfDelimiterOrSpace(contentStream[i + 2])
    ) {
      blockStart = i + 2;
      i++;
      continue;
    }

    if (
      blockStart !== -1 &&
      ch === 'E' &&
      contentStream[i + 1] === 'T' &&
      isPdfDelimiterOrSpace(contentStream[i - 1]) &&
      isPdfDelimiterOrSpace(contentStream[i + 2])
    ) {
      blocks.push(contentStream.slice(blockStart, i));
      blockStart = -1;
      i++;
    }
  }

  return blocks.length > 0 ? blocks : [contentStream];
}

function extractTextOperators(contentStream: string): string {
  const chunks: string[] = [];
  const btBlocks = extractBtEtBlocks(contentStream);

  for (const block of btBlocks) {
    // Match TJ arrays: [(abc) -20 (def)] TJ or [<0041> -20] TJ
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let arrMatch: RegExpExecArray | null;
    while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = arrMatch[1];
      const tokenRegex = /\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>/g;
      let tMatch: RegExpExecArray | null;
      let line = '';
      while ((tMatch = tokenRegex.exec(inner)) !== null) {
        if (tMatch[0].startsWith('(')) {
          line += decodePdfLiteralString(tMatch[0].slice(1, -1));
        } else if (tMatch[1]) {
          line += decodePdfHexString(tMatch[1]);
        }
      }
      if (line.trim()) chunks.push(line);
    }

    // Match Tj operators: (abc) Tj
    const tjRegex = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = decodePdfLiteralString(tjMatch[1]);
      if (decoded.trim()) chunks.push(decoded);
    }

    // Match hex Tj operators: <0041> Tj
    const hexTjRegex = /<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|")/g;
    let hexMatch: RegExpExecArray | null;
    while ((hexMatch = hexTjRegex.exec(block)) !== null) {
      const decoded = decodePdfHexString(hexMatch[1]);
      if (decoded.trim()) chunks.push(decoded);
    }
  }

  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

async function tryDecompressFormat(
  bytes: Uint8Array,
  format: 'deflate' | 'deflate-raw'
): Promise<string | null> {
  try {
    const ds = new DecompressionStream(format);
    const resPromise = new Response(ds.readable).arrayBuffer();
    const writer = ds.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    const res = await resPromise;
    return new TextDecoder('latin1').decode(new Uint8Array(res));
  } catch {
    return null;
  }
}

async function decompressFlate(bytes: Uint8Array): Promise<string | null> {
  const candidates: Uint8Array[] = [bytes];
  // PDF spec allows an EOL (\r\n, \n, \r) before `endstream` that is not part of the stream
  if (bytes.length >= 2 && bytes[bytes.length - 2] === 13 && bytes[bytes.length - 1] === 10) {
    candidates.push(bytes.subarray(0, bytes.length - 2));
  } else if (bytes.length >= 1 && (bytes[bytes.length - 1] === 10 || bytes[bytes.length - 1] === 13)) {
    candidates.push(bytes.subarray(0, bytes.length - 1));
  }

  for (const candidate of candidates) {
    const zlibOut = await tryDecompressFormat(candidate, 'deflate');
    if (zlibOut !== null) return zlibOut;
    const rawOut = await tryDecompressFormat(candidate, 'deflate-raw');
    if (rawOut !== null) return rawOut;
  }
  return null;
}

export async function extractTextFromPdfBytes(pdfBytes: Uint8Array): Promise<string> {
  const rawLatin = new TextDecoder('latin1').decode(pdfBytes);
  if (!rawLatin.includes('%PDF')) {
    throw new Error('Invalid PDF file header');
  }

  const extractedParts: string[] = [];
  let cursor = 0;

  while (cursor < rawLatin.length) {
    const streamStart = rawLatin.indexOf('stream', cursor);
    if (streamStart === -1) break;

    const dictStart = Math.max(0, rawLatin.lastIndexOf('<<', streamStart));
    const dict = rawLatin.slice(dictStart, streamStart);

    let dataStart = streamStart + 6;
    if (rawLatin[dataStart] === '\r' && rawLatin[dataStart + 1] === '\n') {
      dataStart += 2;
    } else if (rawLatin[dataStart] === '\n' || rawLatin[dataStart] === '\r') {
      dataStart += 1;
    }

    const streamEnd = rawLatin.indexOf('endstream', dataStart);
    if (streamEnd === -1) break;

    const lenMatch = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    const exactEnd = lenMatch
      ? Math.min(streamEnd, dataStart + parseInt(lenMatch[1], 10))
      : streamEnd;

    let textCandidate: string | null = null;
    if (dict.includes('/FlateDecode')) {
      const slice = pdfBytes.slice(dataStart, exactEnd);
      textCandidate = await decompressFlate(slice);
    } else {
      textCandidate = rawLatin.slice(dataStart, exactEnd);
    }

    if (textCandidate && (textCandidate.includes('Tj') || textCandidate.includes('TJ'))) {
      const text = extractTextOperators(textCandidate);
      if (text) extractedParts.push(text);
    }

    cursor = streamEnd + 9;
  }

  const combined = extractedParts.join('\n\n').trim();
  if (!combined) {
    throw new Error(
      'Could not extract readable text from this PDF (it may be scanned images — try OCR Scan instead).'
    );
  }
  return combined;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatPdfPagesToHtml(pages: string[], fallbackText?: string): {
  html: string;
  wordCount: number;
  readingTime: number;
} {
  const cleanedPages = pages.map((p) => p.trim()).filter(Boolean);
  let html = '';
  let plainText = '';

  if (cleanedPages.length > 0) {
    html = cleanedPages
      .map((pageText, idx) => {
        const paragraphs = pageText
          .split(/\n{2,}/)
          .map((para) => para.trim())
          .filter(Boolean)
          .map((para) => `<p>${escapeHtml(para).replace(/\n/g, ' ')}</p>`)
          .join('\n');
        return `<section data-pdf-page="${idx + 1}"><h3>Page ${idx + 1}</h3>\n${paragraphs}</section>`;
      })
      .join('\n<hr/>\n');
    plainText = cleanedPages.join(' ');
  } else {
    const text = (fallbackText || '').trim();
    html = text
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, ' ')}</p>`)
      .join('\n');
    plainText = text;
  }

  const words = plainText.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.round(words / 200));

  return { html, wordCount: words, readingTime };
}
