import type { AiRequest } from './types';

const SUMMARIZE_SYSTEM =
  'You summarize a section of a Markdown document for a technical reader. ' +
  'Produce a concise summary (3-5 sentences) capturing the key points. ' +
  'Do not invent facts not present in the section. Respond in the language of the section.';

export function buildSummarizeRequest(section: { title: string; content: string }, maxTokens: number): AiRequest {
  return {
    system: SUMMARIZE_SYSTEM,
    messages: [
      { role: 'user', content: `Summarize this section titled "${section.title}":\n\n${section.content}` },
    ],
    maxTokens,
  };
}
