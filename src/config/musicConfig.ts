import type { MusicPlayerConfig } from "../types/musicConfig";

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
		playlist: [
			{
				name: "Wiz Khalifa See You Again ft. Charlie Puth [Official Video] Furious 7 Soundtrack",
				artist: "Unknown",
				url: "/assets/music/Wiz Khalifa - See You Again ft Charlie Puth Official Video Furious 7 Soundtrack.mp3",
				cover: "",
				lrc: "",
			},
			{
				name: "Charlie Puth We Don't Talk Anymore (feat. Selena Gomez) [Official Video]",
				artist: "Unknown",
				url: "/assets/music/Charlie Puth - We Dont Talk Anymore (feat Selena Gomez) Official Video.mp3",
				cover: "",
				lrc: "",
			},
		],
	},
};
