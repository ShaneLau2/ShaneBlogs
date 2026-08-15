import type { MusicPlayerConfig } from "../types/musicConfig";
// 播放列表是结构化数据，由 admin 面板直接读写，避免字符串拼接破坏配置文件
import playlist from "../data/music-playlist.json";

export const musicPlayerConfig: MusicPlayerConfig = {
	showInNavbar: true,
	showInSidebar: true,
	mode: "local",
	volume: 0.7,
	playMode: "list",
	showLyrics: true,
	meting: {
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		server: "netease",
		type: "playlist",
		id: "",
		auth: "",
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},
	local: {
		playlist,
	},
};
