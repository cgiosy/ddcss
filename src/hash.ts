import xxh32 from "xxh32";

const encoder = new TextEncoder();

const hashCode = (str: string) => (
	(xxh32(encoder.encode(str)) >>> 1)
		.toString(36)
		.padStart(7, "_")
);

export default hashCode;
