import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	redirect,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { EXAMPLES } from "./lib/examples.ts";
import { PlaygroundPage } from "./components/PlaygroundPage.tsx";
import { MigrationLabPage } from "./components/MigrationLabPage.tsx";
import { css as uiCss } from "./ui-css.ts";

const GROUP_LABEL = { core: "Scenarios", limits: "Limits" } as const;
const DEFAULT_ROUTE = "/basics-tw" as const;

const NAV_GROUPS = (Object.keys(GROUP_LABEL) as Array<keyof typeof GROUP_LABEL>).map((group) => ({
	group,
	label: GROUP_LABEL[group],
	items: EXAMPLES.filter((example) => example.group === group).map((example) => ({
		path: example.path,
		label: example.title,
	})),
}));

type PlaygroundRoute = "/migrate" | (typeof EXAMPLES)[number]["path"];

function ScenarioPicker() {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const knownPath =
		pathname === "/migrate" || EXAMPLES.some((example) => example.path === pathname);
	const selectedPath: PlaygroundRoute = knownPath ? (pathname as PlaygroundRoute) : DEFAULT_ROUTE;

	return (
		<label
			className={uiCss.class({
				display: "flex",
				minWidth: "0px",
				alignItems: "center",
				gap: "8px",
				marginLeft: "auto",
			})}
		>
			<span
				className={uiCss.class({
					flexShrink: "0",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: "10px",
					textTransform: "uppercase",
					letterSpacing: "0.1em",
					color: "#52525b",
				})}
			>
				scenario
			</span>
			<select
				aria-label="Open playground scenario"
				value={selectedPath}
				onChange={(event) => {
					void navigate({ to: event.target.value as PlaygroundRoute });
				}}
				className={uiCss.class({
					height: "30px",
					minWidth: "0px",
					maxWidth: "min(22rem, 42vw)",
					border: "1px solid rgba(255,255,255,0.1)",
					borderRadius: "6px",
					backgroundColor: "#16161b",
					padding: "0 28px 0 9px",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: "11px",
					color: "#d4d4d8",
					outline: "none",
					textOverflow: "ellipsis",
					transition: "border-color 120ms, color 120ms",
					"&:hover": { borderColor: "rgba(255,255,255,0.2)", color: "#f4f4f5" },
					"&:focus": {
						borderColor: "rgba(251,146,60,0.6)",
						boxShadow: "0 0 0 1px rgba(251,146,60,0.3)",
					},
				})}
			>
				<option value="/migrate">Migration lab</option>
				{NAV_GROUPS.map((group) => (
					<optgroup key={group.group} label={group.label}>
						{group.items.map((item) => (
							<option key={item.path} value={item.path}>
								{item.label}
							</option>
						))}
					</optgroup>
				))}
			</select>
		</label>
	);
}

function Shell() {
	return (
		<div
			className={uiCss.class({
				display: "flex",
				flexDirection: "column",
				height: "100%",
				minHeight: "0px",
				backgroundColor: "#09090b",
				color: "#d4d4d8",
				WebkitFontSmoothing: "antialiased",
			})}
		>
			<header
				className={uiCss.class({
					display: "flex",
					height: "48px",
					flexShrink: "0",
					alignItems: "center",
					gap: "24px",
					borderBottom: "1px solid rgba(255,255,255,0.07)",
					backgroundColor: "#09090b",
					paddingLeft: "16px",
					paddingRight: "20px",
				})}
			>
				<div className={uiCss.class({ display: "flex", alignItems: "baseline", gap: "8px" })}>
					<span
						className={uiCss.class({
							fontSize: "13px",
							fontWeight: "600",
							letterSpacing: "-0.025em",
							color: "#f4f4f5",
						})}
					>
						pandwind
					</span>
					<span className={uiCss.class({ fontSize: "13px", color: "#52525b" })}>/</span>
					<span
						className={uiCss.class({
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "12px",
							color: "rgba(253,186,116,0.9)",
						})}
					>
						playground
					</span>
				</div>
				<ScenarioPicker />
				<div
					className={uiCss.class({
						display: "none",
						marginLeft: "auto",
						flexShrink: "0",
						alignItems: "center",
						gap: "6px",
						fontSize: "11px",
						color: "#52525b",
						"@media (min-width: 640px)": { display: "flex" },
					})}
				>
					<span>run</span>
					<kbd
						className={uiCss.class({
							border: "1px solid rgba(255,255,255,0.1)",
							borderRadius: "4px",
							backgroundColor: "rgba(255,255,255,0.04)",
							padding: "2px 6px",
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "10px",
							lineHeight: "1",
							color: "#a1a1aa",
						})}
					>
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
		path: "/",
		beforeLoad: () => {
			throw redirect({ to: DEFAULT_ROUTE });
		},
	}),
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
