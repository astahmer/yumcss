import type { RuntimeDocument, RuntimeSheetOptions, RuntimeStyleElement, RuntimeStyleElementSink } from "./runtime-sheet-contracts.ts";

export class DomStyleElementSink implements RuntimeStyleElementSink {
	private element: RuntimeStyleElement | undefined;
	constructor(private readonly options: RuntimeSheetOptions) {}

	private document(): RuntimeDocument | undefined {
		if (this.options.document !== undefined) return this.options.document;
		return (globalThis as { document?: RuntimeDocument }).document;
	}

	mount(css: string): boolean {
		if (this.element !== undefined) { this.element.textContent = css; return true; }
		const document = this.document();
		if (document === undefined) return false;
		const id = this.options.id ?? "pandwind";
		const existing = document.querySelector(`style[data-pandwind-sheet="${id}"]`);
		if (existing?.tagName === "STYLE") this.element = existing;
		else {
			this.element = document.createElement("style");
			this.element.setAttribute("data-pandwind-sheet", id);
			if (this.options.nonce !== undefined) this.element.nonce = this.options.nonce;
			document.head.appendChild(this.element);
		}
		this.element.textContent = css;
		return true;
	}

	update(css: string): void { if (this.element !== undefined) this.element.textContent = css; }
	unmount(): void { this.element?.remove(); this.element = undefined; }
}
