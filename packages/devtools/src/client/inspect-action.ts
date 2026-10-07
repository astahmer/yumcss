import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";
import type { DevtoolsClassRule } from "../evidence/store.ts";
import { DEVTOOLS_RPC, type DevtoolsElementInput } from "../rpc.ts";

const OVERLAY_ID = "__yumcss_devtools_inspector__";
const PANEL_ENTRY_ID = "yumcss-devtools";
const ACCENT = "#f59e42";
const MAX_RULES_PER_CLASS = 12;

const COMPUTED_STYLE_PROPERTIES = [
	"display",
	"position",
	"color",
	"background-color",
	"font-size",
	"font-weight",
	"line-height",
	"padding",
	"margin",
	"border-radius",
	"width",
	"height",
] as const;

const attributesFor = (element: Element): Readonly<Record<string, string>> =>
	Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value]));

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const conditionFor = (rule: CSSRule): string =>
	rule.cssText.slice(0, rule.cssText.indexOf("{")).trim();

/** Every stylesheet rule whose selector targets one of the classes, with its enclosing at-rules. */
const rulesForClasses = (classNames: readonly string[]): DevtoolsClassRule[] => {
	const matchers = classNames.map((className) => ({
		className,
		pattern: new RegExp(`\\.${escapeRegExp(CSS.escape(className))}(?![\\w-])`, "u"),
	}));
	const found: DevtoolsClassRule[] = [];
	const visit = (rules: CSSRuleList, conditions: readonly string[]): void => {
		for (const rule of rules) {
			if (rule instanceof CSSStyleRule) {
				for (const matcher of matchers) {
					if (!matcher.pattern.test(rule.selectorText)) continue;
					if (
						found.filter((entry) => entry.className === matcher.className).length >=
						MAX_RULES_PER_CLASS
					)
						continue;
					found.push({
						className: matcher.className,
						selector: rule.selectorText,
						conditions,
						declarations: rule.style.cssText,
					});
				}
				if (rule.cssRules.length > 0) visit(rule.cssRules, conditions);
			} else if (rule instanceof CSSGroupingRule) {
				visit(rule.cssRules, [...conditions, conditionFor(rule)]);
			}
		}
	};
	for (const sheet of document.styleSheets) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			// Cross-origin stylesheets are not readable; they cannot hold the app's own atoms anyway.
			continue;
		}
		visit(rules, []);
	}
	return found;
};

const labelFor = (element: Element): string => {
	const classes = [...element.classList]
		.slice(0, 3)
		.map((name) => `.${name}`)
		.join("");
	const more = element.classList.length > 3 ? ` +${element.classList.length - 3}` : "";
	return `${element.tagName.toLowerCase()}${classes}${more}`;
};

export default function setup(ctx: DockClientScriptContext): void {
	let cleanup: (() => void) | undefined;
	const stop = (): void => {
		cleanup?.();
		cleanup = undefined;
	};

	ctx.current.events.on("entry:activated", () => {
		stop();
		const overlay = document.createElement("div");
		overlay.id = OVERLAY_ID;
		overlay.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;border:2px solid ${ACCENT};background:${ACCENT}22;border-radius:4px;transition:all 80ms ease;`;
		const label = document.createElement("div");
		label.style.cssText = `position:absolute;left:-2px;bottom:100%;margin-bottom:4px;padding:2px 6px;border-radius:4px;background:#1f1f1f;color:#fef7ed;font:500 11px ui-monospace,monospace;white-space:nowrap;`;
		overlay.append(label);
		document.documentElement.append(overlay);

		const onMove = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element) || target.id === OVERLAY_ID) return;
			const rect = target.getBoundingClientRect();
			overlay.style.left = `${rect.left}px`;
			overlay.style.top = `${rect.top}px`;
			overlay.style.width = `${rect.width}px`;
			overlay.style.height = `${rect.height}px`;
			label.textContent = labelFor(target);
		};
		const onClick = async (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const target = event.target;
			if (!(target instanceof Element) || target.id === OVERLAY_ID) return;
			const computedStyle = getComputedStyle(target);
			const className = target.getAttribute("class") ?? "";
			const classNames = className.split(/\s+/u).filter(Boolean);
			const input: DevtoolsElementInput = {
				tagName: target.tagName.toLowerCase(),
				className,
				classNames,
				attributes: attributesFor(target),
				computedStyles: Object.fromEntries(
					COMPUTED_STYLE_PROPERTIES.map((property) => [
						property,
						computedStyle.getPropertyValue(property),
					]),
				),
				classRules: rulesForClasses(classNames),
			};
			stop();
			// The client context currently exposes the unaugmented hub key map;
			// the server registration and shared RPC schema remain the source of truth.
			const call = ctx.rpc.call as (name: string, value: DevtoolsElementInput) => Promise<unknown>;
			await call(DEVTOOLS_RPC.InspectElement, input);
			await ctx.docks.switchEntry(PANEL_ENTRY_ID);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			stop();
			void ctx.docks.switchEntry(null);
		};
		document.addEventListener("mousemove", onMove, true);
		document.addEventListener("click", onClick, true);
		document.addEventListener("keydown", onKeyDown, true);
		cleanup = () => {
			document.removeEventListener("mousemove", onMove, true);
			document.removeEventListener("click", onClick, true);
			document.removeEventListener("keydown", onKeyDown, true);
			overlay.remove();
		};
	});
	ctx.current.events.on("entry:deactivated", stop);
}
