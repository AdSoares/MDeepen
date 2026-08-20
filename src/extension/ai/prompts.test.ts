import { describe, it, expect } from 'vitest';
import { buildActionRequest, buildMapRequest, actionLabel, isActionKind } from './prompts';
import { AI_ACTIONS, DOCUMENT_ACTIONS } from './types';

const CTX = { title: 'Retries', content: '## Retries\n\nWe retry 3x.' };

describe('buildActionRequest', () => {
  it('builds a section-scoped summarize request', () => {
    const req = buildActionRequest('summarize', 'section', CTX, 4096);
    expect(req.maxTokens).toBe(4096);
    expect(req.system.toLowerCase()).toContain('summ');
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toContain('Retries');
    expect(req.messages[0].content).toContain('retry 3x');
  });

  it('gives every action its own system prompt', () => {
    const systems = AI_ACTIONS.map((a) => buildActionRequest(a, 'section', CTX, 100).system);
    expect(new Set(systems).size).toBe(AI_ACTIONS.length);
  });

  it('keeps the grounding rules in every action', () => {
    for (const action of AI_ACTIONS) {
      const system = buildActionRequest(action, 'section', CTX, 100).system.toLowerCase();
      expect(system).toContain('do not invent');
      expect(system).toContain('language');
    }
  });

  it('tells the model whether it received a whole section or an excerpt', () => {
    const section = buildActionRequest('explain', 'section', CTX, 100).messages[0].content;
    const selection = buildActionRequest('explain', 'selection', CTX, 100).messages[0].content;
    expect(section).toContain('section');
    expect(selection).toContain('excerpt');
  });

  it('carries the content verbatim for every action and scope', () => {
    for (const action of AI_ACTIONS) {
      for (const scope of ['section', 'selection'] as const) {
        expect(buildActionRequest(action, scope, CTX, 100).messages[0].content).toContain('We retry 3x.');
      }
    }
  });
});

describe('actionLabel', () => {
  it('gives every action a short human label', () => {
    for (const action of AI_ACTIONS) {
      expect(actionLabel(action).length).toBeGreaterThan(0);
    }
    expect(actionLabel('keyTerms')).toBe('Key terms');
  });
});

describe('isActionKind', () => {
  it('accepts known actions and rejects anything else', () => {
    expect(isActionKind('summarize')).toBe(true);
    expect(isActionKind('translate')).toBe(false);
    expect(isActionKind(7)).toBe(false);
    expect(isActionKind(undefined)).toBe(false);
  });
});

describe('document scope', () => {
  it('calls the supplied text a document', () => {
    const content = buildActionRequest('summarizeShort', 'document', CTX, 100).messages[0].content;
    expect(content).toContain('document');
    expect(content).not.toContain('excerpt');
  });

  it('gives each document summary its own system prompt', () => {
    const systems = DOCUMENT_ACTIONS.map((a) => buildActionRequest(a, 'document', CTX, 100).system);
    expect(new Set(systems).size).toBe(DOCUMENT_ACTIONS.length);
  });
});

describe('buildMapRequest', () => {
  const STEP = { titles: ['Retries', 'Backoff'], content: 'We retry 3x.' };

  it('carries the part content verbatim', () => {
    expect(buildMapRequest(STEP, 1024).messages[0].content).toContain('We retry 3x.');
  });

  it('names the target length so parts condense to a predictable size', () => {
    expect(buildMapRequest(STEP, 1024).system).toContain('200');
  });

  it('is neutral: its system prompt matches no user-facing action', () => {
    const system = buildMapRequest(STEP, 1024).system;
    const actionSystems = AI_ACTIONS.map((a) => buildActionRequest(a, 'section', CTX, 100).system);
    expect(actionSystems).not.toContain(system);
    expect(system.toLowerCase()).toContain('do not invent');
  });
});
