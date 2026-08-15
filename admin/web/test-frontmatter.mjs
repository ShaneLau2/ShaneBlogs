import { parseFrontmatter, buildFrontmatter } from "./frontmatter.js";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
	if (cond) {
		passed++;
		console.log(`  ✅ ${name}`);
	} else {
		failed++;
		console.log(`  ❌ ${name} ${extra}`);
	}
}

function eq(name, actual, expected) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	check(name, a === e, `— got ${a}, want ${e}`);
}

console.log("— parsing —");

{
	const { data, body } = parseFrontmatter("---\ntitle: Hello World\ndraft: true\ncount: 42\n---\n\nBody text");
	eq("scalars", data, { title: "Hello World", draft: true, count: 42 });
	eq("body", body, "Body text");
}

{
	const { data } = parseFrontmatter('---\ntitle: "A: B \\"quoted\\" done"\n---\n\nx');
	eq("double-quoted with escapes", data, { title: 'A: B "quoted" done' });
}

{
	const { data } = parseFrontmatter("---\ntitle: 'it''s fine'\n---\n\nx");
	eq("single-quoted with ''", data, { title: "it's fine" });
}

{
	const { data } = parseFrontmatter("---\ntags: [a, b, \"c d\"]\n---\n\nx");
	eq("inline array", data, { tags: ["a", "b", "c d"] });
}

{
	const { data } = parseFrontmatter("---\nmeta: {a: 1, b: \"x:y\"}\n---\n\nx");
	eq("inline object", data, { meta: { a: 1, b: "x:y" } });
}

{
	const { data } = parseFrontmatter("---\ndescription: |\n  line one\n  line two\n\n  para two\n---\n\nx");
	eq("literal block |", data, { description: "line one\nline two\n\npara two" });
}

{
	const { data } = parseFrontmatter("---\ndescription: >\n  line one\n  line two\n---\n\nx");
	eq("folded block >", data, { description: "line one line two" });
}

{
	const { data } = parseFrontmatter("---\nsocial:\n  github: alice\n  twitter: bob\n---\n\nx");
	eq("nested object", data, { social: { github: "alice", twitter: "bob" } });
}

{
	const { data } = parseFrontmatter("---\nfriends:\n  - name: a\n    url: /a\n  - name: b\n    url: /b\n---\n\nx");
	eq("block array of objects", data, {
		friends: [
			{ name: "a", url: "/a" },
			{ name: "b", url: "/b" },
		],
	});
}

{
	const { data } = parseFrontmatter("---\nlist:\n  - one\n  - two\n  - 3\n---\n\nx");
	eq("block array of scalars", data, { list: ["one", "two", 3] });
}

{
	const { data } = parseFrontmatter("---\ntitle: plain\n---\n\n# comment line\ntext");
	eq("plain continuation stops at shallower line", data, { title: "plain" });
	// body kept intact
}

{
	const { data } = parseFrontmatter("---\nnote: this is a\n  longer plain value\n---\n\nx");
	eq("plain multi-line continuation", data, { note: "this is a longer plain value" });
}

{
	const { data } = parseFrontmatter("---\nwhen: 2026-07-24T10:00:00.000Z\n---\n\nx");
	eq("iso date stays a string", data, { when: "2026-07-24T10:00:00.000Z" });
}

console.log("— building —");

{
	const out = buildFrontmatter({ title: "Hello", draft: true, tags: ["a", "b"] }, "Body");
	const { data, body } = parseFrontmatter(out);
	eq("simple round-trip", data, { title: "Hello", draft: true, tags: ["a", "b"] });
	eq("body round-trip", body, "Body");
}

{
	const data = { description: "line one\nline two", nested: { a: 1, b: "x" }, friends: [{ name: "a" }, { name: "b" }], empty: [], nothing: null };
	const out = buildFrontmatter(data, "B");
	const parsed = parseFrontmatter(out);
	eq("complex round-trip", parsed.data, data);
}

{
	const data = { title: 'Has "quotes" and : colon and # hash' };
	const out = buildFrontmatter(data, "B");
	const parsed = parseFrontmatter(out);
	eq("quoting round-trip", parsed.data, data);
}

{
	// real-world post frontmatter
	const fm = {
		title: "Welcome to My Blog",
		published: "2026-07-26",
		description: "A short description with: colon and \"quotes\"",
		tags: ["astro", "firefly"],
		category: "Tech",
		draft: false,
		pinned: true,
		image: "",
		comment: true,
		password: "",
	};
	const out = buildFrontmatter(fm, "Content here");
	const parsed = parseFrontmatter(out);
	eq("real post frontmatter round-trip", parsed.data, fm);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
