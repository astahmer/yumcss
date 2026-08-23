function useButton(variant: string) {
	return cx(
		variant === "primary"
			? "bg-indigo-600 text-white"
			: "bg-white text-indigo-600 border border-indigo-300",
		"rounded-lg px-5 py-2.5 font-semibold shadow",
	);
}
