/** Runtime sinks. A browser style element is only one possible sink. */

export interface RuntimeStyleElement {
	readonly tagName?: string;
	textContent: string;
	setAttribute(name: string, value: string): void;
	nonce?: string;
	remove(): void;
}

export interface RuntimeDocument {
	querySelector(selector: string): RuntimeStyleElement | null;
	createElement(name: string): RuntimeStyleElement;
	head: { appendChild(element: RuntimeStyleElement): void };
}

export interface RuntimeStyleSink {
	mount(css: string): boolean;
	update(css: string): void;
	unmount(): void;
}

export interface DomStyleSinkOptions {
	readonly id: string;
	readonly document?: RuntimeDocument;
	readonly nonce?: string;
}

export class DomStyleSink implements RuntimeStyleSink {
	private element: RuntimeStyleElement | undefined;

	constructor(private readonly options: DomStyleSinkOptions) {}

	private resolveDocument(): RuntimeDocument | undefined {
		if (this.options.document !== undefined) return this.options.document;
		return (globalThis as { document?: RuntimeDocument }).document;
	}

	mount(css: string): boolean {
		if (this.element !== undefined) {
			this.update(css);
			return true;
		}
		const document = this.resolveDocument();
		if (document === undefined) return false;
		const selector = `style[data-pandwind-sheet="${this.options.id}"]`;
		const existing = document.querySelector(selector);
		if (existing?.tagName === "STYLE") this.element = existing;
		else {
			this.element = document.createElement("style");
			this.element.setAttribute("data-pandwind-sheet", this.options.id);
			if (this.options.nonce !== undefined) this.element.nonce = this.options.nonce;
			document.head.appendChild(this.element);
		}
		this.update(css);
		return true;
	}

	update(css: string): void {
		if (this.element !== undefined) this.element.textContent = css;
	}

	unmount(): void {
		this.element?.remove();
		this.element = undefined;
	}
}
