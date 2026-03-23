// --- 状態管理 (Fletのstate相当) ---
const state = {
    current_step: 0,
    selected_names: [],
    // テスト用のダミーデータ (後でJSON読み込みに変えます)
    all_characters: ["Shelly", "Colt", "Brock", "El Primo", "Poco", "Rosa", "Nita", "Bull"],
    maps: ["Map A", "Map B", "Map C"]
};

// スロットの定義（Fletの定義順と同じ）
const slot_definitions = [
    { team: "先攻", type: "ban" }, { team: "先攻", type: "ban" }, { team: "先攻", type: "ban" },
    { team: "後攻", type: "ban" }, { team: "後攻", type: "ban" }, { team: "後攻", type: "ban" },
    { team: "先攻", type: "pick" }, { team: "後攻", type: "pick" }, { team: "後攻", type: "pick" },
    { team: "先攻", type: "pick" }, { team: "先攻", type: "pick" }, { team: "後攻", type: "pick" }
];

// --- UI要素の取得 ---
const rankingList = document.getElementById("ranking-list");
const searchField = document.getElementById("search-field");
const mapDropdown = document.getElementById("map-dropdown");
const historyText = document.getElementById("selection-history");
const refreshBtn = document.getElementById("refresh-btn");

// --- 初期化処理 ---
function init() {
    createSlots();
    populateMapDropdown();
    updateRankingDisplay();
    updateHighlights();
    
    // イベントリスナーの紐付け
    searchField.addEventListener("input", updateRankingDisplay);
    mapDropdown.addEventListener("change", updateRankingDisplay);
    refreshBtn.addEventListener("click", () => location.reload());
}

// 1. スロットをHTMLで作る
function createSlots() {
    slot_definitions.forEach((def, index) => {
        const container = document.getElementById(`slots-${def.team}-${def.type}`);
        const slot = document.createElement("div");
        slot.className = `slot slot-${def.type}`;
        slot.id = `slot-${index}`;
        slot.textContent = "?";
        container.appendChild(slot);
    });
}

// 2. マップドロップダウンを埋める
function populateMapDropdown() {
    state.maps.forEach(map => {
        const option = document.createElement("option");
        option.value = map;
        option.textContent = map;
        mapDropdown.appendChild(option);
    });
}

// 3. ハイライトの更新 (Fletのupdate_highlights相当)
function updateHighlights() {
    // 全スロットからactiveクラスを消す
    document.querySelectorAll(".slot").forEach(el => el.classList.remove("active"));
    
    // 今のステップのスロットをactiveにする
    if (state.current_step < slot_definitions.length) {
        const currentSlot = document.getElementById(`slot-${state.current_step}`);
        currentSlot.classList.add("active");
    }
}

// 4. ランキング表示の更新 (Fletのupdate_ranking_display相当、ロジックはモック)
function updateRankingDisplay() {
    const searchQuery = searchField.value.toLowerCase();
    
    rankingList.innerHTML = ""; // 一旦クリア
    
    state.all_characters.forEach(name => {
        // 検索フィルタ & すでに選ばれたキャラは除外
        if ((searchQuery && !name.toLowerCase().includes(searchQuery)) || state.selected_names.includes(name)) {
            return;
        }
        
        const li = document.createElement("li");
        li.className = "ranking-item";
        li.innerHTML = `
            <div class="char-name">${name}</div>
            <div class="char-score">Score: -</div>
        `;
        li.addEventListener("click", () => onCharClick(name));
        rankingList.appendChild(li);
    });
}

// 5. キャラクリック時の動作 (Fletのon_char_click相当)
function onCharClick(name) {
    if (state.current_step >= slot_definitions.length) return;
    if (state.selected_names.includes(name)) return;
    
    // スロットを埋める
    const targetSlot = document.getElementById(`slot-${state.current_step}`);
    targetSlot.textContent = name;
    targetSlot.classList.remove("active");
    targetSlot.classList.add("selected");
    
    // 状態を更新
    state.selected_names.push(name);
    historyText.textContent = state.selected_names.join(" > ");
    searchField.value = ""; // 検索窓をクリア
    
    state.current_step++;
    
    // 次のステップへ
    updateHighlights();
    updateRankingDisplay(); // リストを再構成
}

// アプリ起動
init();