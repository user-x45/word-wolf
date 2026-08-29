/* ワードウルフ ONLINE - フロントエンド
   WORKER_URL は config.js で定義されている想定
*/

const CATEGORIES = [
	{ id: 1, name: "スポーツ" },
	{ id: 2, name: "生活" },
	{ id: 3, name: "恋愛" },
	{ id: 4, name: "有名人" },
	{ id: 5, name: "観光地" },
	{ id: 6, name: "食べ物・飲み物" },
	{ id: 7, name: "ランダム", random: true }
];

const state = {
	playercount: 4,
	wolfcount: 1,
	talktime: 180,
	category: 1,
	roomId: null,
	isHost: false,
	playerId: null,
	ws: null,
	settings: null,
	lastPlayers: [],
	selectedVote: null,
	changeThemeCategory: 1,
	gameEnded: false // ゲームが異常終了/エラー終了した後の再接続防止フラグ
};

/* ---------- 画面遷移 ---------- */

// ホストが「ゲームを終了する」ボタンを出してよい画面（ロビー作成後〜結果画面まで）
const HOST_END_VISIBLE_SCREENS = ["share", "waiting", "game", "vote", "result", "changetheme"];

function goScreen(name){
	document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
	document.getElementById("screen-" + name).classList.add("active");
	const onlineLink = document.getElementById("online-link");
	if(onlineLink) onlineLink.style.display = (name === "setup") ? "" : "none";
	window.scrollTo(0, 0);
	updateHostEndButtonVisibility(name);
}

function updateHostEndButtonVisibility(screenName){
	const btn = document.getElementById("host-end-fixed");
	if(!btn) return;
	const show = state.isHost && !!state.ws && HOST_END_VISIBLE_SCREENS.includes(screenName);
	btn.style.display = show ? "block" : "none";
}

function confirmHostEnd(){
	if(!state.ws) return;
	const ok = window.confirm("本当にゲームを終了しますか？参加者全員に通知され、ルームは終了します。");
	if(!ok) return;
	try{
		state.ws.send(JSON.stringify({ type: "hostEnd" }));
	}catch(e){ /* ignore */ }
	const btn = document.getElementById("host-end-fixed");
	if(btn) btn.disabled = true;
}

function showError(message){
	stopTimer();
	document.getElementById("error-detail").textContent = message;
	goScreen("error");
}

/* ---------- カテゴリグリッド ---------- */

function buildCategoryGrid(gridId, selectedId, onSelect){
	const grid = document.getElementById(gridId);
	grid.innerHTML = "";
	CATEGORIES.forEach(cat => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "cat-btn" + (cat.random ? " random" : "") + (cat.id === selectedId ? " selected" : "");
		btn.textContent = cat.name;
		btn.onclick = () => {
			onSelect(cat.id);
			grid.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("selected"));
			btn.classList.add("selected");
		};
		grid.appendChild(btn);
	});
}

function catName(id){
	const c = CATEGORIES.find(c => c.id === id);
	return c ? c.name : "";
}

/* ---------- セットアップ画面の入力操作 ---------- */

function changeCount(type, delta){
	if(type === "player"){
		let v = state.playercount + delta;
		if(v < 3) v = 3;
		if(v > 16) v = 16;
		state.playercount = v;
		document.getElementById("playercount-val").innerHTML = v + "<small>人</small>";
		if(state.wolfcount >= state.playercount){
			state.wolfcount = state.playercount - 1;
			document.getElementById("wolfcount-val").innerHTML = state.wolfcount + "<small>人</small>";
		}
	} else {
		let v = state.wolfcount + delta;
		if(v < 1) v = 1;
		if(v > state.playercount - 1) v = state.playercount - 1;
		state.wolfcount = v;
		document.getElementById("wolfcount-val").innerHTML = v + "<small>人</small>";
	}
}

function onTimeChange(){
	const minEl = document.getElementById("talktime_min");
	const secEl = document.getElementById("talktime_sec");
	let min = minEl.value.replace(/[^0-9]/g, "");
	let sec = secEl.value.replace(/[^0-9]/g, "");
	if(min === "") min = "0";
	if(sec === "") sec = "0";
	min = Math.min(30, Number(min));
	sec = Math.min(59, Number(sec));
	minEl.value = String(min);
	secEl.value = sec < 10 ? "0" + sec : String(sec);
	state.talktime = min * 60 + sec;
}

/* ---------- ルーム作成（ホスト） ---------- */

async function createRoom(){
	onTimeChange();
	const nameInput = document.getElementById("hostname-input");
	const name = nameInput.value.trim();
	document.getElementById("error_hostname").style.display = name ? "none" : "block";
	document.getElementById("error_talktime").style.display = state.talktime > 0 ? "none" : "block";
	document.getElementById("error_create").textContent = "";
	if(!name || state.talktime <= 0) return;

	const btn = document.getElementById("create-room-btn");
	btn.disabled = true;
	btn.textContent = "作成中...";
	try{
		const res = await fetch(WORKER_URL + "/api/rooms", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				hostName: name,
				playercount: state.playercount,
				wolfcount: state.wolfcount,
				talktime: state.talktime,
				category: state.category
			})
		});
		const data = await res.json();
		if(!res.ok){
			document.getElementById("error_create").textContent = "ルーム作成に失敗しました: " + (data.error || "");
			document.getElementById("error_create").style.display = "block";
			return;
		}
		state.roomId = data.roomId;
		state.isHost = true;
		updateUrlRoomParam(state.roomId);
		connectWebSocket(name);
	}catch(e){
		document.getElementById("error_create").textContent = "サーバーに接続できませんでした。WORKER_URL の設定を確認してください。";
		document.getElementById("error_create").style.display = "block";
	}finally{
		btn.disabled = false;
		btn.textContent = "ルームを作成する";
	}
}

/* ---------- 参加者フロー ---------- */

async function joinRoom(){
	const nameInput = document.getElementById("joinname-input");
	const name = nameInput.value.trim();
	document.getElementById("error_joinname").style.display = name ? "none" : "block";
	document.getElementById("error_join").textContent = "";
	if(!name) return;
	state.isHost = false;
	connectWebSocket(name);
}

/* ---------- URLで指定されたルームコードの存在確認 ---------- */

async function checkRoomAndProceedToJoin(){
	try{
		const res = await fetch(WORKER_URL + "/api/rooms/status?room=" + encodeURIComponent(state.roomId));
		let data = null;
		try{ data = await res.json(); }catch(e){ /* ignore parse error */ }
		if(!res.ok || !data || !data.exists){
			showError("入力されたルームコードは存在しません。URLが正しいか確認するか、ホストに新しいURLを発行してもらってください。");
			return;
		}
		if(data.phase && data.phase !== "lobby"){
			showError("このルームはすでにゲームが開始されているため参加できません。");
			return;
		}
		goScreen("join-name");
	}catch(e){
		showError("サーバーに接続できませんでした。WORKER_URL の設定を確認してください。");
	}
}

/* ---------- URLのルームコード／状態パラメータを動的に更新 ---------- */

function updateUrlRoomParam(roomId){
	const url = new URL(location.href);
	if(roomId){
		url.searchParams.set("room", roomId);
		url.searchParams.delete("join");
	} else {
		url.searchParams.delete("room");
	}
	history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
}

/* ---------- ルームコード手動入力（直接アクセス・やり直し用） ---------- */

function submitEnterCode(){
	const input = document.getElementById("enter-code-input");
	const err = document.getElementById("error_enter_code");
	const code = input.value.trim().toUpperCase();
	if(!code){
		err.textContent = "ルームコードを入力してください";
		err.style.display = "block";
		return;
	}
	err.style.display = "none";
	state.roomId = code;
	document.getElementById("join-room-code").textContent = state.roomId;
	updateUrlRoomParam(state.roomId);
	checkRoomAndProceedToJoin();
}

/* ---------- 最初からやり直す ---------- */

function restartFlow(){
	if(state.isHost){
		// 主催者は今まで通り、完全にリロードしてホスト作成画面に戻す
		location.href = location.pathname;
		return;
	}
	// 参加者はページをリロードせず、ルームコード入力画面に戻す
	stopTimer();
	if(state.ws){
		state.gameEnded = true;
		try{ state.ws.close(); }catch(e){ /* ignore */ }
	}
	state.ws = null;
	state.roomId = null;
	state.playerId = null;
	state.settings = null;
	state.lastPlayers = [];
	state.selectedVote = null;
	state.gameEnded = false;

	const input = document.getElementById("enter-code-input");
	if(input) input.value = "";
	const err = document.getElementById("error_enter_code");
	if(err) err.style.display = "none";

	updateUrlRoomParam(null);
	goScreen("setup");
}

/* ---------- WebSocket 接続 ---------- */

function connectWebSocket(name){
	const wsUrl = WORKER_URL.replace(/^http/, "ws") + "/ws?room=" + encodeURIComponent(state.roomId) + "&name=" + encodeURIComponent(name);
	const ws = new WebSocket(wsUrl);
	state.ws = ws;
	state.gameEnded = false;

	ws.onopen = () => {
		// welcome メッセージを待つ
	};
	ws.onmessage = (evt) => {
		let msg;
		try{ msg = JSON.parse(evt.data); }catch(e){ return; }
		handleServerMessage(msg);
	};
	ws.onerror = () => {
		if(state.gameEnded) return;
		document.getElementById("error_join").textContent = "接続に失敗しました。ルームコードを確認してください。";
	};
	ws.onclose = () => {
		if(state.gameEnded) return; // すでにエラー画面を表示済み
		const phase = currentPhaseGuess();
		if(["game", "vote", "result"].includes(phase)){
			// ゲーム進行中に予期せず切断された
			showError("サーバーとの接続が切れました。ゲームを終了します。");
		}
	};
}

function currentPhaseGuess(){
	const active = document.querySelector(".screen.active");
	return active ? active.id.replace("screen-", "") : "";
}

/* ---------- サーバーからのメッセージ処理 ---------- */

function handleServerMessage(msg){
	switch(msg.type){
		case "welcome":
			state.playerId = msg.playerId;
			state.isHost = msg.isHost;
			state.settings = msg.settings;
			if(state.isHost){
				renderShareScreen();
				goScreen("share");
			} else {
				goScreen("waiting");
			}
			updateWaitingScreen(state.lastPlayers, msg.settings.playercount);
			break;
		case "players":
			state.lastPlayers = msg.players;
			updateWaitingScreen(msg.players, msg.needed);
			break;
		case "lobby":
			state.lastPlayers = msg.players;
			updateWaitingScreen(msg.players, msg.needed);
			goScreen("waiting");
			break;
		case "started":
			showGameScreen(msg);
			break;
		case "timeUp":
			state.lastPlayers = msg.players;
			showVoteScreen(msg.players);
			break;
		case "voteUpdate":
			document.getElementById("vote-status").textContent = msg.votedCount + " / " + msg.total + " 人が投票済み";
			break;
		case "result":
			showResultScreen(msg);
			break;
		case "sessionError":
			// 誰かのセッションが切れてゲームが強制終了した
			state.gameEnded = true;
			if(state.ws){
				try{ state.ws.close(); }catch(e){ /* ignore */ }
			}
			showError(msg.message || "参加者の接続が切れたため、ゲームを終了しました。");
			break;
	}
}

/* ---------- 共有画面 ---------- */

function renderShareScreen(){
	document.getElementById("share-room-code").textContent = state.roomId;
	const url = location.origin + location.pathname + "?room=" + state.roomId;
	document.getElementById("share-url").textContent = url;
}

function copyShareUrl(){
	const url = location.origin + location.pathname + "?room=" + state.roomId;
	const toast = document.getElementById("copy-toast");
	navigator.clipboard.writeText(url).then(() => {
		toast.textContent = "コピーしました！";
		setTimeout(() => { toast.textContent = ""; }, 2000);
	}).catch(() => {
		toast.textContent = "コピーに失敗しました。手動でコピーしてください。";
	});
}

/* ---------- 待機画面 ---------- */

function updateWaitingScreen(players, needed){
	const list = document.getElementById("player-list");
	list.innerHTML = "";
	players.forEach(p => {
		const li = document.createElement("li");
		li.className = p.connected ? "online" : "";
		li.innerHTML = '<span><span class="dot"></span>' + escapeHtml(p.name) + (p.isHost ? '<span class="host-tag">ホスト</span>' : '') + '</span>';
		list.appendChild(li);
	});
	const connectedCount = players.filter(p => p.connected).length;
	document.getElementById("waiting-count").textContent = connectedCount + " / " + needed + " 人";
	const startBtn = document.getElementById("start-game-btn");
	if(state.isHost){
		startBtn.style.display = "";
		startBtn.disabled = connectedCount < needed;
		document.getElementById("waiting-hint").textContent = connectedCount < needed
			? "全員揃うとゲームを開始できます"
			: "全員揃いました！開始しましょう";
	} else {
		startBtn.style.display = "none";
		document.getElementById("waiting-hint").textContent = connectedCount < needed
			? "ホストが開始するのを待っています…"
			: "まもなくホストがゲームを開始します";
	}
}

function sendStart(){
	if(state.ws) state.ws.send(JSON.stringify({ type: "start" }));
}

function escapeHtml(str){
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

/* ---------- ゲーム画面（お題・タイマー） ---------- */

let timerInterval = null;

function showGameScreen(msg){
	document.getElementById("game-category").textContent = msg.category;
	document.getElementById("game-word").textContent = msg.word;
	state.lastPlayers = msg.players;
	goScreen("game");
	startTimer(msg.endAt);
}

function frontZero(n){ return n < 10 ? "0" + n : "" + n; }

function startTimer(endAt){
	stopTimer();
	const timeEl = document.getElementById("time");
	const ringEl = document.querySelector(".timer-circle");
	const totalMs = Math.max(endAt - Date.now(), 1);
	const tick = () => {
		const remainMs = endAt - Date.now();
		let sec = Math.max(0, Math.ceil(remainMs / 1000));
		timeEl.textContent = frontZero((sec / 60) | 0) + ":" + frontZero(sec % 60);
		if(ringEl) ringEl.style.setProperty("--progress", Math.min(Math.max(remainMs / totalMs, 0), 1));
		if(sec <= 0){
			clearInterval(timerInterval);
			timerInterval = null;
		}
	};
	tick();
	timerInterval = setInterval(tick, 250);
}

function stopTimer(){
	if(timerInterval){
		clearInterval(timerInterval);
		timerInterval = null;
	}
}

/* ---------- 投票画面 ---------- */

function showVoteScreen(players){
	state.selectedVote = null;
	const grid = document.getElementById("vote-grid");
	grid.innerHTML = "";
	document.getElementById("vote-status").textContent = "";
	players.forEach(p => {
		if(p.id === state.playerId) return; // 自分には投票できない
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "vote-btn";
		btn.textContent = p.name;
		btn.onclick = () => {
			if(state.selectedVote) return; // 一度投票したら変更不可
			state.selectedVote = p.id;
			grid.querySelectorAll(".vote-btn").forEach(b => b.disabled = true);
			btn.classList.add("selected");
			state.ws.send(JSON.stringify({ type: "vote", target: p.id }));
			document.getElementById("vote-status").textContent = "投票しました。他の人の投票を待っています…";
		};
		grid.appendChild(btn);
	});
	goScreen("vote");
}

/* ---------- 結果画面 ---------- */

function showResultScreen(msg){
	const list = document.getElementById("result-list");
	list.innerHTML = "";
	msg.members.forEach(m => {
		const p = document.createElement("p");
		p.className = m.isWolf ? "is-wolf" : "";
		p.innerHTML = (m.isWolf ? "🐺 [ウルフ] " : "🙂 [市民] ") + escapeHtml(m.name) + " さんは <b>" + escapeHtml(m.word) + "</b> でした";
		list.appendChild(p);
	});

	const votesWrap = document.getElementById("result-votes");
	votesWrap.innerHTML = "";
	const nameById = {};
	msg.members.forEach(m => nameById[m.id] = m.name);
	const tallyEntries = Object.entries(msg.tally || {}).sort((a,b) => b[1]-a[1]);
	if(tallyEntries.length === 0){
		votesWrap.innerHTML = '<p style="opacity:.6;font-size:.9em;">投票なし</p>';
	} else {
		tallyEntries.forEach(([pid, count]) => {
			const row = document.createElement("p");
			row.style.margin = "4px 0";
			row.textContent = (nameById[pid] || "?") + "： " + count + " 票";
			votesWrap.appendChild(row);
		});
	}

	document.getElementById("host-controls").style.display = state.isHost ? "" : "none";
	document.getElementById("nonhost-wait").style.display = state.isHost ? "none" : "";
	goScreen("result");
}

function sendSameTheme(){
	if(state.ws) state.ws.send(JSON.stringify({ type: "sameTheme" }));
}

function openChangeTheme(){
	buildCategoryGrid("cat-grid-change", state.changeThemeCategory, (id) => { state.changeThemeCategory = id; });
	goScreen("changetheme");
}

function applyChangeTheme(){
	if(state.ws) state.ws.send(JSON.stringify({ type: "changeTheme", category: state.changeThemeCategory }));
}

/* ---------- 起動処理: URLパラメータで participant / host を判定 ---------- */

window.addEventListener("DOMContentLoaded", () => {
	document.getElementById("talktime_min").addEventListener("blur", onTimeChange);
	document.getElementById("talktime_sec").addEventListener("blur", onTimeChange);
	buildCategoryGrid("cat-grid", state.category, (id) => { state.category = id; });

	const params = new URLSearchParams(location.search);
	const roomParam = params.get("room");

	if(typeof WORKER_URL !== "string" || WORKER_URL.includes("YOUR-SUBDOMAIN")){
		showError("WORKER_URL が設定されていません。config.js を編集し、デプロイした Cloudflare Workers の URL を設定してください。");
		return;
	}

	if(roomParam){
		state.roomId = roomParam.toUpperCase();
		document.getElementById("join-room-code").textContent = state.roomId;
		checkRoomAndProceedToJoin();
	} else {
		goScreen("setup");
	}
});
