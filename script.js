// --- 状態管理 ---
const state = {
    current_step: 0,
    selected_names: [],
    all_characters: [],
    maps: [],
    // エンジン用データキャッシュ
    data: {
        s2: null,     // シート2 (マップ勝率)
        s3: null,     // シート3 (相性)
        sAnti: null,  // アンチピック係数
        sRole: null,  // キャラ役割
        sWeight: null // キャラスコア決め方
    }
};

// ドラフトの順番定義 (0-5: BAN, 6-11: PICK)
const slot_definitions = [
    { team: "先攻", type: "ban" }, { team: "先攻", type: "ban" }, { team: "先攻", type: "ban" },
    { team: "後攻", type: "ban" }, { team: "後攻", type: "ban" }, { team: "後攻", type: "ban" },
    { team: "先攻", type: "pick" }, { team: "後攻", type: "pick" }, { team: "後攻", type: "pick" },
    { team: "先攻", type: "pick" }, { team: "先攻", type: "pick" }, { team: "後攻", type: "pick" }
];

// --- UI要素 ---
const rankingList = document.getElementById("ranking-list");
const searchField = document.getElementById("search-field");
const mapDropdown = document.getElementById("map-dropdown");
const historyText = document.getElementById("selection-history");
const refreshBtn = document.getElementById("refresh-btn");

// --- データ読み込み ---
async function loadJSON(filename) {
    try {
        const response = await fetch(`data/${filename}`);
        if (!response.ok) throw new Error(`Fetch error: ${response.status}`);
        const data = await response.json();
        return data.values || data;
    } catch (e) {
        console.error(`Error loading ${filename}:`, e);
        return null;
    }
}

// --- 初期化 ---
async function init() {
    const [s2, s3, sAnti, sRole, sWeight, mapMaster] = await Promise.all([
        loadJSON("シート2.json"),
        loadJSON("シート3.json"),
        loadJSON("アンチピック係数.json"),
        loadJSON("キャラ役割.json"),
        loadJSON("キャラスコア決め方.json"),
        loadJSON("マップ.json")
    ]);

    state.data = { s2, s3, sAnti, sRole, sWeight };

    if (s2) {
        state.all_characters = s2[0].slice(1).filter(name => name);
    }
    if (mapMaster) {
        // マップ.jsonからマップ名リストを作成
        state.maps = mapMaster.slice(1).map(row => row[1]).filter(name => name);
    }

    createSlots();
    populateMapDropdown();
    updateRankingDisplay();
    updateHighlights();
    
    searchField.addEventListener("input", updateRankingDisplay);
    mapDropdown.addEventListener("change", updateRankingDisplay);
    refreshBtn.addEventListener("click", () => location.reload());
}

// --- 計算エンジン ---

function calculateScores() {
    const mapName = mapDropdown.value;
    if (!mapName || mapName === "選択なし" || !state.data.s2) return [];

    // 今何番目のピックか判断 (0:先1 〜 5:後3)
    const pickIdx = state.current_step - 6;
    if (pickIdx < 0) return []; // BANフェーズは計算なし

    const wData = state.data.sWeight[pickIdx + 1];
    const w = {
        map: parseFloat(wData[2]) / 100 || 0,
        anti: parseFloat(wData[3]) / 100 || 0,
        e1: parseFloat(wData[4]) / 100 || 0,
        e2: parseFloat(wData[5]) / 100 || 0,
        e3: parseFloat(wData[6]) / 100 || 0,
        skill: parseFloat(wData[7]) / 100 || 0,
        ms: parseFloat(wData[8]) / 100 || 0
    };

    const MAX_TOTAL = 11250;
    const charHeader = state.data.s2[0];
    const mapRow = state.data.s2.find(r => r[0] === mapName);
    const roleNames = state.data.sRole[0];

    // 敵キャラの特定 (GASのインデックスをそのまま移植)
    const picksOnly = state.selected_names.slice(6);
    const enemyPosMap = [[1, 2, 5], [0, 3, 4], [0, 3, 4], [1, 2, 5], [1, 2, 5], [0, 3, 4]];
    const enemies = enemyPosMap[pickIdx].map(i => picksOnly[i]).filter(n => n && n !== "選択なし");

    // 自チームのMid有無確認
    const sidePosMap = [[0, 3, 4], [1, 2, 5], [1, 2, 5], [0, 3, 4], [0, 3, 4], [1, 2, 5]];
    const hasMid = sidePosMap[pickIdx].some(i => {
        const name = picksOnly[i];
        if (!name) return false;
        let col = roleNames.indexOf(name);
        return col !== -1 && state.data.sRole[31][col] !== "";
    });

    let ranking = [];
    charHeader.slice(1).forEach(name => {
        if (!name || state.selected_names.includes(name)) return;

        let fMap = getMapFactor(name, mapRow, charHeader);
        let fAnti = getAntiFactor(name, state.data.sAnti);
        let fSkill = getSkillFactor(name, roleNames, state.data.sRole);
        let fMS = getMSFactor(name, roleNames, state.data.sRole, hasMid);

        let fE1 = enemies.length > 0 ? getAffinityFactor(name, enemies[0], state.data.s3) : 0;
        let fE2 = enemies.length > 1 ? getAffinityFactor(name, enemies[1], state.data.s3) : 0;
        let fE3 = enemies.length > 2 ? getAffinityFactor(name, enemies[2], state.data.s3) : 0;

        let totalScore = (fMap * w.map + fAnti * w.anti + fSkill * w.skill + fMS * w.ms + fE1 * w.e1 + fE2 * w.e2 + fE3 * w.e3) * MAX_TOTAL;

        ranking.push({ name, score: Math.floor(totalScore) });
    });

    return ranking.sort((a, b) => b.score - a.score);
}

// --- 係数計算用ヘルパー ---

function getMapFactor(name, mapRow, header) {
    let idx = header.indexOf(name);
    if (!mapRow || idx === -1) return 0.5;
    let val = String(mapRow[idx]);
    let match = val.match(/\(([^)]+)\)/);
    if (match && parseInt(match[1]) <= 100) return 0.1; // 100戦以下は低評価
    let winRate = parseFloat(val.split("%")[0]) || 0;
    return Math.max(0, Math.min(1, (winRate - 40) / 20));
}

function getAntiFactor(name, data) {
    let nameRowIdx = data.findIndex(r => r.includes(name));
    if (nameRowIdx === -1) return 0.5;
    let colIdx = data[nameRowIdx].indexOf(name);
    let scoreRow = data[nameRowIdx + 1];
    let val = scoreRow ? parseFloat(scoreRow[colIdx]) : 5;
    return val / 9;
}

function getSkillFactor(name, roleNames, roleData) {
    let col = roleNames.indexOf(name);
    let val = (col !== -1 && roleData[37][col] !== "") ? parseFloat(roleData[37][col]) : 5;
    return val / 9;
}

function getMSFactor(name, roleNames, roleData, hasMid) {
    let col = roleNames.indexOf(name);
    if (col === -1) return 0.5;
    let isMid = roleData[31][col] !== "";
    let isSide = roleData[32][col] !== "";
    let val = (!hasMid) ? (isMid ? 9 : 3) : (isSide ? 9 : 1);
    return val / 9;
}

function getAffinityFactor(me, enemy, s3) {
    let eIdx = s3[0].indexOf(enemy);
    let myRow = s3.find(r => r[0] === me);
    let val = (eIdx !== -1 && myRow && myRow[eIdx] !== "") ? parseFloat(myRow[eIdx]) : 5;
    return val / 9;
}

// --- UI表示更新 ---

function updateRankingDisplay() {
    const searchQuery = searchField.value.toLowerCase();
    const rankedData = calculateScores();
    
    rankingList.innerHTML = "";
    
    // 計算結果があれば使い、BAN中や未計算なら全キャラを表示
    const displayList = rankedData.length > 0 
        ? rankedData 
        : state.all_characters.map(n => ({name: n, score: "-"}));

    displayList.forEach(item => {
        if ((searchQuery && !item.name.toLowerCase().includes(searchQuery)) || state.selected_names.includes(item.name)) {
            return;
        }
        
        const li = document.createElement("li");
        li.className = "ranking-item";
        li.innerHTML = `
            <div class="char-name">${item.name}</div>
            <div class="char-score">Score: ${item.score}</div>
        `;
        li.addEventListener("click", () => onCharClick(item.name));
        rankingList.appendChild(li);
    });
}

function onCharClick(name) {
    if (state.current_step >= slot_definitions.length) return;
    if (state.selected_names.includes(name)) return;
    
    const targetSlot = document.getElementById(`slot-${state.current_step}`);
    targetSlot.textContent = name;
    targetSlot.classList.remove("active");
    targetSlot.classList.add("selected");
    
    state.selected_names.push(name);
    historyText.textContent = state.selected_names.join(" > ");
    searchField.value = ""; 
    
    state.current_step++;
    updateHighlights();
    updateRankingDisplay();
}

function createSlots() {
    const containers = {
        "先攻-ban": document.getElementById("slots-先攻-ban"),
        "先攻-pick": document.getElementById("slots-先攻-pick"),
        "後攻-ban": document.getElementById("slots-後攻-ban"),
        "後攻-pick": document.getElementById("slots-後攻-pick")
    };
    Object.values(containers).forEach(c => c.innerHTML = "");
    slot_definitions.forEach((def, index) => {
        const slot = document.createElement("div");
        slot.className = `slot slot-${def.type}`;
        slot.id = `slot-${index}`;
        slot.textContent = "?";
        containers[`${def.team}-${def.type}`].appendChild(slot);
    });
}

function populateMapDropdown() {
    mapDropdown.innerHTML = '<option value="選択なし">Select Map</option>';
    state.maps.forEach(mapName => {
        const option = document.createElement("option");
        option.value = mapName;
        option.textContent = mapName;
        mapDropdown.appendChild(option);
    });
}

function updateHighlights() {
    document.querySelectorAll(".slot").forEach(el => el.classList.remove("active"));
    if (state.current_step < slot_definitions.length) {
        const currentSlot = document.getElementById(`slot-${state.current_step}`);
        if (currentSlot) currentSlot.classList.add("active");
    }
}

init();
