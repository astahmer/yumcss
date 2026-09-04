import { Link, createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { EXAMPLES } from "./lib/examples.ts";
import { PlaygroundPage } from "./components/PlaygroundPage.tsx";
import { MigrationLabPage } from "./components/MigrationLabPage.tsx";

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
		<div className="flex h-screen min-h-0 flex-col bg-zinc-950 text-zinc-300 antialiased">
			<header className="flex h-12 shrink-0 items-center gap-6 border-b border-white/[0.07] bg-zinc-950 pl-4 pr-5">
				<div className="flex items-baseline gap-2">
					<span className="text-[13px] font-semibold tracking-tight text-zinc-100">pandwind</span>
					<span className="text-[13px] text-zinc-600">/</span>
					<span className="font-mono text-[12px] text-orange-300/90">playground</span>
				</div>
				<nav className="flex min-w-0 items-center gap-4 overflow-x-auto" aria-label="Examples">
					<Link
						to="/migrate"
						activeProps={{ className: "bg-white/[0.07] text-zinc-100" }}
						inactiveProps={{ className: "text-zinc-500 hover:text-zinc-300" }}
						className="shrink-0 rounded-md px-2.5 py-1 text-[13px] leading-6 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-orange-400/60"
					>
						Migration lab
					</Link>
					{NAV_GROUPS.map((group) => (
						<div key={group.group} className="flex min-w-0 shrink-0 items-center gap-1">
							<span className="font-mono text-[10px] uppercase tracking-[0.09em] text-zinc-600">
								{group.label}
							</span>
							{group.items.map((item) => (
								<Link
									key={item.path}
									to={item.path}
									activeOptions={{ exact: true }}
									activeProps={{ className: "bg-white/[0.07] text-zinc-100" }}
									inactiveProps={{ className: "text-zinc-500 hover:text-zinc-300" }}
									className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] leading-6 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-orange-400/60"
								>
									{item.label}
								</Link>
							))}
						</div>
					))}
				</nav>
				<div className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11px] text-zinc-600 sm:flex">
					<span>run</span>
					<kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-400">
						⌘ ↵
					</kbd>
				</div>
			</header>
			<main className="min-h-0 flex-1">
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
