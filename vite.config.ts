import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		outputTruncateLength: 1000,
		// reporters: "verbose",
	},
});
