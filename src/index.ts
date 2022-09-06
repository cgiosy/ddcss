import { camelToKebab } from "./util";
import hashCode from "./hash";

const macroSymbol = Symbol("$$css.mvar");

type Falsy = false | 0 | 0n | "" | null | undefined | void;

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Uppercase = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M"
				| "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";
type Lowercase = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m"
				| "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z";
type Char = "_" | Digit | Uppercase | Lowercase;

type Macro = {
	fn: MacroFn,
	table: MacroTable | null,
};
type MacroFn = (arg: any) => CSSObject;
type MacroTable = {
	[K: string]: Macro;
	[macroSymbol]: (key: string) => string;
};

type Callback = () => void;
type TickFn = (callback: Callback) => unknown;
type FlushFn = (textContent: string) => string | void;
type FilterFn = (hash: string, obj: CSSObject) => boolean;
type FilterGenerator = () => FilterFn;

export type CSSObject = {
	[K: string]: any;
	[K: `@${string}` | `${string}&${string}`]: CSSObject;
	[K: `$$${Char}${string}`]: MacroFn;
	[K: `$${Char}${string}`]: string | number;
	$$?: (key: string) => string | Falsy;
};

const macroVarPattern = /\\?\$\$[a-zA-Z0-9_]+/g;
const variablePattern = /\\?\$[a-zA-Z0-9_]+/g;
const propertyPattern = /^\$?[a-zA-Z0-9_]+$/;

const keyToProp = (key: string) => (
	key[0] === "$"
		? `--${camelToKebab(key.slice(1))}`
		: camelToKebab(key)
);

const nameToVar = (name: string) => `var(--${camelToKebab(name)})`;

const copy = (obj: any) => Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);

const chain = <T, T1, T2>(fn: (key: T) => T1, next: (key: T) => T2) => (
	(key: T): Exclude<T1, Falsy> | T2 => (fn(key) || next(key)) as any
);

const initialMacros = Object.assign(Object.create(null), { [macroSymbol]: nameToVar });

const stringify = (
	obj: CSSObject,
	parent: string,
	macros: MacroTable,
	outMacros?: MacroTable,
) => {
	const { classBody, outsideCss } = _stringify(obj, parent, macros, outMacros);
	return classBody === ""
		? outsideCss
		: `${parent}{${classBody}}${outsideCss}`;
};

const _stringify = (
	obj: CSSObject,
	parent: string,
	inMacros: MacroTable,
	outMacros?: MacroTable,
) => {
	const macros: MacroTable = Object.create(inMacros);
	let classBody = "";
	let outsideCss = "";

	for (const key of Object.keys(obj)) {
		const value = obj[key];
		if (key[0] === "$" && key[1] === "$") {
			if (key.length === 2) {
				macros[macroSymbol] = chain(value, macros[macroSymbol]);
				continue;
			}

			const macroKey = key.slice(2);
			const guard = macroKey[0]!.toUpperCase() !== macroKey[0];
			const macro: Macro = {
				fn: value,
				table: guard ? copy(macros) : null,
			};
			macros[macroKey] = macro;
		} else if (key in macros) {
			const { fn, table } = macros[key]!;
			const result = _stringify(fn(value), parent, table ?? copy(macros), macros);
			classBody += result.classBody;
			outsideCss += result.outsideCss;
		} else if (propertyPattern.test(key)) {
			const prop = keyToProp(key);
			const body = typeof value === "string"
				? value
					.replace(macroVarPattern, (match) => (
						match[0] === "\\"
							? match
							: macros[macroSymbol](match.slice(2))
					))
					.replace(variablePattern, (match) => (
						match[0] === "\\"
							? match
							: nameToVar(match.slice(1))
					))
				: value;
			classBody += `${prop}:${body};`;
		} else if (key[0] === "@") {
			const body = stringify(value, parent, macros);
			if (body !== "") outsideCss += `${key}{${body}}`;
		} else {
			const selector = (
				parent
					.split(",")
					.map((parentSelector) => {
						const selector = parentSelector.trim();
						return key.replace(/\\?&/g, (match) => (
							match[0] === "\\"
								? match
								: selector
						));
					})
					.join(",")
			);
			outsideCss += stringify(value, selector, macros);
		}
	}
	if (outMacros !== undefined) Object.assign(outMacros, macros);

	return {
		classBody,
		outsideCss,
	};
};

const addToHead = (textContent: string) => {
	const style = document.createElement("style");
	style.textContent = textContent;
	document.head.appendChild(style);
};

const basicFilterGenerator = () => {
	const filterSet = new Set();
	return (hash: string) => {
		if (filterSet.has(hash)) return false;
		filterSet.add(hash);
		return true;
	};
};

const $$css = (globalObj: CSSObject | CSSObject[] = {}, {
	root = ":root",
	tick = (queueMicrotask || setTimeout) as TickFn,
	flush = addToHead as FlushFn,
	filter = basicFilterGenerator as FilterGenerator,
} = {}) => {
	const checkFilter = filter();
	const macros = Object.create(initialMacros);
	let textContent = "";
	let flushing = false;
	const tickFlush = (str = "") => {
		textContent += str;
		if (textContent !== "" && !flushing) {
			flushing = true;
			tick(() => {
				flushing = false;
				textContent = flush(textContent) || "";
				tickFlush();
			});
		}
	};
	for (const obj of [globalObj].flat())
		tickFlush(stringify(obj, root, copy(macros), macros));

	const $css = (obj: CSSObject, className: string) => stringify(obj, className, macros);
	const css = (obj: CSSObject, className?: string) => {
		if (className !== undefined) {
			const result = $css(obj, className);
			const hash = hashCode(result);
			if (checkFilter(hash, obj)) tickFlush(result);
			return className;
		}

		const result = $css(obj, ".$&");
		const hash = hashCode(result);
		if (checkFilter(hash, obj)) tickFlush(result.replace(/\.\$&/g, `.${hash}`));
		return hash;
	};
	return {
		$css,
		css,
	};
};

export default $$css;
