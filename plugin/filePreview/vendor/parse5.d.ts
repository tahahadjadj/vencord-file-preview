// Minimal types for the bundled parse5 7.3.0 parseFragment export (MIT).
export interface HtmlElement { nodeName: string; tagName: string; namespaceURI: string; attrs: {name: string; value: string;}[]; childNodes: HtmlNode[]; }
export type HtmlNode = HtmlElement | {nodeName: "#text"; value: string;} | {nodeName: "#comment"; data: string;};
export function parseFragment(source: string): {nodeName: "#document-fragment"; childNodes: HtmlNode[];};
