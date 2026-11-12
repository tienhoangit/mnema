import React, { useState } from 'react';
import { X, Sparkles, Send, Loader2, Key, Bot } from 'lucide-react';

interface AiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  articleTitle: string;
  articleContentText: string;
}

const GEMINI_KEY_STORAGE = 'mnema_gemini_api_key';

export const AiCopilotModal: React.FC<AiCopilotModalProps> = ({
  isOpen,
  onClose,
  articleTitle,
  articleContentText,
}) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(GEMINI_KEY_STORAGE) || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
  };

  const askAi = async (promptQuery: string) => {
    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Key': apiKey,
        },
        body: JSON.stringify({
          question: promptQuery,
          context: `Title: ${articleTitle}\n\nContent:\n${articleContentText.slice(0, 4000)}`,
          apiKey: apiKey || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to get AI response');
      setAnswer(json.data.answer);
    } catch (err: any) {
      setError(err.message || 'Error communicating with AI');
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    'Summarize this article in 3 key bullet points',
    'What are the core arguments and insights?',
    'Give me 3 actionable steps based on this reading',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 text-neutral-900 dark:text-white font-semibold">
            <Sparkles className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <span>AI Copilot & Summarizer</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs flex items-center gap-1"
              title="Configure Gemini API Key"
            >
              <Key className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* API Key setting banner */}
          {showKeyInput && (
            <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 space-y-2 text-xs">
              <label className="font-semibold block text-neutral-700 dark:text-neutral-300">
                Google Gemini API Key (Free tier):
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKey}
                onChange={(e) => handleSaveKey(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-neutral-800 dark:text-white"
              />
              <p className="text-[11px] text-neutral-500">
                Stored locally in your browser. Get your free key at{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-teal-700"
                >
                  Google AI Studio
                </a>.
              </p>
            </div>
          )}

          {/* Quick Prompts */}
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Quick Inquiries
            </p>
            <div className="flex flex-col gap-1.5">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setQuestion(p);
                    askAi(p);
                  }}
                  disabled={loading}
                  className="text-left text-xs p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-teal-700/50 hover:bg-teal-50/50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
                >
                  ⚡ {p}
                </button>
              ))}
            </div>
          </div>

          {/* Answer display */}
          {loading && (
            <div className="p-8 text-center text-neutral-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-teal-700 mx-auto" />
              <p className="text-xs">Analyzing reading material...</p>
            </div>
          )}

          {error && (
            <div className="p-3 text-xs rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40">
              {error}
            </div>
          )}

          {answer && (
            <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/40 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm space-y-2 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-teal-800 dark:text-teal-300 text-xs">
                <Bot className="w-4 h-4" />
                <span>AI Insight</span>
              </div>
              <div className="whitespace-pre-wrap">{answer}</div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2 shrink-0">
          <input
            type="text"
            placeholder="Ask anything about this article..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && question.trim()) askAi(question.trim());
            }}
            className="flex-1 px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden"
          />
          <button
            onClick={() => question.trim() && askAi(question.trim())}
            disabled={loading || !question.trim()}
            className="p-2 rounded-xl bg-teal-800 hover:bg-teal-700 text-white disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

