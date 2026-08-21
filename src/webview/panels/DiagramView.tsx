import { useEffect, useState } from 'preact/hooks';
import { renderMermaidSource } from '../render/mermaid';

interface Props {
  source: string;
}

/** Renders one Mermaid source, re-rendering whenever it changes. Never throws: a failure becomes
 *  an error strip, and the editable source stays visible beneath it either way. */
export function DiagramView({ source }: Props) {
  const [state, setState] = useState<{ svg: string } | { error: string } | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setState(undefined);
    void renderMermaidSource(source).then((r) => { if (!cancelled) setState(r); });
    return () => { cancelled = true; };
  }, [source]);

  if (!state) return <div class="md-diagram-pending">Rendering…</div>;
  if ('error' in state) return <p class="md-ai-truncated" role="alert">{state.error}</p>;
  return <div class="md-diagram" dangerouslySetInnerHTML={{ __html: state.svg }} />;
}
