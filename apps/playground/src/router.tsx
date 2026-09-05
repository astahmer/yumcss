import { Link, createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { EXAMPLES } from "./lib/examples.ts";
import { PlaygroundPage } from "./components/PlaygroundPage.tsx";
import { MigrationLabPage } from "./components/MigrationLabPage.tsx";
import { css as uiCss } from "./ui-css.ts";

const GROUP_LABEL = { core: "Scenarios", limits: "Limits" } as const;

const NAV_GROUPS = (Object.keys(GROUP_LABEL) as Array<keyof typeof GROUP_LABEL>).map((group) => ({
	group,
	label: GROUP_LABEL[group],
	items: EXAMPLES.filter((example) => example.group === group).map((example) => ({
		path: example.path,
		label: example.title,
	})),
}));

function Shell() {
	return (
		<div className={uiCss.class({ display: "flex", flexDirection: "column", height: "100%", minHeight: "0px", backgroundColor: "#09090b", color: "#d4d4d8", WebkitFontSmoothing: "antialiased" })}>
			<header className={uiCss.class({ display: "flex", height: "48px", flexShrink: "0", alignItems: "center", gap: "24px", borderBottom: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#09090b", paddingLeft: "16px", paddingRight: "20px" })}>
				<div className={uiCss.class({ display: "flex", alignItems: "baseline", gap: "8px" })}>
					<span className={uiCss.class({ fontSize: "13px", fontWeight: "600", letterSpacing: "-0.025em", color: "#f4f4f5" })}>pandwind</span>
					<span className={uiCss.class({ fontSize: "13px", color: "#52525b" })}>/</span>
					<span className={uiCss.class({ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", color: "rgba(253,186,116,0.9)" })}>playground</span>
				</div>
				<nav className={uiCss.class({ display: "flex", minWidth: "0px", alignItems: "center", gap: "16px", overflowX: "auto" })} aria-label="Examples">
					<Link
						to="/migrate"
						activeProps={{ className: uiCss.class({ backgroundColor: "rgba(255,255,255,0.07)", color: "#f4f4f5" }) }}
						inactiveProps={{ className: uiCss.class({ color: "#71717a", "&:hover": { color: "#d4d4d8" } }) }}
						className={uiCss.class({ flexShrink: "0", borderRadius: "6px", padding: "4px 10px", fontSize: "13px", lineHeight: "24px", transition: "color 120ms, background-color 120ms", "&:focus-visible": { outline: "1px solid rgba(251,146,60,0.6)", outlineOffset: "0px" } })}
					>
						Migration lab
					</Link>
					{NAV_GROUPS.map((group) => (
						<div key={group.group} className={uiCss.class({ display: "flex", minWidth: "0px", flexShrink: "0", alignItems: "center", gap: "4px" })}>
							<span className={uiCss.class({ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.09em", color: "#52525b" })}>
								{group.label}
							</span>
							{group.items.map((item) => (
								<Link
									key={item.path}
									to={item.path}
									activeOptions={{ exact: true }}
									activeProps={{ className: uiCss.class({ backgroundColor: "rgba(255,255,255,0.07)", color: "#f4f4f5" }) }}
									inactiveProps={{ className: uiCss.class({ color: "#71717a", "&:hover": { color: "#d4d4d8" } }) }}
									className={uiCss.class({ display: "block", flexShrink: "0", whiteSpace: "nowrap", borderRadius: "6px", padding: "4px 8px", fontSize: "12.5px", lineHeight: "24px", transition: "color 120ms, background-color 120ms", "&:focus-visible": { outline: "1px solid rgba(251,146,60,0.6)", outlineOffset: "0px" } })}
								>
									{item.label}
								</Link>
							))}
						</div>
					))}
				</nav>
				<div className={uiCss.class({ display: "none", marginLeft: "auto", flexShrink: "0", alignItems: "center", gap: "6px", fontSize: "11px", color: "#52525b", "@media (min-width: 640px)": { display: "flex" } })}>
					<span>run</span>
					<kbd className={uiCss.class({ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", backgroundColor: "rgba(255,255,255,0.04)", padding: "2px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "10px", lineHeight: "1", color: "#a1a1aa" })}>
						⌘ ↵
					</kbd>
				</div>
			</header>
			<main className={uiCss.class({ minHeight: "0px", flex: "1 1 0%" })}>
				<Outlet />
			</main>
		</div>
	);
}

const rootRoute = createRootRoute({ component: Shell });

export const routeTree = rootRoute.addChildren([
	createRoute({
		getParentRoute: () => rootRoute,
		path: "/migrate",
		component: MigrationLabPage,
	}),
	...EXAMPLES.map((example) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path: example.path,
			component: () => <PlaygroundPage def={example} />,
		}),
	),
]);

export const router = createRouter({ routeTree });
