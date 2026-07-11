import type { OutlineNode, Page, PanelsState, ReaderConfig } from './types';

export type HostToWebview =
  | { type: 'init'; fileName: string; pages: Page[]; outline: OutlineNode[]; effectiveLevel: number; restoredIndex: number; readIds: string[]; panels: PanelsState; config: ReaderConfig }
  | { type: 'sectionsUpdated'; pages: Page[]; outline: OutlineNode[]; effectiveLevel: number; keepIndex: number; readIds: string[] }
  | { type: 'configChanged'; config: ReaderConfig };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'activeSectionChanged'; index: number }
  | { type: 'sectionRead'; id: string }
  | { type: 'uiStateChanged'; config: ReaderConfig; panels: PanelsState }
  | { type: 'openLink'; href: string; kind: 'external' | 'local' | 'anchor' }
  | { type: 'refresh' }
  | { type: 'setPaginationLevel'; level: number };

const HOST_TYPES = new Set(['init', 'sectionsUpdated', 'configChanged']);
const WEBVIEW_TYPES = new Set(['ready', 'activeSectionChanged', 'sectionRead', 'uiStateChanged', 'openLink', 'refresh', 'setPaginationLevel']);

export function isHostToWebview(m: unknown): m is HostToWebview {
  return typeof m === 'object' && m !== null && HOST_TYPES.has((m as { type?: unknown }).type as string);
}

export function isWebviewToHost(m: unknown): m is WebviewToHost {
  return typeof m === 'object' && m !== null && WEBVIEW_TYPES.has((m as { type?: unknown }).type as string);
}
