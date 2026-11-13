import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import { Highlight, HighlightColor, ReaderSettings } from '../../types';
import { api } from '../../services/api';

const LazyEpubReaderPane = lazy(() =>
  import('../EpubReaderPane').then((m) => ({ default: m.EpubReaderPane }))
);

interface ReaderEpubProps {
  sourceId: string;
  initialProgress: number;
  settings: ReaderSettings;
  highlights: Highlight[];
  onCreateHighlight: (data: { content: string; note?: string; color: HighlightColor; location?: string }) => Promise<void>;
}

export const ReaderEpub: React.FC<ReaderEpubProps> = ({
  sourceId,
  initialProgress,
  settings,
  highlights,
  onCreateHighlight,
}) => {
  return (
    <Suspense
      fallback={
        <div className="py-12 flex items-center justify-center gap-2 text-xs text-neutral-500 font-sans">
          <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
          <span>Loading EPUB reader...</span>
        </div>
      }
    >
      <LazyEpubReaderPane
        sourceId={sourceId}
        initialProgress={initialProgress}
        settings={settings}
        highlights={highlights}
        onCreateHighlight={onCreateHighlight}
        onUpdateProgress={(progress) => {
          void api.updateSource(sourceId, { progress });
        }}
      />
    </Suspense>
  );
};
