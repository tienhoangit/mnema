import React, { useRef, useState } from 'react';
import { TranscriptSegment } from '../../types';

interface ReaderYouTubeProps {
  youtubeId: string;
  title: string;
  transcript: TranscriptSegment[];
}

export const ReaderYouTube: React.FC<ReaderYouTubeProps> = ({ youtubeId, title, transcript }) => {
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  const handleSeek = (startSec: number) => {
    setCurrentTimeSec(startSec);
    youtubeIframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [startSec, true] }),
      '*'
    );
  };

  return (
    <div className="space-y-6 mb-8 font-sans">
      <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-md">
        <iframe
          ref={youtubeIframeRef}
          src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>

      {/* Transcript section */}
      {transcript.length > 0 && (
        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-800/50">
          <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-400 mb-3">
            Synchronized Transcript (Click to seek)
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2 text-sm">
            {transcript.map((seg, idx) => (
              <div
                key={idx}
                onClick={() => handleSeek(seg.startSec)}
                className={`p-2 rounded-xl hover:bg-teal-50 dark:hover:bg-neutral-700/60 transition-colors cursor-pointer flex items-start gap-3 ${
                  Math.abs(currentTimeSec - seg.startSec) < 2 ? 'bg-teal-50/80 dark:bg-teal-950/30' : ''
                }`}
              >
                <span className="text-xs font-mono text-neutral-400 mt-0.5 shrink-0">
                  {Math.floor(seg.startSec / 60)}:
                  {String(Math.floor(seg.startSec % 60)).padStart(2, '0')}
                </span>
                <p className="flex-1 leading-relaxed text-neutral-800 dark:text-neutral-200">
                  {seg.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
