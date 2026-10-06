import { useEffect, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import "yumcss:css";
import { css } from "./css.ts";

function HydrationFixture() {
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);

	const output = css.vars({ color: "#2563eb", _hover: { color: "#dc2626" } });
	return (
		<section
			data-testid="hydration-target"
			data-phase={hydrated ? "client" : "server"}
			className={output.class}
			style={output.style}
		>
			hydration fixture
		</section>
	);
}

const root = document.getElementById("root");
if (root === null) throw new Error("hydration fixture root is missing");
hydrateRoot(root, <HydrationFixture />);
