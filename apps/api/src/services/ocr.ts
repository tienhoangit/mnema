import { Bindings } from '../types';
import { getSettings } from './settings';

export type OcrMode = 'highlights_only' | 'full_page';

export interface OcrResult {
  text: string;
  passages: string[];
  mode: OcrMode;
  model: string;
}

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiCandidatePart[];
    };
  }>;
  error?: {
    message?: string;
  };
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function normalizeBase64Image(
  rawInput: string,
  providedMimeType?: string
): { base64Data: string; mimeType: string } {
  const trimmed = rawInput.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);

  let mimeType = (providedMimeType || 'image/jpeg').toLowerCase().trim();
  let base64Data = trimmed;

  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase().trim();
    base64Data = dataUrlMatch[2].replace(/\s+/g, '');
  } else {
    base64Data = trimmed.replace(/\s+/g, '');
  }

  if (mimeType === 'image/jpg') {
    mimeType = 'image/jpeg';
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Use JPEG, PNG, or WebP.`);
  }

  if (!base64Data || base64Data.length < 16) {
    throw new Error('Invalid or empty image data.');
  }

  // ~6 MB decoded cap
  if (base64Data.length > 8_500_000) {
    throw new Error('Image is too large (max ~6MB). Please resize or crop the photo.');
  }

  return { base64Data, mimeType };
}

export async function runBookPageOcr(
  params: {
    imageBase64: string;
    mimeType?: string;
    mode?: OcrMode;
    customApiKey?: string;
  },
  env: Bindings
): Promise<OcrResult> {
  const mode: OcrMode = params.mode === 'full_page' ? 'full_page' : 'highlights_only';
  const { base64Data, mimeType } = normalizeBase64Image(params.imageBase64, params.mimeType);

  let apiKey = params.customApiKey?.trim() || env.GEMINI_API_KEY?.trim() || '';
  if (!apiKey) {
    const settings = await getSettings(env.DB);
    apiKey = settings.gemini_api_key || '';
  }

  if (!apiKey) {
    throw new Error(
      'Google Gemini API Key is required for book page OCR. Add your free key in Settings (aistudio.google.com).'
    );
  }

  const prompt =
    mode === 'highlights_only'
      ? `You are an expert book page OCR assistant. Examine this photo of a book page.
If there are underlined, highlighted, circled, or bracketed passages, extract ONLY those marked passages.
If no markings are visible, extract the main readable paragraphs cleanly, fixing broken hyphenated line wraps.
Return ONLY a valid JSON array of strings (one string per quote/passage). Example: ["First quote...", "Second quote..."]`
      : `You are an expert book page OCR assistant. Transcribe all readable text from this book page cleanly in reading order, fixing broken hyphenated line wraps and preserving paragraph breaks. Return ONLY the transcribed plain text.`;

  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = 'OCR request failed';

  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;

    if (!res.ok) {
      lastError = json.error?.message || `Gemini Vision HTTP ${res.status}`;
      if (res.status === 404) continue;
      throw new Error(lastError);
    }

    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!rawText) {
      throw new Error('No text could be extracted from this image.');
    }

    if (mode === 'highlights_only') {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as unknown;
          if (Array.isArray(parsed)) {
            const passages = parsed
              .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
              .map((p) => p.trim());
            if (passages.length > 0) {
              return {
                text: passages.join('\n\n'),
                passages,
                mode,
                model,
              };
            }
          }
        } catch {
          // Fall back to plain text splitting below
        }
      }
    }

    const cleaned = rawText.replace(/^```(?:json|text)?\s*/i, '').replace(/```$/i, '').trim();
    const passages = cleaned
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    return {
      text: cleaned,
      passages: passages.length > 0 ? passages : [cleaned],
      mode,
      model,
    };
  }

  throw new Error(lastError);
}
