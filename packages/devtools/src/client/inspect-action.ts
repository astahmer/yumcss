import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";
import { DEVTOOLS_RPC, type DevtoolsElementInput } from "../rpc.ts";

const OVERLAY_ID = "__pandwind_devtools_inspector__";

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

export default function setup(ctx: DockClientScriptContext): void {
	let cleanup: (() => void) | undefined;
	ctx.current.events.on("entry:activated", () => {
		cleanup?.();
		const overlay = document.createElement("div");
		overlay.id = OVERLAY_ID;
		overlay.style.cssText =
			"position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #b7ff5a;background:#b7ff5a22;transition:all 80ms ease;";
		document.documentElement.append(overlay);
		const onMove = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element) || target.id === OVERLAY_ID) return;
			const rect = target.getBoundingClientRect();
			overlay.style.left = `${rect.left}px`;
			overlay.style.top = `${rect.top}px`;
			overlay.style.width = `${rect.width}px`;
			overlay.style.height = `${rect.height}px`;
		};
		const onClick = async (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const target = event.target;
			if (!(target instanceof Element) || target.id === OVERLAY_ID) return;
			const computedStyle = getComputedStyle(target);
			const className = target.getAttribute("class") ?? "";
			const input: DevtoolsElementInput = {
				tagName: target.tagName.toLowerCase(),
				className,
				classNames: className.split(/\s+/u).filter(Boolean),
				attributes: attributesFor(target),
				computedStyles: Object.fromEntries(
					COMPUTED_STYLE_PROPERTIES.map((property) => [
						property,
						computedStyle.getPropertyValue(property),
					]),
				),
			};
			// The client context currently exposes the unaugmented hub key map;
			// the server registration and shared RPC schema remain the source of truth.
			const call = ctx.rpc.call as (name: string, value: DevtoolsElementInput) => Promise<unknown>;
			await call(DEVTOOLS_RPC.InspectElement, input);
		};
		document.addEventListener("mousemove", onMove, true);
		document.addEventListener("click", onClick, true);
		cleanup = () => {
			document.removeEventListener("mousemove", onMove, true);
			document.removeEventListener("click", onClick, true);
			overlay.remove();
		};
	});
	ctx.current.events.on("entry:deactivated", () => cleanup?.());
}
