import React, { useState } from 'react';
import { Cpu, Copy, Check, Play, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

interface McpSectionProps {
  origin: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}

export const McpSection: React.FC<McpSectionProps> = ({ origin, copiedId, onCopy }) => {
  const [mcpStatus, setMcpStatus] = useState<string | null>(null);
  const [isTestingMcp, setIsTestingMcp] = useState(false);

  const mcpUrl = `${origin}/api/mcp`;

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        mnema: {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcpUrl],
        },
      },
    },
    null,
    2
  );

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        mnema: {
          url: mcpUrl,
        },
      },
    },
    null,
    2
  );

  const handleTestMcp = async () => {
    setIsTestingMcp(true);
    setMcpStatus(null);
    try {
      const res = await api.testMcp();
      setMcpStatus(`Connected! ${res.toolsCount} tools ready: ${res.toolNames.join(', ')}`);
    } catch (err) {
      setMcpStatus(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setIsTestingMcp(false);
    }
  };

  return (
    <section className="p-6 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 flex items-center justify-center">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Model Context Protocol (MCP) Server
            </h3>
            <p className="text-xs text-neutral-400">
              Let Claude Desktop or Cursor query your books, highlights, and notes directly.
            </p>
          </div>
        </div>

        <button
          onClick={handleTestMcp}
          disabled={isTestingMcp}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-700 text-white text-xs font-semibold"
        >
          {isTestingMcp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          <span>Test MCP</span>
        </button>
      </div>

      <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-mono flex items-center justify-between gap-2">
        <span className="truncate text-neutral-800 dark:text-neutral-200">{mcpUrl}</span>
        <button
          onClick={() => onCopy('mcp-url', mcpUrl)}
          className="px-2.5 py-1 rounded-lg bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-sans font-semibold flex items-center gap-1 shrink-0"
        >
          {copiedId === 'mcp-url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          <span>{copiedId === 'mcp-url' ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {mcpStatus && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs">
          {mcpStatus}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
            <span>Claude Desktop (claude_desktop_config.json)</span>
            <button onClick={() => onCopy('claude-cfg', claudeConfig)} className="text-teal-700 hover:underline">
              {copiedId === 'claude-cfg' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 overflow-x-auto">
            {claudeConfig}
          </pre>
        </div>

        <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
            <span>Cursor (.cursor/mcp.json)</span>
            <button onClick={() => onCopy('cursor-cfg', cursorConfig)} className="text-teal-700 hover:underline">
              {copiedId === 'cursor-cfg' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 overflow-x-auto">
            {cursorConfig}
          </pre>
        </div>
      </div>
    </section>
  );
};
