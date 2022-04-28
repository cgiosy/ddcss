export const camelToKebab = (s: string) => s.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`);
