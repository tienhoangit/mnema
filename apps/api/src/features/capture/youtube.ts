export interface TranscriptSegment {
  text: string;
  startSec: number;
  durationSec: number;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchYouTubeTranscript(videoId: string): Promise<{
  title: string;
  author: string;
  segments: TranscriptSegment[];
}> {
  // Fetch video page to get player captions info
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(videoUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    console.warn(`[YouTube] Failed to fetch video page ${videoId}: HTTP ${res.status}`);
  }

  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  let title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'YouTube Video';

  // Extract author
  const authorMatch = html.match(/"author":"(.*?)"/);
  const author = authorMatch ? authorMatch[1] : 'YouTube Creator';

  // Extract caption tracks from ytInitialPlayerResponse
  const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
  let captionUrl: string | null = null;
  let warning: string | undefined;

  if (!playerResponseMatch) {
    warning = `YouTube player response marker missing for video ${videoId} (rate-limited or consent page)`;
    console.warn(`[YouTube] ${warning}`);
  } else {
    try {
      const data = JSON.parse(playerResponseMatch[1]);
      const tracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length > 0) {
        // Prefer English or Vietnamese or first available
        const preferred =
          tracks.find((t: any) => t.languageCode === 'en' || t.languageCode === 'vi') ||
          tracks[0];
        captionUrl = preferred?.baseUrl || null;
      } else {
        warning = `No caption tracks found for YouTube video ${videoId}`;
        console.warn(`[YouTube] ${warning}`);
      }
    } catch (err) {
      warning = `Failed to parse YouTube player response for ${videoId}`;
      console.warn(`[YouTube] ${warning}:`, err);
    }
  }

  const segments: TranscriptSegment[] = [];

  if (captionUrl) {
    // Request caption in XML or JSON format
    const captionRes = await fetch(`${captionUrl}&fmt=json3`);
    if (captionRes.ok) {
      try {
        const json: any = await captionRes.json();
        const events = json.events || [];
        for (const ev of events) {
          if (ev.segs && ev.tStartMs !== undefined) {
            const text = ev.segs.map((s: any) => s.utf8 || '').join('').trim();
            if (text) {
              segments.push({
                text,
                startSec: ev.tStartMs / 1000,
                durationSec: (ev.dDurationMs || 2000) / 1000,
              });
            }
          }
        }
      } catch {}
    }
  }

  return {
    title,
    author,
    segments,
    ...(warning ? { warning } : {}),
  };
}
