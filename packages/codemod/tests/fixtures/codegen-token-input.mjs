const circular = {};
circular.self = circular;

export const tokenPreset = {
	conditions: { dark: ".dark &" },
	tokens: {
		colors: {
			blue: "#123456",
			nullable: { $value: null },
			circular: { $value: circular },
		},
		semantic: {
			surface: { base: "#ffffff", dark: "#111111" },
		},
	},
};
