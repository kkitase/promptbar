// デフォルトのタグ
const DEFAULT_TAGS = [
  "NotebookLM",
  "コード",
  "メール",
  "翻訳",
  "要約",
  "アイデア",
];

// DOM要素
const elements = {
  searchInput: document.getElementById("searchInput"),
  addBtn: document.getElementById("addBtn"),
  tagFilters: document.getElementById("tagFilters"),
  promptList: document.getElementById("promptList"),
  emptyState: document.getElementById("emptyState"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalTitle: document.getElementById("modalTitle"),
  modalClose: document.getElementById("modalClose"),
  promptForm: document.getElementById("promptForm"),
  titleInput: document.getElementById("titleInput"),
  bodyInput: document.getElementById("bodyInput"),
  charCount: document.getElementById("charCount"),
  tagSelector: document.getElementById("tagSelector"),
  cancelBtn: document.getElementById("cancelBtn"),
  deleteModalOverlay: document.getElementById("deleteModalOverlay"),
  deleteCancelBtn: document.getElementById("deleteCancelBtn"),
  deleteConfirmBtn: document.getElementById("deleteConfirmBtn"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toastMessage"),
  darkModeBtn: document.getElementById("darkModeBtn"),
  darkModeIcon: document.getElementById("darkModeIcon"),
};

// 状態管理
let prompts = [];
let tags = [...DEFAULT_TAGS];
let currentFilter = "all";
let editingPromptId = null;
let deletingPromptId = null;
let isDarkMode = false;

// 初期化
document.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadData();
  loadDarkMode();
  renderTagFilters();
  renderPrompts();
  setupEventListeners();
}

// データの読み込み
async function loadData() {
  try {
    const result = await chrome.storage.local.get([
      "prompts",
      "tags",
      "darkMode",
    ]);
    prompts = result.prompts || [];
    tags = result.tags || [...DEFAULT_TAGS];
    isDarkMode = result.darkMode || false;
  } catch (error) {
    console.error("データの読み込みに失敗しました:", error);
  }
}

// データの保存
async function saveData() {
  try {
    await chrome.storage.local.set({ prompts, tags, darkMode: isDarkMode });
  } catch (error) {
    console.error("データの保存に失敗しました:", error);
  }
}

// ダークモードの読み込み
function loadDarkMode() {
  if (isDarkMode) {
    document.documentElement.classList.add("dark");
    elements.darkModeIcon.textContent = "light_mode";
  } else {
    document.documentElement.classList.remove("dark");
    elements.darkModeIcon.textContent = "dark_mode";
  }
}

// ダークモードの切り替え
function toggleDarkMode() {
  isDarkMode = !isDarkMode;
  loadDarkMode();
  saveData();
}

// イベントリスナーの設定
function setupEventListeners() {
  // 検索
  elements.searchInput.addEventListener("input", debounce(renderPrompts, 200));

  // 追加ボタン
  elements.addBtn.addEventListener("click", openAddModal);

  // ダークモード切り替え
  elements.darkModeBtn.addEventListener("click", toggleDarkMode);

  // モーダル関連
  elements.modalClose.addEventListener("click", closeModal);
  elements.cancelBtn.addEventListener("click", closeModal);
  elements.modalOverlay.addEventListener("click", (e) => {
    if (e.target === elements.modalOverlay) closeModal();
  });

  // フォーム送信
  elements.promptForm.addEventListener("submit", handleFormSubmit);

  // 文字数カウンター
  elements.bodyInput.addEventListener("input", updateCharCount);

  // 削除モーダル
  elements.deleteCancelBtn.addEventListener("click", closeDeleteModal);
  elements.deleteConfirmBtn.addEventListener("click", confirmDelete);
  elements.deleteModalOverlay.addEventListener("click", (e) => {
    if (e.target === elements.deleteModalOverlay) closeDeleteModal();
  });

  // キーボードショートカット
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeDeleteModal();
    }
  });

  // （ドロップダウン廃止に伴い不要な処理を削除）
}

// 文字数カウンターの更新
function updateCharCount() {
  const count = elements.bodyInput.value.length;
  elements.charCount.textContent = `${count} / 10000`;
}

// タグフィルターの描画
function renderTagFilters() {
  const allTags = getAllTags();
  elements.tagFilters.innerHTML = `
    <button class="tag-filter ${currentFilter === "all" ? "active" : ""}" data-tag="all">すべて</button>
    ${allTags
      .map(
        (tag) => `
      <button class="tag-filter ${currentFilter === tag ? "active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `,
      )
      .join("")}
  `;

  // タグフィルターのクリックイベント
  elements.tagFilters.querySelectorAll(".tag-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.tag;
      renderTagFilters();
      renderPrompts();
    });
  });
}

// プロンプト一覧の描画
function renderPrompts() {
  const searchTerm = elements.searchInput.value.toLowerCase();
  const filtered = prompts
    .filter((prompt) => {
      const matchesSearch =
        !searchTerm ||
        prompt.title.toLowerCase().includes(searchTerm) ||
        prompt.body.toLowerCase().includes(searchTerm);
      const matchesTag =
        currentFilter === "all" ||
        (prompt.tags && prompt.tags.includes(currentFilter));
      return matchesSearch && matchesTag;
    })
    // お気に入りを先に、その後最近追加順でソート
    .sort((a, b) => {
      // お気に入りを優先
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      // 同じ場合は最近追加順（createdAt降順）
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  if (filtered.length === 0) {
    elements.promptList.innerHTML = "";
    elements.emptyState.classList.add("show");
    return;
  }

  elements.emptyState.classList.remove("show");
  elements.promptList.innerHTML = filtered
    .map(
      (prompt) => `
    <div class="prompt-card" data-id="${prompt.id}">
      <div class="prompt-card-header">
        <span class="prompt-title">${escapeHtml(prompt.title)}</span>
        <button class="btn-favorite ${prompt.favorite ? "active" : ""}" data-action="favorite" title="お気に入り">
          <span class="material-symbols-outlined ${prompt.favorite ? "filled" : ""}">star</span>
        </button>
      </div>
      <div class="prompt-body">${escapeHtml(prompt.body)}</div>
      <div class="prompt-card-footer">
        <div class="prompt-tags">
          ${(prompt.tags || []).map((tag) => `<span class="prompt-tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <div class="prompt-actions">
          <button class="btn-action" data-action="copy" title="コピー">
            <span class="material-symbols-outlined">content_copy</span>
          </button>
          <button class="btn-action" data-action="edit" title="編集">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="btn-action danger" data-action="delete" title="削除">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  // カードのクリックイベント
  elements.promptList.querySelectorAll(".prompt-card").forEach((card) => {
    const promptId = card.dataset.id;

    card.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;

        switch (action) {
          case "copy":
            copyToClipboard(promptId);
            break;
          case "favorite":
            toggleFavorite(promptId);
            break;
          case "edit":
            openEditModal(promptId);
            break;
          case "delete":
            openDeleteModal(promptId);
            break;
        }
      });
    });
  });
}

// お気に入りの切り替え
async function toggleFavorite(promptId) {
  const index = prompts.findIndex((p) => p.id === promptId);
  if (index !== -1) {
    prompts[index].favorite = !prompts[index].favorite;
    await saveData();
    renderPrompts();
  }
}

// 追加モーダルを開く
function openAddModal() {
  editingPromptId = null;
  elements.modalTitle.textContent = "プロンプトを追加";
  elements.titleInput.value = "";
  elements.bodyInput.value = "";
  updateCharCount();
  renderTagSelector([]);
  elements.modalOverlay.classList.add("show");
  elements.titleInput.focus();
}

// 編集モーダルを開く
function openEditModal(promptId) {
  const prompt = prompts.find((p) => p.id === promptId);
  if (!prompt) return;

  editingPromptId = promptId;
  elements.modalTitle.textContent = "プロンプトを編集";
  elements.titleInput.value = prompt.title;
  elements.bodyInput.value = prompt.body;
  updateCharCount();
  renderTagSelector(prompt.tags || []);
  elements.modalOverlay.classList.add("show");
  elements.titleInput.focus();
}

// モーダルを閉じる
function closeModal() {
  elements.modalOverlay.classList.remove("show");
  editingPromptId = null;
}

// タグセレクターの描画
function renderTagSelector(selectedTags) {
  const allTags = getAllTags();
  elements.tagSelector.innerHTML = `
    ${allTags
      .map(
        (tag) => `
      <button type="button" class="tag-option ${selectedTags.includes(tag) ? "selected" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `,
      )
      .join("")}
    <button type="button" class="tag-option new-tag" data-action="new-tag">
      <span class="material-symbols-outlined">add</span>
      新規タグ
    </button>
  `;

  // タグのクリックイベント
  elements.tagSelector.querySelectorAll(".tag-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.action === "new-tag") {
        const newTag = prompt("新しいタグ名を入力:");
        if (newTag && newTag.trim()) {
          const trimmedTag = newTag.trim();
          if (!tags.includes(trimmedTag)) {
            tags.push(trimmedTag);
            saveData();
          }
          const currentSelected = getSelectedTags();
          currentSelected.push(trimmedTag);
          renderTagSelector(currentSelected);
          renderTagFilters();
        }
      } else {
        btn.classList.toggle("selected");
      }
    });
  });
}

// 選択されたタグを取得
function getSelectedTags() {
  return Array.from(
    elements.tagSelector.querySelectorAll(".tag-option.selected"),
  ).map((btn) => btn.dataset.tag);
}

// フォーム送信処理
async function handleFormSubmit(e) {
  e.preventDefault();

  const title = elements.titleInput.value.trim();
  const body = elements.bodyInput.value.trim();
  const selectedTags = getSelectedTags();

  if (!title || !body) return;

  if (editingPromptId) {
    // 編集
    const index = prompts.findIndex((p) => p.id === editingPromptId);
    if (index !== -1) {
      prompts[index] = {
        ...prompts[index],
        title,
        body,
        tags: selectedTags,
        updatedAt: Date.now(),
      };
    }
    showToast("保存しました");
  } else {
    // 新規追加
    prompts.unshift({
      id: generateId(),
      title,
      body,
      tags: selectedTags,
      favorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    showToast("追加しました");
  }

  await saveData();
  closeModal();
  renderTagFilters();
  renderPrompts();
}

// 削除モーダルを開く
function openDeleteModal(promptId) {
  deletingPromptId = promptId;
  elements.deleteModalOverlay.classList.add("show");
}

// 削除モーダルを閉じる
function closeDeleteModal() {
  elements.deleteModalOverlay.classList.remove("show");
  deletingPromptId = null;
}

// 削除の確認
async function confirmDelete() {
  if (!deletingPromptId) return;

  prompts = prompts.filter((p) => p.id !== deletingPromptId);
  await saveData();
  closeDeleteModal();
  renderTagFilters();
  renderPrompts();
  showToast("削除しました");
}

// クリップボードにコピー
async function copyToClipboard(promptId) {
  const prompt = prompts.find((p) => p.id === promptId);
  if (!prompt) return;

  try {
    await navigator.clipboard.writeText(prompt.body);
    showToast("コピーしました");
  } catch (error) {
    console.error("コピーに失敗しました:", error);
    showToast("コピーに失敗しました");
  }
}

// トースト表示
function showToast(message) {
  elements.toastMessage.textContent = message;
  elements.toast.classList.add("show");
  setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2000);
}

// すべてのタグを取得（デフォルト + ユーザー追加 + プロンプトに使用されているタグ）
function getAllTags() {
  const promptTags = prompts.flatMap((p) => p.tags || []);
  const allTags = [...new Set([...tags, ...promptTags])];
  return allTags.sort((a, b) => a.localeCompare(b, "ja"));
}

// ユーティリティ関数
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
