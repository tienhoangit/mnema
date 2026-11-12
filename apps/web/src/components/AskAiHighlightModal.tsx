import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Send, Loader2, Bot, Languages, BookA, Compass, User, MessageCircle } from 'lucide-react';
import { Highlight } from '../types';
import { api } from '../services/api';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AskAiHighlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlight: Highlight | null;
}

export const AskAiHighlightModal: React.FC<AskAiHighlightModalProps> = ({
  isOpen,
  onClose,
  highlight,
}) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load existing thread history when opened for a highlight (or start fresh if none exists)
  useEffect(() => {
    if (!isOpen || !highlight) return;
    let active = true;
    setThreadId(null);
    setMessages([]);
    setError(null);
    setQuestion('');

    api
      .getAiThreadByHighlight(highlight.id)
      .then((thread) => {
        if (!active || !thread) return;
        setThreadId(thread.id);
        setMessages(
          thread.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }))
        );
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOpen, highlight?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!isOpen || !highlight) return null;

  const handleAsk = async (promptText: string) => {
    if (!promptText.trim()) return;

    setError(null);
    const userMessage: ChatMessage = { role: 'user', content: promptText };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setQuestion('');

    const apiKey = localStorage.getItem('mnema_gemini_api_key') || undefined;

    try {
      const response = await api.askHighlightMultiTurn({
        threadId: threadId || undefined,
        highlightId: highlight.id,
        sourceId: highlight.source_id,
        highlightContent: highlight.content,
        sourceTitle: highlight.source_name || 'Untitled Source',
        message: promptText,
        apiKey,
      });

      setThreadId(response.threadId);
      setMessages(response.messages);
    } catch (err: any) {
      setError(err.message || 'AI request failed');
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    {
      id: 'explain',
      label: 'Explain in plain words',
      icon: Sparkles,
      prompt: 'Explain the deeper meaning of this quote in simple, relatable terms.',
    },
    {
      id: 'translate',
      label: 'Translate to Vietnamese',
      icon: Languages,
      prompt: 'Translate this quote into natural, expressive Vietnamese.',
    },
    {
      id: 'dictionary',
      label: 'Dictionary & Concepts',
      icon: BookA,
      prompt: 'Define the core psychological, philosophical, or technical concepts mentioned in this quote.',
    },
    {
      id: 'library',
      label: 'Connect Ideas',
      icon: Compass,
      prompt: 'How does this principle relate to modern productivity, stoicism, or lifelong learning? Give concrete examples.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] max-h-[750px]">
        {/* Header */}
        <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
            <Sparkles className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>Ask AI Copilot (Multi-turn)</span>
            {threadId && (
              <span className="text-[10px] text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-neutral-800 px-2 py-0.5 rounded-full font-mono">
                Thread active
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Quote preview */}
          <div className="p-3.5 rounded-2xl bg-teal-50/50 dark:bg-neutral-800/40 border border-teal-200/40 dark:border-neutral-700">
            <blockquote className="font-serif italic text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed">
              “{highlight.content}”
            </blockquote>
            <p className="text-[11px] text-neutral-400 mt-2 font-sans font-medium">
              — {highlight.source_name || 'Source'} {highlight.source_author && `by ${highlight.source_author}`}
            </p>
          </div>

          {/* Quick Actions (shown when thread is fresh) */}
          {messages.length === 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Instant Inquiries
              </p>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((qa) => {
                  const Icon = qa.icon;
                  return (
                    <button
                      key={qa.id}
                      onClick={() => handleAsk(qa.prompt)}
                      disabled={loading}
                      className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-teal-700/50 hover:bg-teal-50/40 dark:hover:bg-neutral-800 text-left transition-colors flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300"
                    >
                      <Icon className="w-4 h-4 text-teal-700 shrink-0" />
                      <span className="truncate">{qa.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conversation history */}
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={idx}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-xl bg-teal-100 dark:bg-teal-900/60 flex items-center justify-center shrink-0 text-teal-800 dark:text-teal-300">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`p-3.5 rounded-2xl text-xs sm:text-sm max-w-[85%] leading-relaxed ${
                    isUser
                      ? 'bg-teal-700 text-white rounded-tr-xs'
                      : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-800 dark:text-neutral-200 rounded-tl-xs border border-neutral-200/50 dark:border-neutral-700/50'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
                {isUser && (
                  <div className="w-7 h-7 rounded-xl bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0 text-neutral-600 dark:text-neutral-300">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-3 items-center text-neutral-400 py-2">
              <div className="w-7 h-7 rounded-xl bg-teal-100 dark:bg-teal-900/60 flex items-center justify-center shrink-0 text-teal-800 dark:text-teal-300">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <p className="text-xs italic">Reasoning & composing response...</p>
            </div>
          )}

          {/* Error notice */}
          {error && (
            <div className="p-3 text-xs rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2 shrink-0">
          <input
            type="text"
            placeholder={
              messages.length > 0
                ? 'Ask a follow-up question in this thread...'
                : 'Ask anything about this quote...'
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && question.trim()) {
                handleAsk(question.trim());
              }
            }}
            disabled={loading}
            className="flex-1 px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-hidden disabled:opacity-50"
          />
          <button
            onClick={() => question.trim() && handleAsk(question.trim())}
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
