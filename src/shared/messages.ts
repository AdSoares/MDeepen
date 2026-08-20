import type { OutlineNode, Page, PanelsState, ReaderConfig } from './types';
import type { AiActionKind, AiConfig, AiErrorKind, AiScope } from '../extension/ai/types';

export type HostToWebview =
  | { type: 'init'; fileName: string; pages: Page[]; outline: OutlineNode[]; effectiveLevel: number; restoredIndex: number; readIds: string[]; panels: PanelsState; config: ReaderConfig }
  | { type: 'sectionsUpdated'; pages: Page[]; outline: OutlineNode[]; effectiveLevel: number; keepIndex: number; readIds: string[] }
  | { type: 'configChanged'; config: ReaderConfig }
  | { type: 'aiChunk'; text: string }
  | { type: 'aiDone'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'aiError'; kind: AiErrorKind; message: string }
  | { type: 'aiConfirmNeeded'; summary: { fileName: string; sectionTitle: string; scope: AiScope; sectionCount: number; truncated: string[]; model: string; estTokens: number; estCost: number }; secrets: { label: string; count: number } }
  | { type: 'aiConfigState'; configured: boolean; provider: string; model: string }
  | { type: 'aiConnectionResult'; ok: boolean; ms: number; error?: string }
  | { type: 'aiShowConfig' }
  | { type: 'navigateSection'; delta: number }
  | { type: 'quickAction'; action: AiActionKind }
  | { type: 'focusOutline' }
  | { type: 'aiProgress'; done: number; total: number };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'activeSectionChanged'; index: number }
  | { type: 'sectionRead'; id: string }
  | { type: 'uiStateChanged'; config: ReaderConfig; panels: PanelsState }
  | { type: 'openLink'; href: string; kind: 'external' | 'local' | 'anchor' }
  | { type: 'refresh' }
  | { type: 'setPaginationLevel'; level: number }
  | { type: 'aiAction'; action: AiActionKind; scope: AiScope; id?: string; text?: string }
  | { type: 'aiStop' }
  | { type: 'aiConfirmSend'; dontAskAgain: boolean; masked: boolean }
  | { type: 'aiCancelSend' }
  | { type: 'aiTestConnection' }
  | { type: 'aiSaveConfig'; config: AiConfig }
  | { type: 'aiSaveKey'; key: string }
  | { type: 'aiClearKey' }
  | { type: 'aiConfigRequest' };

const HOST_TYPES = new Set(['init', 'sectionsUpdated', 'configChanged', 'aiChunk', 'aiDone', 'aiError', 'aiConfirmNeeded', 'aiConfigState', 'aiConnectionResult', 'aiShowConfig', 'navigateSection', 'quickAction', 'focusOutline', 'aiProgress']);
const WEBVIEW_TYPES = new Set(['ready', 'activeSectionChanged', 'sectionRead', 'uiStateChanged', 'openLink', 'refresh', 'setPaginationLevel', 'aiAction', 'aiStop', 'aiConfirmSend', 'aiCancelSend', 'aiTestConnection', 'aiSaveConfig', 'aiSaveKey', 'aiClearKey', 'aiConfigRequest']);

export function isHostToWebview(m: unknown): m is HostToWebview {
  return typeof m === 'object' && m !== null && HOST_TYPES.has((m as { type?: unknown }).type as string);
}

export function isWebviewToHost(m: unknown): m is WebviewToHost {
  return typeof m === 'object' && m !== null && WEBVIEW_TYPES.has((m as { type?: unknown }).type as string);
}
