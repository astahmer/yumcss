import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

export type ThemeMode = "dark" | "light";

interface ThemeContextValue {
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = "yumcss-playground-theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const readInitialTheme = (): ThemeMode => {
	try {
		const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
		if (stored === "light" || stored === "dark") return stored;
	} catch {
		return "dark";
	}
	return "dark";
};

export function ThemeProvider(props: { children: ReactNode }) {
	const [mode, setMode] = useState<ThemeMode>(readInitialTheme);

	useLayoutEffect(() => {
		document.documentElement.dataset.theme = mode;
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, mode);
		} catch {
			return;
		}
	}, [mode]);

	return <ThemeContext.Provider value={{ mode, setMode }}>{props.children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => {
	const context = useContext(ThemeContext);
	if (context === undefined) throw new Error("useTheme must be used inside ThemeProvider");
	return context;
};
