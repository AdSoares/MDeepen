import { isHostToWebview, type HostToWebview, type WebviewToHost } from '../shared/messages';

interface VsCodeApi { postMessage(msg: unknown): void; }
declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

export function post(msg: WebviewToHost): void {
  api.postMessage(msg);
}

export function onMessage(cb: (m: HostToWebview) => void): void {
  window.addEventListener('message', (e) => {
    if (isHostToWebview(e.data)) cb(e.data);
  });
}
