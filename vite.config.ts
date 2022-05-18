import { defineConfig } from "vitest/config";

// https://github.com/vitejs/vite/issues/7843

export default defineConfig({
	test: {
		outputTruncateLength: 1000,
		// reporters: "verbose",
	},
});
