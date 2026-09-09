import type {
	RuntimeDocument,
	RuntimeRule,
	RuntimeSheetOptions,
	RuntimeStyleElement,
	RuntimeStyleElementSink,
} from "./runtime-sheet-contracts.ts";

type StyleSheetWithRules = {
	readonly cssRules?: { readonly length: number };
	insertRule(rule: string, index: number): number;
};
type RuntimeElementWithSheet = RuntimeStyleElement & {
	readonly sheet?: StyleSheetWithRules | null;
};

export class DomStyleElementSink implements RuntimeStyleElementSink {
	private element: RuntimeStyleElement | undefined;
	private readonly options: RuntimeSheetOptions;
	private ruleOffset: number | undefined;
	private ruleCount = 0;

	constructor(options: RuntimeSheetOptions) {
		this.options = options;
	}

	private document(): RuntimeDocument | undefined {
		if (this.options.document !== undefined) return this.options.document;
		return (globalThis as { document?: RuntimeDocument }).document;
	}

	mount(css: string): boolean {
		if (this.element !== undefined) {
			this.element.textContent = css;
			return true;
		}
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
		this.ruleOffset = undefined;
		this.ruleCount = 0;
		return true;
	}

	update(css: string): void {
		if (this.element !== undefined) {
			this.element.textContent = css;
			this.ruleOffset = undefined;
			this.ruleCount = 0;
		}
	}

	insert(rule: RuntimeRule, index: number, existingRuleCount: number): boolean {
		const sheet = (this.element as RuntimeElementWithSheet | undefined)?.sheet;
		const cssRules = sheet?.cssRules;
		if (sheet === undefined || sheet === null || cssRules === undefined) return false;
		if (this.ruleOffset === undefined) {
			const offset = cssRules.length - existingRuleCount;
			if (offset < 0) return false;
			this.ruleOffset = offset;
			this.ruleCount = existingRuleCount;
		}
		if (this.ruleCount !== existingRuleCount) return false;
		try {
			sheet.insertRule(rule.css, this.ruleOffset + index);
			this.ruleCount++;
			return true;
		} catch {
			this.ruleOffset = undefined;
			this.ruleCount = 0;
			return false;
		}
	}
	unmount(): void {
		this.element?.remove();
		this.element = undefined;
		this.ruleOffset = undefined;
		this.ruleCount = 0;
	}
}
