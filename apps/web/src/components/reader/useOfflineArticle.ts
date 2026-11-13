import { useState, useEffect } from 'react';
import { Source } from '../../types';
import {
  saveArticleOffline,
  getArticleOffline,
  getPendingHighlights,
  syncPendingHighlights,
  PendingHighlight,
} from '../../services/offlineDb';

export function useOfflineArticle(source: Source) {
  const [offlineFallbackHtml, setOfflineFallbackHtml] = useState<string | null>(null);
  const [, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [localPendingHighlights, setLocalPendingHighlights] = useState<PendingHighlight[]>([]);

  useEffect(() => {
    if (source.content_html && source.content_html.trim().length > 0) {
      saveArticleOffline(source);
    } else {
      getArticleOffline(source.id).then((cached) => {
        if (cached?.content_html) {
          setOfflineFallbackHtml(cached.content_html);
        }
      });
    }

    const onOnline = () => setIsOffline(false);
    const onOffline = () => {
      setIsOffline(true);
      if (!source.content_html) {
        getArticleOffline(source.id).then((cached) => {
          if (cached?.content_html) setOfflineFallbackHtml(cached.content_html);
        });
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [source.id, source.content_html]);

  useEffect(() => {
    const runSync = () => {
      void syncPendingHighlights();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        runSync();
      }
    };
    runSync();
    window.addEventListener('online', runSync);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', runSync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Load any pending offline highlights for this source & remove those already synced to server
  useEffect(() => {
    let active = true;
    getPendingHighlights().then((all) => {
      if (!active) return;
      const syncedContents = new Set((source.highlights || []).map((h) => h.content.trim()));
      setLocalPendingHighlights(
        all.filter((p) => p.source_id === source.id && !syncedContents.has(p.content.trim()))
      );
    });
    return () => {
      active = false;
    };
  }, [source.id, source.highlights]);

  return {
    offlineFallbackHtml,
    localPendingHighlights,
    setLocalPendingHighlights,
  };
}
