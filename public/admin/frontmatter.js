/**
 * Shared frontmatter (mini-YAML) parser + serializer.
 *
 * Single source of truth for reading/writing `---` frontmatter blocks, used by:
 *   - the admin SPA (browser, loaded via <script src="frontmatter.js">)
 *   - the local admin Express server (admin/utils/file-utils.js)
 *   - the Astro API route (src/pages/api/dynamic.json.ts)
 *
 * Supports:
 *   - scalars: strings, numbers, booleans, null
 *   - single/double-quoted strings with escape sequences (\" \\ \n \t \uXXXX)
 *   - inline arrays  [a, b, "c"]  and inline objects  {a: 1, b: "x"}
 *   - block arrays   - item   (including arrays of mappings)
 *   - nested objects via indentation
 *   - multi-line values: literal block `|` and folded block `>`
 *   - plain multi-line scalar continuation (folded with single spaces)
 *
 * Pure ESM, zero dependencies — runs in browsers and Node alike.
 */

/** Leading whitespace width of a line (tabs expanded to 2 columns). */
function leadingWidth(line) {
	return line.replace(/\t/g, "  ").length - line.trimStart().replace(/\t/g, "  ").length;
}

function isBlank(line) {
	return line.trim() === "";
}

/* ------------------------------------------------------------------ */
/* Value parsing                                                       */
/* ------------------------------------------------------------------ */

const ESCAPES = {
	n: "\n",
	t: "\t",
	r: "\r",
	"0": "\0",
	"\\": "\\",
	'"': '"',
	"'": "'",
};

function parseEscapes(raw) {
	return raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (m, esc) => {
		if (esc[0] === "u") return String.fromCharCode(parseInt(esc.slice(1), 16));
		return esc in ESCAPES ? ESCAPES[esc] : esc;
	});
}

function parseDoubleQuoted(body) {
	return parseEscapes(body);
}

function parseSingleQuoted(body) {
	return body.replace(/''/g, "'");
}

/** Split an inline array/object body into top-level comma-separated segments. */
function splitTopLevel(body) {
	const parts = [];
	let depth = 0;
	let current = "";
	let quote = null;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (quote) {
			current += ch;
			if (quote === '"' && ch === "\\") {
				current += body[i + 1] ?? "";
				i++;
			} else if (ch === quote) {
				quote = null;
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === "[" || ch === "{" || ch === "(") depth++;
		if (ch === "]" || ch === "}" || ch === ")") depth--;
		if (ch === "," && depth === 0) {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	if (current.trim() !== "" || parts.length === 0) parts.push(current);
	return parts;
}

/** Parse a YAML scalar string into a JS value. */
function parseScalar(raw) {
	const s = raw.trim();
	if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") return null;
	if (s === "true" || s === "True" || s === "TRUE") return true;
	if (s === "false" || s === "False" || s === "FALSE") return false;
	if (/^[+-]?\d+$/.test(s)) {
		const n = Number(s);
		if (Number.isSafeInteger(n)) return n;
	}
	if (/^[+-]?(\d+\.\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
	if (s.startsWith('"')) {
		if (s.length >= 2 && s.endsWith('"')) return parseDoubleQuoted(s.slice(1, -1));
		return s;
	}
	if (s.startsWith("'")) {
		if (s.length >= 2 && s.endsWith("'")) return parseSingleQuoted(s.slice(1, -1));
		return s;
	}
	if (s.startsWith("[") && s.endsWith("]")) {
		const inner = s.slice(1, -1).trim();
		if (inner === "") return [];
		return splitTopLevel(inner).map((seg) => parseScalar(seg));
	}
	if (s.startsWith("{") && s.endsWith("}")) {
		const inner = s.slice(1, -1).trim();
		if (inner === "") return {};
		const obj = {};
		for (const seg of splitTopLevel(inner)) {
			const ci = findKeyColon(seg);
			if (ci === -1) continue;
			obj[parseKey(seg.slice(0, ci))] = parseScalar(seg.slice(ci + 1));
		}
		return obj;
	}
	return s;
}

/** Find the first top-level `:` separating key from value. */
function findKeyColon(s) {
	let depth = 0;
	let quote = null;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (quote) {
			if (quote === '"' && ch === "\\") {
				i++;
			} else if (ch === quote) {
				quote = null;
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === "[" || ch === "{" || ch === "(") depth++;
		if (ch === "]" || ch === "}" || ch === ")") depth--;
		if (ch === ":" && depth === 0) return i;
	}
	return -1;
}

function parseKey(raw) {
	const s = raw.trim();
	if (s.startsWith('"') && s.endsWith('"')) return parseDoubleQuoted(s.slice(1, -1));
	if (s.startsWith("'") && s.endsWith("'")) return parseSingleQuoted(s.slice(1, -1));
	return s;
}

/* ------------------------------------------------------------------ */
/* Indentation-based block parsing                                     */
/* ------------------------------------------------------------------ */

function parseBlock(lines) {
	const root = {};
	parseNode(lines, 0, -1, root, true);
	return root;
}

/**
 * Consume lines at a level deeper than minIndent, filling `target`.
 *
 * @returns {number} new index
 */
function parseNode(lines, index, minIndent, target, isMapping) {
	while (index < lines.length) {
		const raw = lines[index];
		if (isBlank(raw)) {
			index++;
			continue;
		}
		const indent = leadingWidth(raw);
		if (indent <= minIndent) break;

		const line = raw.trim();
		if (isMapping) {
			if (line.startsWith("- ") || line === "-") break;
			const ci = findKeyColon(line);
			if (ci === -1) {
				target[line] = null;
				index++;
				continue;
			}
			const key = parseKey(line.slice(0, ci));
			const rest = line.slice(ci + 1).trim();
			index = parseValue(lines, index, indent, key, rest, target);
		} else {
			if (!(line.startsWith("- ") || line === "-")) break;
			const rest = line === "-" ? "" : line.slice(2).trim();
			index = parseSequenceItem(lines, index, indent, rest, target);
		}
	}
	return index;
}

function parseValue(lines, index, indent, key, rest, target) {
	// Block scalars: literal | and folded >
	if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-" || rest === "|+" || rest === ">+") {
		const folded = rest.startsWith(">");
		const keepEnd = rest.endsWith("+");
		target[key] = readBlockScalar(lines, index + 1, indent, folded, keepEnd);
		return consumeBlockEnd(lines, index, indent);
	}
	// Empty value — a nested node follows on deeper lines, or null
	if (rest === "") {
		const next = index + 1;
		if (next < lines.length && !isBlank(lines[next]) && leadingWidth(lines[next]) > indent) {
			const childIndent = leadingWidth(lines[next]);
			if (lines[next].trim().startsWith("- ")) {
				const arr = [];
				const ni = parseNode(lines, next, childIndent - 1, arr, false);
				target[key] = arr;
				return ni;
			}
			const obj = {};
			const ni = parseNode(lines, next, childIndent - 1, obj, true);
			target[key] = obj;
			return ni;
		}
		target[key] = null;
		return index + 1;
	}
	// Plain scalar that may continue on more-indented following lines (folded)
	if (
		!rest.startsWith("[") &&
		!rest.startsWith("{") &&
		!rest.startsWith('"') &&
		!rest.startsWith("'")
	) {
		const pieces = [rest];
		let j = index + 1;
		while (j < lines.length && !isBlank(lines[j]) && leadingWidth(lines[j]) > indent) {
			const sub = lines[j].trim();
			const ci = findKeyColon(sub);
			// a deeper mapping/sequence on the next line ends the scalar
			if ((ci !== -1 && !startsWithInline(sub.slice(ci + 1).trim()) && ci > 0) || sub.startsWith("- ")) break;
			pieces.push(sub);
			j++;
		}
		if (pieces.length === 1) {
			target[key] = parseScalar(rest);
			return index + 1;
		}
		target[key] = pieces.join(" ");
		return j;
	}
	target[key] = parseScalar(rest);
	return index + 1;
}

function startsWithInline(v) {
	return v.startsWith('"') || v.startsWith("'") || v.startsWith("[") || v.startsWith("{");
}

/** Read a literal (`|`) or folded (`>`) block scalar's indented lines. */
function readBlockScalar(lines, index, indent, folded, keepEnd) {
	const out = [];
	let i = index;
	let blockIndent = null;
	while (i < lines.length) {
		const raw = lines[i];
		if (isBlank(raw)) {
			out.push("");
			i++;
			continue;
		}
		const w = leadingWidth(raw);
		if (w <= indent) break;
		if (blockIndent === null) blockIndent = w;
		out.push(raw.slice(Math.min(blockIndent, w)));
		i++;
	}
	while (out.length > 0 && out[out.length - 1] === "" && !keepEnd) out.pop();
	if (folded) {
		const result = [];
		let prevBlank = false;
		for (const l of out) {
			if (l === "") {
				prevBlank = true;
			} else {
				if (result.length > 0 && !prevBlank) {
					result[result.length - 1] += " " + l;
				} else {
					result.push(l);
				}
				prevBlank = false;
			}
		}
		return result.join("\n");
	}
	return out.join("\n");
}

function consumeBlockEnd(lines, index, indent) {
	let i = index + 1;
	while (i < lines.length) {
		if (isBlank(lines[i])) {
			i++;
			continue;
		}
		if (leadingWidth(lines[i]) <= indent) break;
		i++;
	}
	return i;
}

/** Parse a sequence item (the part after `- `), which may be a mapping. */
function parseSequenceItem(lines, index, indent, rest, target) {
	if (rest === "") {
		const next = index + 1;
		if (next < lines.length && !isBlank(lines[next]) && leadingWidth(lines[next]) > indent) {
			const childIndent = leadingWidth(lines[next]);
			const item = {};
			const ni = parseNode(lines, next, childIndent - 1, item, true);
			target.push(item);
			return ni;
		}
		target.push(null);
		return index + 1;
	}
	const ci = findKeyColon(rest);
	if (ci !== -1) {
		// `- key: value` — a mapping item; consume its sibling keys too
		const item = {};
		let j = parseValue(lines, index, indent, parseKey(rest.slice(0, ci)), rest.slice(ci + 1).trim(), item);
		while (j < lines.length) {
			const raw = lines[j];
			if (isBlank(raw)) {
				j++;
				continue;
			}
			const w = leadingWidth(raw);
			if (w <= indent) break;
			const sub = raw.trim();
			const sci = findKeyColon(sub);
			if (sci === -1 || sub.startsWith("- ")) break;
			j = parseValue(lines, j, w, parseKey(sub.slice(0, sci)), sub.slice(sci + 1).trim(), item);
		}
		target.push(item);
		return j;
	}
	target.push(parseScalar(rest));
	return index + 1;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Parse markdown content with a `---` frontmatter block.
 *
 * @param {string} content
 * @returns {{ data: Record<string, unknown>, body: string }}
 */
export function parseFrontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { data: {}, body: content };
	return { data: parseBlock(match[1].split(/\r?\n/)), body: match[2].trim() };
}

/* ------------------------------------------------------------------ */
/* Serializer                                                          */
/* ------------------------------------------------------------------ */

const QUOTE_NEEDED = /^[\s\-?:,\[\]{}#&*!|>'"%@`]|[\s:#]$|[\n\r]|:\s| #/;
const LOOKS_LIKE = /^(true|false|null|~|[-+]?\d+(\.\d+)?([eE][+-]?\d+)?)$/i;

function isSimpleString(v) {
	return typeof v === "string" && !QUOTE_NEEDED.test(v) && !LOOKS_LIKE.test(v);
}

function quoteString(v) {
	return (
		'"' +
		v
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"')
			.replace(/\n/g, "\\n")
			.replace(/\t/g, "\\t")
			.replace(/\r/g, "\\r") +
		'"'
	);
}

function serializeKey(key) {
	const s = String(key);
	return isSimpleString(s) ? s : quoteString(s);
}

/** Inline serialization for scalar/leaf values (never spans multiple lines). */
function serializeScalarInline(v) {
	if (v === null || v === undefined) return "null";
	if (typeof v === "boolean") return v ? "true" : "false";
	if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
	if (typeof v === "string") {
		if (v === "") return '""';
		return isSimpleString(v) ? v : quoteString(v);
	}
	if (Array.isArray(v)) {
		if (v.length === 0) return "[]";
		return "[" + v.map((x) => serializeScalarInline(x)).join(", ") + "]";
	}
	if (typeof v === "object") {
		const keys = Object.keys(v);
		if (keys.length === 0) return "{}";
		return "{" + keys.map((k) => serializeKey(k) + ": " + serializeScalarInline(v[k])).join(", ") + "}";
	}
	return "null";
}

/** True when a value needs the multi-line block form. */
function isBlocky(v) {
	if (v === null || v === undefined || typeof v !== "object") return false;
	if (Array.isArray(v)) return v.length > 0 && v.some((x) => x !== null && typeof x === "object");
	return Object.keys(v).length > 0 && Object.values(v).some((x) => x !== null && typeof x === "object");
}

/** Serialize a nested value as indented block lines. */
function serializeBlockValue(value, indent) {
	const pad = "\t".repeat(indent);
	const out = [];
	if (Array.isArray(value)) {
		for (const item of value) {
			if (item && typeof item === "object" && !Array.isArray(item)) {
				const keys = Object.keys(item);
				keys.forEach((k, i) => {
					const v = item[k];
					const prefix = i === 0 ? pad + "- " : pad + "\t";
					if (isBlocky(v)) {
						out.push(prefix + serializeKey(k) + ":");
						out.push(...serializeBlockValue(v, indent + (i === 0 ? 1 : 2)));
					} else {
						out.push(prefix + serializeKey(k) + ": " + serializeScalarInline(v));
					}
				});
			} else if (Array.isArray(item)) {
				out.push(pad + "-");
				out.push(...serializeBlockValue(item, indent + 1));
			} else {
				out.push(pad + "- " + serializeScalarInline(item));
			}
		}
	} else {
		for (const k of Object.keys(value)) {
			const v = value[k];
			if (isBlocky(v)) {
				out.push(pad + serializeKey(k) + ":");
				out.push(...serializeBlockValue(v, indent + 1));
			} else {
				out.push(pad + serializeKey(k) + ": " + serializeScalarInline(v));
			}
		}
	}
	return out;
}

/**
 * Serialize a frontmatter object plus body into markdown content.
 *
 * @param {Record<string, unknown>} data
 * @param {string} body
 * @returns {string}
 */
export function buildFrontmatter(data, body) {
	const lines = [];
	for (const k of Object.keys(data || {})) {
		const v = data[k];
		if (v === null || v === undefined) {
			lines.push(serializeKey(k) + ": null");
			continue;
		}
		if (isBlocky(v)) {
			lines.push(serializeKey(k) + ":");
			lines.push(...serializeBlockValue(v, 1));
			continue;
		}
		lines.push(serializeKey(k) + ": " + serializeScalarInline(v));
	}
	return "---\n" + lines.join("\n") + "\n---\n\n" + (body || "");
}
