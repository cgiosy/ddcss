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
		$$css: (obj?: CSSObject | CSSObject[], userConfig?: object) => $$css(obj, {
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
		css({ "& > *": { font: 32 } });
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic multiple css with macros", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({ $$font: (value) => ({ fontSize: `${value}px` }) });
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

	test("basic multiple selectors with macros", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({ $$_hover: (value) => ({ "&:hover, &:active": value }) });
		css({ ".a, .b, .c": { _hover: { display: "none" } } });
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic multiple objects with macros", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css([
			{ $$font: (value) => ({ fontSize: `${value}px` }) },
			{ $$font2: (value) => ({ font: value * 2 }) },
			{ $$font3: (value) => ({ font2: value * 3 }) },
		]);
		css({ font3: 16 });
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic duplicate filtering", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css();
		css({ fontSize: "1rem" });
		css({ fontSize: "1rem" });
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic macro variable", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$: (value) => /^\d+dp$/.test(value) && `${Number(value.slice(0, -2)) / 16}rem`,
			fontSize: "16dp",
		});
		css({
			$$: (value) => /^\$\$\d+dp$/.test(value) && `${Number(value.slice(2, -2))}rem`,
			fontSize: "$$10dp",
		});
		css({ fontSize: "18dp" });
		expect(getOutput()).toMatchSnapshot();
	});

	test("basic quotes", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({ $$: (value) => value.replace(/\\'quotes\\'/, "[REDACTED]") });
		css({ $x: "'https://example.com/\\'quotes\\''" });
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

	test("macro combination 1", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		const { css } = $$css({
			$$: (value) => /^\d+dp$/.test(value) && `${Number(value.slice(0, -2)) / 16}rem`,
			$$fontSize: (value) => ({ fontSize: value }),
			fontSize: "16dp",
		});
		css({ fontSize: "14dp" });
		css({ fontSize: "18dp" });
		expect(getOutput()).toMatchSnapshot();
	});

	test("macro combination 2", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		$$css({
			$$: (value) => /^[\d.]+dp$/.test(value) && `${Number(value.slice(0, -2)) / 16}rem`,
			$x: `16dp'16dp"24dp"32dp'32dp`,
			$y: `16dp '16dp "24dp" 32dp' 32dp`,
			$z: `1.234dp`,
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

	test("macro declaration in macro", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		$$css([
			{ $$f: (x) => ({ $$g: (y) => ({ $x: x + Number(y) }) }) },
			{
				f: 100,
				$$h1: (x) => ({ g: x + 10 }),
			},
			{
				f: 200,
				$$h2: (x) => ({ g: x + 20 }),
			},
			{
				h1: 1,
				h2: 2,
			},
		]);
		expect(getOutput()).toMatchSnapshot();
	});

	test("macro without guard", ({ expect }) => {
		const { $$css, getOutput } = ddcss();
		$$css([
			{ $$F: (x) => ({ f: x + 100 }) },
			{
				$$f: (x) => ({ $x: x + 10 }),
				F: 1,
			},
			{
				$$f: (x) => ({ $x: x + 20 }),
				F: 1,
			},
		]);
		expect(getOutput()).toMatchSnapshot();
	});
});
