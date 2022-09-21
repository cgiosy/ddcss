import { camelToKebab } from "./util";
import hashCode from "./hash";

const tokenSymbol = Symbol("$$css.token");

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
type TokenFn = (key: string, property: string) => string | Falsy;
type MacroTable = {
	[K: string]: Macro;
	[tokenSymbol]: TokenFn;
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
	$$?: TokenFn;
};

const isProperty = (key: string): key is `$${Char}${string}` => /^\$?[0-9A-Za-z_]+$/.test(key);
const isMacroKey = (key: string): key is `$$${Char}${string}` => key[0] === "$" && key[1] === "$";
const isAtRule = (key: string): key is `@${string}` => key[0] === "@";

const keyToProp = (key: string) => (
	key[0] === "$"
		? `--${camelToKebab(key.slice(1))}`
		: camelToKebab(key)
);

const tokenFallback = (key: string) => (
	key[0] === "$"
		? `var(--${camelToKebab(key.slice(1))})`
		: key
);

const copy = (obj: any) => Object.assign(Object.create(Object.getPrototypeOf(obj)), obj);

const chain = <T extends unknown[], T1, T2>(fn: (...args: T) => T1, next: (...args: T) => T2) => (
	(...args: T): Exclude<T1, Falsy> | T2 => (fn(...args) || next(...args)) as any
);

const initialMacros: MacroTable = Object.assign(
	Object.create(null),
	{ [tokenSymbol]: tokenFallback },
);

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
		let value = obj[key];
		if (isMacroKey(key)) {
			if (key.length === 2) {
				macros[tokenSymbol] = chain(value, macros[tokenSymbol]);
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
		} else if (isProperty(key)) {
			value = value.toString();
			const macro = macros[tokenSymbol];
			const prop = keyToProp(key);
			const len = value.length | 0;
			let body = "";
			let cur = 0;
			let last = 0;
			let quote = 0;
			while (cur < len) {
				const c = value.charCodeAt(cur);
				const next = cur + 1 | 0;
				if (quote === 0) {
					// [^0-9A-Za-z$_\\-]
					if (!(
						48 <= c && c <= 57
						|| 65 <= c && c <= 90
						|| 97 <= c && c <= 122
						|| c === 36
						|| c === 45
						|| c === 92
						|| c === 95
					)) {
						if (last < cur) {
							body += macro(value.slice(last, cur), key);
							last = cur;
						}

						// [^'"]
						if (c !== 34 && c !== 39) {
							body += String.fromCharCode(c);
							last = next;
						} else quote = c;
					}
				} else if (quote === c) {
					quote = 0;
					body += macro(value.slice(last, next), key);
					last = next;
				}
				cur = next;
			}
			if (last < len) body += macro(value.slice(last), key);
			classBody += `${prop}:${body};`;
		} else if (isAtRule(key)) {
			const body = stringify(value, parent, macros);
			if (body !== "") outsideCss += `${key}{${body}}`;
		} else {
			const selectors = (
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
			outsideCss += stringify(value, selectors, macros);
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
			tick(tickFlush2);
		}
	};
	const tickFlush2 = () => {
		flushing = false;
		textContent = flush(textContent) || "";
		tickFlush();
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
