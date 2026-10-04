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

const mountedSheetIdsKey = Symbol.for("pandwind.runtime.mounted-sheet-ids");

type RuntimeGlobal = typeof globalThis & {
	[mountedSheetIdsKey]?: WeakMap<RuntimeDocument, Set<string>>;
};

const mountedIdsFor = (document: RuntimeDocument): Set<string> => {
	const globalObject = globalThis as RuntimeGlobal;
	const idsByDocument =
		globalObject[mountedSheetIdsKey] ?? new WeakMap<RuntimeDocument, Set<string>>();
	globalObject[mountedSheetIdsKey] = idsByDocument;
	let mountedIds = idsByDocument.get(document);
	if (mountedIds === undefined) {
		mountedIds = new Set();
		idsByDocument.set(document, mountedIds);
	}
	return mountedIds;
};

const escapeAttributeSelector = (value: string): string =>
	// oxlint-disable-next-line no-control-regex -- CSS selectors require control characters to be escaped.
	value.replace(/[\u0000-\u001f\u007f"\\]/g, (character) => {
		const code = character.charCodeAt(0).toString(16);
		return `\\${code} `;
	});

export class DomStyleElementSink implements RuntimeStyleElementSink {
	private element: RuntimeStyleElement | undefined;
	private readonly options: RuntimeSheetOptions;
	private ruleOffset: number | undefined;
	private ruleCount = 0;
	private mountedId: string | undefined;
	private mountedDocument: RuntimeDocument | undefined;

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
			this.ruleOffset = undefined;
			this.ruleCount = 0;
			return true;
		}
		const document = this.document();
		if (document === undefined) return false;
		const requestedId = this.options.id ?? "pandwind";
		const mountedIds = mountedIdsFor(document);
		const requestedSelector = (id: string) =>
			`style[data-pandwind-sheet="${escapeAttributeSelector(id)}"]`;
		const existing = mountedIds.has(requestedId)
			? null
			: document.querySelector(requestedSelector(requestedId));
		let id = requestedId;
		if (existing?.tagName === "STYLE") this.element = existing;
		else {
			let suffix = 2;
			while (mountedIds.has(id) || document.querySelector(requestedSelector(id)) !== null) {
				id = `${requestedId}-${suffix}`;
				suffix++;
			}
			this.element = document.createElement("style");
			this.element.setAttribute("data-pandwind-sheet", id);
			if (this.options.nonce !== undefined) this.element.nonce = this.options.nonce;
			document.head.appendChild(this.element);
		}
		mountedIds.add(id);
		this.mountedId = id;
		this.mountedDocument = document;
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
		if (this.mountedDocument !== undefined && this.mountedId !== undefined)
			mountedIdsFor(this.mountedDocument).delete(this.mountedId);
		this.element = undefined;
		this.mountedId = undefined;
		this.mountedDocument = undefined;
		this.ruleOffset = undefined;
		this.ruleCount = 0;
	}
}
