import { Link, createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { tw } from "./tw.ts";
import { EXAMPLES } from "./lib/examples.ts";
import { PlaygroundPage } from "./components/PlaygroundPage.tsx";

const NAV = EXAMPLES.map((example) => ({ path: example.path, label: example.title }));

function Shell() {
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
			<main className={tw({ grow: true, overflow: "hidden" })}>
				<Outlet />
			</main>
		</div>
	);
}

const rootRoute = createRootRoute({ component: Shell });

export const routeTree = rootRoute.addChildren(
	EXAMPLES.map((example) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path: example.path,
			component: () => <PlaygroundPage def={example} />,
		}),
	),
);

export const router = createRouter({ routeTree });
