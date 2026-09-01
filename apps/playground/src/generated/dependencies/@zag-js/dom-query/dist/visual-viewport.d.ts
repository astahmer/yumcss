// Generated from the workspace-linked pandwind package. Do not edit.
interface ViewportSize {
    width: number;
    height: number;
}
declare function trackVisualViewport(doc: Document, fn: (data: ViewportSize) => void): () => void;

export { type ViewportSize, trackVisualViewport };
