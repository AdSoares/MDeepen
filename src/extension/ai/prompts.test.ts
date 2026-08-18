import { describe, it, expect } from 'vitest';
import { buildSummarizeRequest } from './prompts';

describe('buildSummarizeRequest', () => {
  it('builds a summarize request from a section', () => {
    const req = buildSummarizeRequest({ title: 'Retries', content: '## Retries\n\nWe retry 3x.' }, 4096);
    expect(req.maxTokens).toBe(4096);
    expect(req.system.toLowerCase()).toContain('summ');
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toContain('Retries');
    expect(req.messages[0].content).toContain('retry 3x');
  });
});
