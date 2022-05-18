import { camelToKebab } from "./util";
import hashCode from "./hash";

const macroSymbol = Symbol("$$css.mvar");

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Uppercase = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M"
				| "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";
type Lowercase = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m"
				| "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z";
type Char = "_" | Digit | Uppercase | Lowercase;

type Macro = {
	fn: MacroFn,
	table: MacroTable,
};
type MacroFn = (arg: any) => CSSObject;
type MacroTable = {
	[K: string]: Macro;
	[macroSymbol]: (key: string) => string;
};

export type CSSObject = {
	[K: string]: unknown;
	[K: `@${string}` | `${string}&${string}`]: CSSObject;
	[K: `$$${Char}${string}`]: MacroFn;
	[K: `$${Char}${string}`]: string | number;
	$$?: (key: string) => (string | undefined);
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

const copy = (obj: any) => {
	const copied = Object.create(null);
	for (const key in obj)
		copied[key] = obj[key];
	return copied;
};

const chainMacroVarFn = <T1, T2>(fn: (key: string) => T1, next: (key: string) => T2) => (
	(key: string) => fn(key) ?? next(key)
);

const initialMacros = Object.assign(Object.create(null), { [macroSymbol]: nameToVar });

const stringify = (
	obj: CSSObject,
	parent: string,
	macros: MacroTable | undefined = initialMacros,
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
				macros[macroSymbol] = chainMacroVarFn(
					value as (key: string) => (string | undefined),
					macros[macroSymbol]
				);
				continue;
			}

			const macroKey = key.slice(2);
			const macro: Macro = {
				fn: value as MacroFn,
				table: copy(macros),
			};
			macros[macroKey] = macro;
		} else if (key in macros) {
			const { fn, table } = macros[key]!;
			const result = _stringify(fn(value), parent, table, macros);
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
			const body = stringify(value as CSSObject, parent, macros);
			if (body !== "") outsideCss += `${key}{${body}}`;
		} else {
			const selector = key.replace(/\\?&/g, (match) =>
				match[0] === "\\"
					? match
					: parent
			);
			outsideCss += stringify(value as CSSObject, selector, macros);
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

const filterSet = new Set();
const checkAndUpdateFilter = (hash: string) => {
	if (filterSet.has(hash)) return false;
	filterSet.add(hash);
	return true;
};

const $$css = (globalObj: CSSObject = {}, {
	root = ":root",
	tick = (queueMicrotask || setTimeout) as (callback: () => void) => unknown,
	flush = addToHead as (textContent: string) => string | void,
	filter = checkAndUpdateFilter as (hash: string, obj: CSSObject) => boolean,
} = {}) => {
	const macros = initialMacros;
	let textContent = "";
	const tickFlush = (str: string = "") => {
		textContent += str;
		tick(() => {
			if (textContent === "") return;
			textContent = flush(textContent) || "";
		})
	};
	tickFlush(stringify(globalObj, root, undefined, macros));

	const $css = (obj: CSSObject, className: string) => stringify(obj, className, macros);
	const css = (obj: CSSObject, className?: string) => {
		if (className !== undefined) {
			const result = $css(obj, className);
			const hash = hashCode(result);
			if (filter(hash, obj)) tickFlush(result);
			return className;
		}

		const result = $css(obj, ".$&");
		const hash = hashCode(result);
		if (filter(hash, obj)) tickFlush(result.replace(/\.\$&/g, `.${hash}`));
		return hash;
	};
	return {
		$css,
		css,
	};
};

export default $$css;
