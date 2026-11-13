import { Bindings } from '../../types';
import {
  checkWorkersAiBudget,
  recordWorkersAiUsage,
  resolveGeminiKey,
} from '../../core/helpers';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface WorkersAiTextResponse {
  response?: string;
}

export async function generateAIResponse(
  prompt: string,
  env: Bindings,
  customApiKey?: string
): Promise<string> {
  const apiKey = await resolveGeminiKey(env, customApiKey);

  if (apiKey) {
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } else if (res.status !== 404) {
        break;
      }
    }
  }

  if (env.AI) {
    const budget = await checkWorkersAiBudget(env);
    if (budget.allowed) {
      try {
        const aiRes = (await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
        })) as WorkersAiTextResponse;
        if (aiRes.response) {
          await recordWorkersAiUsage(env, 100);
          return aiRes.response;
        }
      } catch (e) {
        console.warn('Workers AI error:', e instanceof Error ? e.message : e);
      }
    } else {
      console.warn(`Workers AI daily neuron budget exhausted (${budget.used}/${budget.limit}).`);
    }
  }

  throw new Error(
    'No AI provider configured. Please provide a free Google Gemini API Key in Settings.'
  );
}
