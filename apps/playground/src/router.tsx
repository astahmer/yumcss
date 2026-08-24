import { Link, createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { tw } from "./tw.ts";

const NAV = [
	{ path: "/", label: "Basics" },
	{ path: "/conflicts", label: "Conflicts" },
	{ path: "/semantic-tokens", label: "Semantic tokens" },
	{ path: "/responsive", label: "Responsive" },
	{ path: "/atoms", label: "css() atoms" },
];

function Shell({ children }: { children: ReactNode }) {
	return (
		<div className={tw({ minH: "screen", flex: "col" })}>
			<header
				className={tw({
					flex: true,
					items: "center",
					gap: "4",
					px: "6",
					py: "3",
					borderB: true,
					bgColor: "gray-950",
				})}
			>
				<span className={tw({ textSize: "lg", textColor: "white" })}>pandwind playground</span>
				<nav className={tw({ flex: true, gap: "3" })}>
					{NAV.map((item) => (
						<Link
							key={item.path}
							to={item.path}
							activeOptions={{ exact: item.path === "/" }}
							className={tw({
								textSize: "sm",
								textColor: "gray-400",
								hover: { textColor: "gray-100" },
							})}
						>
							{item.label}
						</Link>
					))}
				</nav>
			</header>
			<main className={tw({ grow: true, overflow: "hidden" })}>{children}</main>
		</div>
	);
}

function Placeholder() {
	return (
		<div className={tw({ p: "8", textColor: "gray-300" })}>
			<p className={tw({ textColor: "gray-300" })}>Building the playground…</p>
		</div>
	);
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const page = (path: string) =>
	createRoute({ getParentRoute: () => rootRoute, path, component: Placeholder });

export const routeTree = rootRoute.addChildren([
	page("/"),
	page("/conflicts"),
	page("/semantic-tokens"),
	page("/responsive"),
	page("/atoms"),
]);

export const router = createRouter({ routeTree });
