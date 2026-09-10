import {
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	redirect,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { Combobox, createListCollection } from "@ark-ui/react";
import { useEffect, useMemo, useState } from "react";
import { EXAMPLES } from "./lib/examples.ts";
import { PlaygroundPage } from "./components/PlaygroundPage.tsx";
import { MigrationLabPage } from "./components/MigrationLabPage.tsx";
import { css as uiCss } from "./ui-css.ts";
import { ThemeProvider, useTheme } from "./theme.tsx";

const GROUP_LABEL = { core: "Scenarios", limits: "Limits" } as const;
const DEFAULT_ROUTE = "/basics" as const;

const NAV_GROUPS = (Object.keys(GROUP_LABEL) as Array<keyof typeof GROUP_LABEL>).map((group) => ({
	group,
	label: GROUP_LABEL[group],
	items: EXAMPLES.filter((example) => example.group === group).map((example) => ({
		path: example.path,
		label: example.title,
	})),
}));

type PlaygroundRoute = "/migrate" | (typeof EXAMPLES)[number]["path"];

interface ScenarioItem {
	readonly value: (typeof EXAMPLES)[number]["path"];
	readonly label: string;
	readonly group: string;
}

const SCENARIO_ITEMS: readonly ScenarioItem[] = NAV_GROUPS.flatMap((group) =>
	group.items.map((item) => ({ value: item.path, label: item.label, group: group.label })),
);

const SCENARIO_COLLECTION = createListCollection<ScenarioItem>({
	items: SCENARIO_ITEMS,
	itemToValue: (item) => item.value,
	itemToString: (item) => item.label,
	groupBy: (item) => item.group,
});

const HEADER_LINK = uiCss.class({
	flexShrink: "0",
	borderRadius: "5px",
	padding: "6px 8px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11px",
	textDecoration: "none",
	transition: "color 120ms, background-color 120ms",
});
const HEADER_LINK_ACTIVE = uiCss.class({
	backgroundColor: "var(--pw-control-selected)",
	color: "var(--pw-text-strong)",
});
const HEADER_LINK_IDLE = uiCss.class({
	color: "var(--pw-text-muted)",
	"&:hover": { color: "var(--pw-text-strong)" },
});
const SCENARIO_CONTROL = uiCss.class({
	display: "flex",
	minWidth: "0px",
	maxWidth: "22rem",
	height: "30px",
	alignItems: "center",
	border: "1px solid var(--pw-border-strong)",
	borderRadius: "6px",
	backgroundColor: "var(--pw-control)",
	transition: "border-color 120ms, box-shadow 120ms",
	"&:focus-within": {
		borderColor: "var(--pw-accent)",
		boxShadow: "0 0 0 1px var(--pw-accent-soft)",
	},
});
const SCENARIO_INPUT = uiCss.class({
	minWidth: "0px",
	flex: "1 1 0%",
	border: "0",
	outline: "none",
	backgroundColor: "transparent",
	padding: "0 0 0 9px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11px",
	color: "var(--pw-text)",
});
const SCENARIO_TRIGGER = uiCss.class({
	flexShrink: "0",
	border: "0",
	backgroundColor: "transparent",
	padding: "0 8px",
	fontSize: "15px",
	lineHeight: "1",
	color: "var(--pw-text-soft)",
	"&:hover": { color: "var(--pw-text-strong)" },
});
const SCENARIO_CONTENT = uiCss.class({
	minWidth: "14rem",
	maxHeight: "24rem",
	overflow: "auto",
	border: "1px solid var(--pw-border-strong)",
	borderRadius: "7px",
	backgroundColor: "var(--pw-surface-raised)",
	boxShadow: "0 16px 40px var(--pw-shadow)",
	padding: "5px",
	zIndex: "20",
});
const SCENARIO_GROUP_LABEL = uiCss.class({
	padding: "7px 8px 4px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "9px",
	textTransform: "uppercase",
	letterSpacing: "0.1em",
	color: "var(--pw-text-faint)",
});
const SCENARIO_ITEM = uiCss.class({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	borderRadius: "4px",
	padding: "7px 8px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "11px",
	color: "var(--pw-text-soft)",
	outline: "none",
	"&[data-highlighted]": {
		backgroundColor: "var(--pw-accent-soft)",
		color: "var(--pw-accent-text)",
	},
	"&[data-state=checked]": { color: "var(--pw-text-strong)" },
});
const SCENARIO_EMPTY = uiCss.class({
	padding: "10px 8px",
	fontSize: "11px",
	color: "var(--pw-text-muted)",
});
const THEME_TOGGLE = uiCss.class({
	flexShrink: "0",
	border: "1px solid var(--pw-border-strong)",
	borderRadius: "5px",
	backgroundColor: "var(--pw-control)",
	padding: "5px 8px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "10px",
	color: "var(--pw-text-soft)",
	transition: "color 120ms, border-color 120ms, background-color 120ms",
	"&:hover": {
		borderColor: "var(--pw-border-hover)",
		backgroundColor: "var(--pw-control-hover)",
		color: "var(--pw-text-strong)",
	},
	"&:focus-visible": { outline: "1px solid var(--pw-accent)", outlineOffset: "2px" },
});

function ScenarioPicker() {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const selectedPath = EXAMPLES.some((example) => example.path === pathname)
		? (pathname as ScenarioItem["value"])
		: DEFAULT_ROUTE;
	const selectedItem =
		SCENARIO_ITEMS.find((item) => item.value === selectedPath) ?? SCENARIO_ITEMS[0]!;
	const [inputValue, setInputValue] = useState(selectedItem.label);
	useEffect(() => setInputValue(selectedItem.label), [selectedItem.label]);
	const collection = useMemo(
		() =>
			inputValue === selectedItem.label
				? SCENARIO_COLLECTION
				: SCENARIO_COLLECTION.filter((itemString) =>
						itemString.toLowerCase().includes(inputValue.toLowerCase()),
					),
		[inputValue, selectedItem.label],
	);

	return (
		<div
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
					color: "var(--pw-text-faint)",
				})}
			>
				scenario
			</span>
			<Combobox.Root
				collection={collection}
				value={[selectedPath]}
				inputValue={inputValue}
				openOnClick
				positioning={{ sameWidth: true }}
				onInputValueChange={({ inputValue: next }) => setInputValue(next)}
				onValueChange={({ value }) => {
					const nextPath = value[0] as PlaygroundRoute | undefined;
					if (nextPath !== undefined) void navigate({ to: nextPath });
				}}
			>
				<Combobox.Control className={SCENARIO_CONTROL}>
					<Combobox.Input aria-label="Search playground scenarios" className={SCENARIO_INPUT} />
					<Combobox.Trigger aria-label="Open playground scenarios" className={SCENARIO_TRIGGER}>
						⌄
					</Combobox.Trigger>
				</Combobox.Control>
				<Combobox.Positioner>
					<Combobox.Content className={SCENARIO_CONTENT}>
						<Combobox.Empty className={SCENARIO_EMPTY}>No matching scenarios</Combobox.Empty>
						{collection.group().map(([group, items]) => (
							<Combobox.ItemGroup key={group}>
								<Combobox.ItemGroupLabel className={SCENARIO_GROUP_LABEL}>
									{group}
								</Combobox.ItemGroupLabel>
								{items.map((item) => (
									<Combobox.Item key={item.value} item={item} className={SCENARIO_ITEM}>
										<Combobox.ItemText>{item.label}</Combobox.ItemText>
										<Combobox.ItemIndicator>↵</Combobox.ItemIndicator>
									</Combobox.Item>
								))}
							</Combobox.ItemGroup>
						))}
					</Combobox.Content>
				</Combobox.Positioner>
			</Combobox.Root>
		</div>
	);
}

function MigrationLabLink() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	return (
		<Link
			to="/migrate"
			aria-current={pathname === "/migrate" ? "page" : undefined}
			className={`${HEADER_LINK} ${pathname === "/migrate" ? HEADER_LINK_ACTIVE : HEADER_LINK_IDLE}`}
		>
			migration lab
		</Link>
	);
}

function ShellFrame() {
	const { mode, toggle } = useTheme();
	return (
		<div
			className={uiCss.class({
				display: "flex",
				flexDirection: "column",
				height: "100%",
				minHeight: "0px",
				backgroundColor: "var(--pw-page)",
				color: "var(--pw-text)",
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
					borderBottom: "1px solid var(--pw-border)",
					backgroundColor: "var(--pw-page)",
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
							color: "var(--pw-text-strong)",
						})}
					>
						pandwind
					</span>
					<span className={uiCss.class({ fontSize: "13px", color: "var(--pw-text-faint)" })}>
						/
					</span>
					<span
						className={uiCss.class({
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "12px",
							color: "var(--pw-accent-text)",
						})}
					>
						playground
					</span>
				</div>
				<MigrationLabLink />
				<ScenarioPicker />
				<button
					type="button"
					className={THEME_TOGGLE}
					onClick={toggle}
					aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
				>
					{mode === "dark" ? "light" : "dark"}
				</button>
				<div
					className={uiCss.class({
						display: "none",
						marginLeft: "auto",
						flexShrink: "0",
						alignItems: "center",
						gap: "6px",
						fontSize: "11px",
						color: "var(--pw-text-faint)",
						"@media (min-width: 640px)": { display: "flex" },
					})}
				>
					<span>run</span>
					<kbd
						className={uiCss.class({
							border: "1px solid var(--pw-border-strong)",
							borderRadius: "4px",
							backgroundColor: "var(--pw-control-hover)",
							padding: "2px 6px",
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "10px",
							lineHeight: "1",
							color: "var(--pw-text-soft)",
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

function Shell() {
	return (
		<ThemeProvider>
			<ShellFrame />
		</ThemeProvider>
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
