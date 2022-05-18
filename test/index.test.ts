import { describe, test } from "vitest";

import $$css, { CSSObject } from "../src";

const ddcss = () => {
	let output = "";
	const config = {
		tick: (callback: () => void) => callback(),
		flush: (text: string) => {
			output += text;
		},
	};
	return {
		$$css: (obj?: CSSObject, userConfig?: object) => $$css(obj, {
			...config,
			...userConfig,
		}),
		getOutput: () => output,
	};
};

describe("basic", () => {
	test("empty args", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css();
		css({});
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic props and children", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({ $16dp: "1rem" });
		css({
			"& > *": {
				fontSize: "$16dp",
				color: "red",
			},
		});
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic macros", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$font: (value) => ({
				fontSize: `${value}px`,
				fontFamily: "serif",
			}),
		});
		css({
			"& > *": {
				font: 32,
				color: "red",
			},
		});
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic multiple css with macros", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$font: (value) => ({
				fontSize: `${value}px`,
				fontFamily: "serif",
			}),
		});
		css({
			$$font2: (value) => ({ font: value * 2 }),
			font2: 16,
		});
		css({
			$$font2: (value) => ({ font: value * 3 }),
			font2: 16,
		});
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic duplicate filtering", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$font: (value) => ({
				fontSize: `${value}px`,
				fontFamily: "serif",
			}),
		});
		css({ font: 16 });
		css({ font: 16 });
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic macro variable", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$: (key) => key.match(/^\d+dp$/) && `${Number(key.slice(0, -2)) / 16}rem`,
			fontSize: "16dp",
		});
		css({ fontSize: 14 });
		css({ fontSize: 18 });
		expect(getOutput()).toMatchSnapshot();
	});
});

describe.concurrent("macros", () => {
	test("recursive-like macros", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$userSelect: (value) => ({
				WebkitUserDrag: value,
				WebkitUserSelect: value,
				userSelect: value,
			}),
		});
		css({ userSelect: "none" });
		expect(getOutput()).toMatchSnapshot();
	});

	test("nested macros", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$f: (value) => ({ $x: `${value}f` }),
			$$g: (value) => ({ $y: `${value}g` }),
			"& > *": {
				$$f: (value) => ({ f: `${value}F` }),
				$$g: (value) => ({ g: `${value}G` }),
				f: ">",
				g: ">",
			},
			f: "&",
			g: "&",
		});
		css({
			f: "^",
			g: "^",
		});
		expect(getOutput()).toMatchSnapshot();
	});

	test("complex macros", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		$$css({
			$$f: (a) => ({ $$g: (b) => ({ $$h: (c) => ({ $x: a * 100 + b * 10 + c }) }) }),
			"& > *": {
				"& > *": {
					f: 1,
					g: 2,
					h: 3,
				},
				f: 4,
				g: 5,
				h: 6,
			},
			h: 9,
		});
		expect(getOutput()).toMatchSnapshot();
	});

	test("complex macro variables", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$dp: (value) => ({
				fontSize: value > 0 ? `$$${value}dp` : "1rem",
				$$: (key) => key.match(/^\d+dp$/) && `${Number(key.slice(0, -2)) / 16}rem`,
			}),
			dp: 0,

			$$f: (value) => ({ dp: value * 2 }),
			$$g: (value) => ({ dp: value * 3 }),
		});
		css({
			dp: 16,
			"& > *": {
				$$f: (value) => ({ f: value * 4 }),
				$$g: (value) => ({ g: value * 5 }),
				f: 1,
				g: 2,
			},
			f: 1,
			g: 2,
		});
		css({
			dp: 14,
			"& > *": {
				$$f: (value) => ({ f: value * 4 }),
				$$g: (value) => ({ g: value * 5 }),
				f: 1,
				g: 2,
			},
			f: 1,
			g: 2,
		});
		expect(getOutput()).toMatchSnapshot();
	});
});
