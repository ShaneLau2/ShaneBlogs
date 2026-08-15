import { readFile, writeFile } from "./file-utils.js";

// 播放列表是结构化 JSON 数据，admin 直接读写该文件，
// 不再通过字符串拼接重建 musicConfig.ts。
const PLAYLIST_PATH = "src/data/music-playlist.json";

/** Read the playlist as an array (empty on missing/corrupt file). */
export function getPlaylist() {
	try {
		const parsed = JSON.parse(readFile(PLAYLIST_PATH));
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/** Prepend a song to the playlist and persist the file. Returns the new list. */
export function addToPlaylist(entry) {
	const list = getPlaylist();
	list.unshift(entry);
	writeFile(PLAYLIST_PATH, JSON.stringify(list, null, "\t") + "\n");
	return list;
}
