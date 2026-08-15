export type FrontmatterData = Record<string, unknown>;

/** Parse markdown content with a `---` frontmatter block. */
export declare function parseFrontmatter(content: string): {
	data: FrontmatterData;
	body: string;
};

/** Serialize a frontmatter object plus body into markdown content. */
export declare function buildFrontmatter(
	data: FrontmatterData,
	body: string,
): string;
