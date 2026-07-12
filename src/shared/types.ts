export interface OutlineNode {
  id: string;
  title: string;
  level: number;       // 1..6
  line: number;        // 0-based line of the heading
  pageIndex: number;   // index into the flat pages array this heading belongs to
  children: OutlineNode[];
}

export interface Page {
  id: string;
  title: string;
  level: number;       // pagination level of this page's heading; 0 for the pre-title intro page
  startLine: number;   // 0-based inclusive
  endLine: number;     // 0-based inclusive
  content: string;     // raw markdown of the page, including its heading line
  wordCount: number;
}

export interface SectionizeResult {
  outline: OutlineNode[];
  pages: Page[];
  effectiveLevel: number;   // the pagination level actually used (after fallback)
}

export interface ReaderConfig {
  fontSize: number;         // px, reading body
  columnWidth: number;      // px, reading column max-width
  lineHeight: number;       // unitless
  theme: 'auto' | 'light' | 'dark';
}

export interface PanelsState {
  outlineVisible: boolean;
  aiVisible: boolean;
  outlineWidth: number; // px, 180..400
  aiWidth: number;      // px, 260..480
}
