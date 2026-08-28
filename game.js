/* ワードウルフ ゲームロジック
   QUESTIONS: [[category, val1, val2], ...] は questions.js で読み込み済み
   category: 1=スポーツ 2=生活 3=恋愛 4=有名人 5=観光地 6=食べ物・飲み物 7=ランダム
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

// アプリ全体の状態（ページ遷移せず単一ファイルで完結させるため sessionStorage は使わず変数管理）
const state = {
	playercount: 4,
	wordwolfcount: 1,
	talktime: 180, // 秒
	category: 1,
	members: [],
	val1: "",
	val2: "",
	odaimap: "",
	mode: 0
};

/* ---------- 初期化 ---------- */

function buildCategoryGrid(gridId, selectedId, onSelect){
	const grid = document.getElementById(gridId);
	grid.innerHTML = "";
	CATEGORIES.forEach(cat => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "cat-btn" + (cat.random ? " random" : "") + (cat.id === selectedId ? " selected" : "");
		btn.dataset.catId = cat.id;
		btn.textContent = cat.name;
		btn.onclick = () => {
			onSelect(cat.id);
			grid.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("selected"));
			btn.classList.add("selected");
		};
		grid.appendChild(btn);
	});
}

function onTimeInput(el, type){
	// 数字以外を除去
	let v = el.value.replace(/[^0-9]/g, "");
	if(v.length > 2) v = v.slice(0, 2);

	let num = v === "" ? 0 : (v - 0);
	if(type === "min"){
		if(num > 30) num = 30;
	} else {
		if(num > 59) num = 59;
	}
	el.value = v === "" ? "" : String(num);

	const min = document.getElementById("talktime_min").value - 0;
	const sec = document.getElementById("talktime_sec").value - 0;
	state.talktime = min * 60 + sec;
}

function normalizeTimeInputs(){
	const minEl = document.getElementById("talktime_min");
	const secEl = document.getElementById("talktime_sec");
	if(minEl.value === "") minEl.value = "0";
	if(secEl.value === "") secEl.value = "0";
	secEl.value = secEl.value.length === 1 ? "0" + secEl.value : secEl.value;
	state.talktime = (minEl.value - 0) * 60 + (secEl.value - 0);
}

function changeCount(type, delta){
	if(type === "player"){
		let v = state.playercount + delta;
		if(v < 3) v = 3;
		if(v > 16) v = 16;
		state.playercount = v;
		document.getElementById("playercount-val").innerHTML = v + "<small>人</small>";
		if(state.wordwolfcount >= state.playercount){
			state.wordwolfcount = state.playercount - 1;
			document.getElementById("wolfcount-val").innerHTML = state.wordwolfcount + "<small>人</small>";
		}
	} else {
		let v = state.wordwolfcount + delta;
		if(v < 1) v = 1;
		if(v > state.playercount - 1) v = state.playercount - 1;
		state.wordwolfcount = v;
		document.getElementById("wolfcount-val").innerHTML = v + "<small>人</small>";
	}
}

/* ---------- 画面遷移 ---------- */

function goScreen(name){
	document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
	document.getElementById("screen-" + name).classList.add("active");
	window.scrollTo(0, 0);
}

/* ---------- ステップ1: 部屋作成 ---------- */

function pickQuestion(catId){
	let pool;
	if(catId === 7){
		pool = QUESTIONS.filter(q => q[0] === 7);
	} else {
		pool = QUESTIONS.filter(q => q[0] === catId);
	}
	if(pool.length === 0) pool = QUESTIONS;
	const rnd = Math.floor(Math.random() * pool.length);
	return pool[rnd];
}

function makeStr(chr, cnt){
	let str = "";
	for(let i = 0; i < cnt; i++) str += chr;
	return str;
}

function makeOdaiMap(){
	let map = makeStr("0", state.playercount - state.wordwolfcount) + makeStr("1", state.wordwolfcount);
	map = map.split("").sort(() => Math.random() - 0.5).join("");
	state.odaimap = map;
}

function roommakeNext(){
	normalizeTimeInputs();
	let error = false;
	if(state.playercount < 3){
		document.getElementById("error_playercount").style.display = "block";
		error = true;
	} else {
		document.getElementById("error_playercount").style.display = "none";
	}
	if(state.wordwolfcount < 1 || state.wordwolfcount >= state.playercount){
		document.getElementById("error_wordwolfcount").style.display = "block";
		error = true;
	} else {
		document.getElementById("error_wordwolfcount").style.display = "none";
	}
	if(state.talktime <= 0){
		document.getElementById("error_talktime").style.display = "block";
		error = true;
	} else {
		document.getElementById("error_talktime").style.display = "none";
	}
	if(error){
		alert("入力内容に誤りがあります。");
		return;
	}

	const q = pickQuestion(state.category);
	state.val1 = q[1];
	state.val2 = q[2];
	makeOdaiMap();

	// 前回と同じ人数分の名前がすでにあれば、名前入力を省略して続行する
	if(state.members.length === state.playercount){
		startOdaiCheck();
	} else {
		buildNameInputs();
		goScreen("names");
	}
}

/* ---------- ステップ2: 名前入力 ---------- */

function buildNameInputs(){
	const names = document.getElementById("names");
	names.innerHTML = "";
	state.members = [];
	for(let i = 0; i < state.playercount; i++){
		const input = document.createElement("input");
		input.type = "text";
		input.className = "name-input";
		input.id = "name" + i;
		input.maxLength = 20;
		input.placeholder = (i + 1) + "人目の名前";
		names.appendChild(input);
	}
}

function nameNext(){
	let error = false;
	const members = [];
	for(let i = 0; i < state.playercount; i++){
		const v = document.getElementById("name" + i).value.trim();
		if(v.length === 0) error = true;
		members.push(v);
	}
	if(error){
		alert("全員の名前を入力してください。");
		return;
	}
	state.members = members;
	startOdaiCheck();
}

/* ---------- ステップ3: お題確認（順番に端末を回す） ---------- */

function catName(){
	const c = CATEGORIES.find(c => c.id === state.category);
	return c ? c.name : "";
}

function buildOdaiDots(){
	const dotsWrap = document.getElementById("odai-dots");
	dotsWrap.innerHTML = "";
	for(let i = 0; i < state.playercount; i++){
		const s = document.createElement("span");
		s.id = "dot" + i;
		dotsWrap.appendChild(s);
	}
}

function updateOdaiDots(currentId){
	for(let i = 0; i < state.playercount; i++){
		const dot = document.getElementById("dot" + i);
		dot.classList.remove("done", "current");
		if(i < currentId) dot.classList.add("done");
		else if(i === currentId) dot.classList.add("current");
	}
}

function startOdaiCheck(){
	buildOdaiDots();
	document.getElementById("odai-category").textContent = catName();
	goScreen("odai");
	odaiCheck(0);
}

function odaiCheck(id){
	const badge = document.getElementById("odai-player");
	badge.style.display = "";
	badge.textContent = state.members[id] + " さん";
	updateOdaiDots(id);
	document.getElementById("msg").innerHTML = "";
	document.getElementById("msg2").innerHTML = "端末を渡してください";
	document.getElementById("next").innerHTML = "自分が持ちました";
	document.getElementById("nowId").value = id;
	state.mode = 0;
}

function nextMemberOdai(){
	if(state.mode === 0){
		const id = document.getElementById("nowId").value - 0;
		let odai = state.odaimap.charAt(id) === "0" ? state.val1 : state.val2;
		document.getElementById("msg").innerHTML = state.members[id] + " さんのお題は…";
		document.getElementById("msg2").innerHTML = odai;
		document.getElementById("next").innerHTML = "確認した（次の人へ）";
		state.mode = 1;
	} else {
		const nextId = (document.getElementById("nowId").value - 0) + 1;
		if(nextId === state.playercount){
			startCheck();
		} else {
			odaiCheck(nextId);
		}
	}
}

function startCheck(){
	document.getElementById("odai-player").style.display = "none";
	document.getElementById("msg").innerHTML = "";
	document.getElementById("msg2").innerHTML = "全員の確認が終わりました。";
	document.getElementById("next").setAttribute("onclick", "startGame();");
	document.getElementById("next").innerHTML = "トークスタート！";
}

/* ---------- ステップ4: トーク（タイマー） ---------- */

function startGame(){
	document.getElementById("next").setAttribute("onclick", "nextMemberOdai();");
	document.getElementById("game-category").textContent = catName();
	goScreen("game");
	timer();
}

function restartTimer(){
	timer();
}

function cancelGame(){
	if(timerInterval) clearInterval(timerInterval);
	resetAll();
}

function frontZero(num){
	if(num < 10) return "0" + num;
	return "" + num;
}

let timerInterval = null;

function timer(){
	if(timerInterval) clearInterval(timerInterval);
	const timerSec = state.talktime - 0;
	const timeEl = document.getElementById("time");
	const ringEl = document.querySelector(".timer-circle");
	if(timerSec <= 0){
		timeEl.textContent = "∞";
		if(ringEl) ringEl.style.setProperty("--progress", 1);
		return;
	}
	const startTime = Date.now() / 1000;
	timeEl.textContent = frontZero((timerSec / 60) | 0) + ":" + frontZero(timerSec % 60);
	if(ringEl) ringEl.style.setProperty("--progress", 1);
	timerInterval = setInterval(() => {
		const currentTime = Date.now() / 1000;
		let sec = timerSec - Math.floor(currentTime - startTime);
		if(sec < 0) sec = 0;
		timeEl.textContent = frontZero((sec / 60) | 0) + ":" + frontZero(sec % 60);
		if(ringEl) ringEl.style.setProperty("--progress", Math.max(sec / timerSec, 0));
		if(sec === 0){
			clearInterval(timerInterval);
			confirmFinish();
		}
	}, 250);
}

/* ---------- ステップ4.5: 終了確認（ワンクッション） ---------- */

function confirmFinish(){
	if(timerInterval) clearInterval(timerInterval);
	goScreen("confirm");
}

/* ---------- ステップ5: 結果発表 ---------- */

function revealAnswers(){
	setAnnounce();
	goScreen("finish");
}

function setAnnounce(){
	const wrap = document.getElementById("waitmember");
	wrap.innerHTML = "";
	for(let i = 0; i < state.playercount; i++){
		const odai = state.odaimap.charAt(i) === "0" ? state.val1 : state.val2;
		const isWolf = state.odaimap.charAt(i) === "1";
		const p = document.createElement("p");
		p.className = isWolf ? "is-wolf" : "";
		p.innerHTML = (isWolf ? "🐺 [ウルフ] " : "🙂 [市民] ") + state.members[i] + " さんは <b>" + odai + "</b> でした";
		wrap.appendChild(p);
	}
}

/* 同じメンバー・同じ設定でもう一度（お題だけ引き直す） */
/* 結果画面：同じテーマのままお題だけ引き直して続行 */
function sameThemeContinue(){
	const q = pickQuestion(state.category);
	state.val1 = q[1];
	state.val2 = q[2];
	makeOdaiMap();
	startOdaiCheck();
}

/* お題だけ変更する専用画面を開く（現在のテーマを初期選択にする） */
let odaiChangeCategory = null;

function openOdaiChange(){
	odaiChangeCategory = state.category;
	buildCategoryGrid("cat-grid-change", odaiChangeCategory, (id) => { odaiChangeCategory = id; });
	goScreen("odaichange");
}

function applyOdaiChange(){
	state.category = odaiChangeCategory;
	const q = pickQuestion(state.category);
	state.val1 = q[1];
	state.val2 = q[2];
	makeOdaiMap();
	startOdaiCheck();
}

/* 最初からやり直す */
function resetAll(){
	state.members = [];
	buildCategoryGrid("cat-grid", state.category, (id) => { state.category = id; });
	goScreen("setup");
}

/* ---------- 起動 ---------- */

window.addEventListener("DOMContentLoaded", () => {
	state.talktime = 180;
	document.getElementById("talktime_min").addEventListener("blur", normalizeTimeInputs);
	document.getElementById("talktime_sec").addEventListener("blur", normalizeTimeInputs);
	buildCategoryGrid("cat-grid", state.category, (id) => { state.category = id; });
});
