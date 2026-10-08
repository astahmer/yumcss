import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const DOCUMENT = "<!doctype html><html><head></head><body></body></html>";

/** A real document keeps native resets, :root tokens and layers isolated. */
export function PreviewDocument(props: {
	css: string;
	mode: string;
	kind: string;
	targetRef: RefObject<HTMLDivElement | null>;
	onReady: () => void;
	children: ReactNode;
}) {
	const frame = useRef<HTMLIFrameElement>(null);
	const [document, setDocument] = useState<Document>();
	useEffect(() => {
		if (document !== undefined) props.onReady();
	}, [document, props.onReady]);
	useEffect(() => {
		if (document === undefined) return;
		document.documentElement.className = props.mode;
		document.documentElement.dataset.theme = props.mode;
		document.documentElement.style.colorScheme = props.mode;
	}, [document, props.mode]);
	useEffect(() => {
		if (document === undefined) return;
		const resize = () => {
			const height = `${Math.max(140, Math.ceil(document.body.getBoundingClientRect().height))}px`;
			if (frame.current !== null && frame.current.style.height !== height)
				frame.current.style.height = height;
		};
		let resizeFrame = 0;
		const observer = new ResizeObserver(() => {
			cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(resize);
		});
		observer.observe(document.body);
		resize();
		return () => {
			cancelAnimationFrame(resizeFrame);
			observer.disconnect();
		};
	}, [document]);
	return (
		<>
			<iframe
				ref={frame}
				title="Live preview document"
				srcDoc={DOCUMENT}
				style={{ width: "100%", border: 0, minHeight: 140 }}
				onLoad={(event) => {
					const loaded = event.currentTarget.contentDocument;
					if (loaded !== null) {
						// These are frame layout controls, not specimen declarations.
						loaded.body.style.cssText =
							"margin:0;padding:24px;box-sizing:border-box;display:grid;place-items:center;min-height:140px";
						setDocument(loaded);
					}
				}}
			/>
			{document !== undefined &&
				createPortal(
					<>
						<style data-playground-preview>{props.css}</style>
						<div ref={props.targetRef} data-preview-kind={props.kind}>
							{props.children}
						</div>
					</>,
					document.body,
				)}
		</>
	);
}
