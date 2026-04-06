const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const favoriteSection = document.getElementById("favoriteSection");
const favoriteList = document.getElementById("favoriteList");
const favoriteToggle = document.getElementById("favoriteToggle");
const emptyState = document.getElementById("emptyState");
const promptList = document.getElementById("promptList");
const promptInfo = document.getElementById("promptInfo");
const insertButton = document.getElementById("insertButton");
const statusElement = document.getElementById("status");
const versionText = document.getElementById("versionText");

const STORAGE_KEYS = {
  favorites: "favorites",
  recentPromptIds: "recentPromptIds"
};

const MAX_RECENT = 5;

let allPrompts = [];
let filteredPrompts = [];
let selectedPromptId = "";
let focusedIndex = -1;
let favoriteIds = [];
let recentPromptIds = [];

function setStatus(message, kind = "info") {
  statusElement.textContent = message;
  statusElement.className = `status is-${kind}`;
}

function normalizeText(text) {
  return (text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function createFallbackDisplayTitle(prompt) {
  const source = (prompt.fullTitle || "").trim();
  return source
    .replace(/^\d+\.\s*/, "")
    .replace(/\s*（[^）]*）\s*$/, "")
    .trim();
}

function comparePrompts(a, b) {
  const orderA = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const orderB = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return a.displayTitle.localeCompare(b.displayTitle, "ja");
}

function getPromptById(promptId) {
  return allPrompts.find((prompt) => prompt.id === promptId) || null;
}

function getHoverTitle(prompt) {
  return prompt && prompt.category
    ? `${prompt.category}｜${prompt.fullTitle}`
    : prompt ? prompt.fullTitle : "";
}

function getInfoText(prompt) {
  if (!prompt) {
    return "";
  }

  if (prompt.description && prompt.description.trim()) {
    return prompt.description.trim();
  }

  const hoverTitle = getHoverTitle(prompt);
  if (hoverTitle) {
    return hoverTitle;
  }

  return prompt.displayTitle;
}

function isFavorite(promptId) {
  return favoriteIds.includes(promptId);
}

function isSupportedUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const { hostname } = new URL(url);
    return (
      hostname.includes("gemini.google.com") ||
      hostname.includes("chatgpt.com") ||
      hostname.includes("chat.openai.com") ||
      hostname.includes("claude.ai")
    );
  } catch (error) {
    return false;
  }
}

function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

function setStorage(data) {
  return chrome.storage.local.set(data);
}

function updatePromptInfo() {
  const selected = getPromptById(selectedPromptId);
  const hoverTitle = selected ? getHoverTitle(selected) : "";
  promptInfo.textContent = getInfoText(selected);
  promptInfo.title = hoverTitle;
}

function updateFavoriteToggle() {
  const selected = getPromptById(selectedPromptId);
  const active = selected ? isFavorite(selected.id) : false;
  favoriteToggle.disabled = !selected;
  favoriteToggle.textContent = active ? "★" : "☆";
  favoriteToggle.classList.toggle("is-active", active);
  favoriteToggle.setAttribute("aria-pressed", String(active));
  favoriteToggle.title = active ? "お気に入り解除" : "お気に入り登録";
}

function renderCategoryOptions() {
  const PINNED_CATEGORY = "全社共通";
  const categories = [...new Set(allPrompts.map((prompt) => prompt.category).filter(Boolean))].sort((a, b) => {
    if (a === PINNED_CATEGORY) return -1;
    if (b === PINNED_CATEGORY) return 1;
    return a.localeCompare(b, "ja");
  });
  categoryFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "すべて";
  categoryFilter.appendChild(allOption);

  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  }
}

function renderChipList(container, promptIds, type) {
  container.innerHTML = "";

  for (const promptId of promptIds) {
    const prompt = getPromptById(promptId);
    if (!prompt) {
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${type === "favorite" ? " favorite" : ""}`;
    button.textContent = prompt.displayTitle;
    button.title = getHoverTitle(prompt);
    button.addEventListener("click", () => {
      searchInput.value = "";
      categoryFilter.value = "";
      selectedPromptId = prompt.id;
      applyFilters();
    });
    container.appendChild(button);
  }
}

function renderShortcutSections() {
  const validFavorites = favoriteIds.filter((promptId) => getPromptById(promptId));

  favoriteSection.hidden = validFavorites.length === 0;

  renderChipList(favoriteList, validFavorites, "favorite");
}

function matchesFilters(prompt) {
  const query = normalizeText(searchInput.value);
  const category = categoryFilter.value;

  if (query) {
    const haystack = normalizeText(
      [
        prompt.displayTitle,
        prompt.fullTitle,
        prompt.description,
        prompt.category
      ].join("\n")
    );

    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (category && prompt.category !== category) {
    return false;
  }

  return true;
}

function applyFilters() {
  filteredPrompts = allPrompts.filter(matchesFilters).sort(comparePrompts);

  if (!filteredPrompts.some((prompt) => prompt.id === selectedPromptId)) {
    selectedPromptId = filteredPrompts[0] ? filteredPrompts[0].id : "";
  }

  focusedIndex = filteredPrompts.findIndex((prompt) => prompt.id === selectedPromptId);
  renderPromptList();
}

function ensureSelectedVisible() {
  if (!filteredPrompts.some((prompt) => prompt.id === selectedPromptId)) {
    return;
  }

  focusedIndex = filteredPrompts.findIndex((prompt) => prompt.id === selectedPromptId);
}

function renderPromptList() {
  promptList.innerHTML = "";

  if (!filteredPrompts.length) {
    emptyState.hidden = false;
    insertButton.disabled = true;
    promptInfo.textContent = "検索条件を変えてください。";
    promptInfo.title = "";
    updateFavoriteToggle();
    return;
  }

  emptyState.hidden = true;
  insertButton.disabled = false;

  for (const [index, prompt] of filteredPrompts.entries()) {
    const item = document.createElement("div");
    const selected = prompt.id === selectedPromptId;
    const focused = index === focusedIndex;
    item.className = `list-item${selected ? " is-selected" : ""}${focused ? " is-focused" : ""}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(selected));
    item.dataset.promptId = prompt.id;
    item.title = getHoverTitle(prompt);

    const body = document.createElement("div");
    body.className = "item-body";

    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = prompt.displayTitle;

    const category = document.createElement("div");
    category.className = "item-category";
    category.textContent = prompt.category;

    body.appendChild(title);
    body.appendChild(category);

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = `item-favorite${isFavorite(prompt.id) ? " is-active" : ""}`;
    favoriteButton.textContent = isFavorite(prompt.id) ? "★" : "☆";
    favoriteButton.title = isFavorite(prompt.id) ? "お気に入り解除" : "お気に入り登録";
    favoriteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedPromptId = prompt.id;
      toggleFavoriteForSelected().catch(() => {
        setStatus("お気に入りの保存に失敗しました。", "error");
      });
    });

    item.appendChild(body);
    item.appendChild(favoriteButton);
    item.addEventListener("click", () => {
      selectedPromptId = prompt.id;
      focusedIndex = index;
      renderPromptList();
    });
    item.addEventListener("mousemove", () => {
      focusedIndex = index;
    });

    promptList.appendChild(item);
  }

  updatePromptInfo();
  updateFavoriteToggle();

  const focusedElement = promptList.querySelector(".list-item.is-focused");
  if (focusedElement) {
    focusedElement.scrollIntoView({ block: "nearest" });
  }
}

async function loadPersistentState() {
  const stored = await getStorage([STORAGE_KEYS.favorites, STORAGE_KEYS.recentPromptIds]);
  favoriteIds = Array.isArray(stored[STORAGE_KEYS.favorites]) ? stored[STORAGE_KEYS.favorites] : [];
  recentPromptIds = Array.isArray(stored[STORAGE_KEYS.recentPromptIds]) ? stored[STORAGE_KEYS.recentPromptIds] : [];
}

async function saveFavorites() {
  await setStorage({
    [STORAGE_KEYS.favorites]: favoriteIds
  });
}

async function saveRecentPromptIds() {
  await setStorage({
    [STORAGE_KEYS.recentPromptIds]: recentPromptIds
  });
}

async function toggleFavoriteForSelected() {
  const selected = getPromptById(selectedPromptId);
  if (!selected) {
    return;
  }

  if (isFavorite(selected.id)) {
    favoriteIds = favoriteIds.filter((promptId) => promptId !== selected.id);
    setStatus("お気に入りを解除しました。", "info");
  } else {
    favoriteIds = [selected.id, ...favoriteIds.filter((promptId) => promptId !== selected.id)];
    setStatus("お気に入りに追加しました。", "success");
  }

  await saveFavorites();
  renderShortcutSections();
  renderPromptList();
}

async function recordRecentPrompt(promptId) {
  recentPromptIds = [promptId, ...recentPromptIds.filter((item) => item !== promptId)].slice(0, MAX_RECENT);
  await saveRecentPromptIds();
  renderShortcutSections();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

async function handleCopyFallback(selected, message) {
  try {
    await copyToClipboard(selected.body);
    await recordRecentPrompt(selected.id);
    setStatus(message, "warning");
  } catch (error) {
    setStatus("コピーにも失敗しました。もう一度お試しください。", "error");
  }
}

async function insertSelectedPrompt() {
  const selected = getPromptById(selectedPromptId);
  if (!selected) {
    setStatus("プロンプトを選択してください。", "warning");
    return;
  }

  insertButton.disabled = true;
  setStatus("入力欄を探しています...", "info");

  try {
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
      throw new Error("active_tab_not_found");
    }

    if (!isSupportedUrl(tab.url)) {
      setStatus("Gemini / ChatGPT / Claude のタブで使ってください。", "warning");
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["inject.js"]
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "INSERT_PROMPT",
      payload: {
        title: selected.fullTitle,
        text: selected.body
      }
    });

    if (response && response.ok) {
      await recordRecentPrompt(selected.id);
      setStatus(`${response.siteLabel} の入力欄へ挿入しました。`, "success");
      return;
    }

    if (response && response.reason === "input_not_found") {
      await handleCopyFallback(selected, "入力欄が見つからなかったため、コピーしました。");
      return;
    }

    await handleCopyFallback(selected, "挿入できなかったため、コピーしました。");
  } catch (error) {
    await handleCopyFallback(selected, "挿入できなかったため、コピーしました。");
  } finally {
    insertButton.disabled = filteredPrompts.length === 0;
  }
}

function moveSelection(delta) {
  if (!filteredPrompts.length) {
    return;
  }

  const lastIndex = filteredPrompts.length - 1;
  const nextIndex = focusedIndex < 0
    ? 0
    : Math.min(lastIndex, Math.max(0, focusedIndex + delta));

  focusedIndex = nextIndex;
  selectedPromptId = filteredPrompts[nextIndex].id;
  renderPromptList();
}

function clearSearchState() {
  const hadQuery = Boolean(searchInput.value);
  const hadCategory = Boolean(categoryFilter.value);

  if (!hadQuery && !hadCategory) {
    return;
  }

  searchInput.value = "";
  categoryFilter.value = "";
  applyFilters();
}

function handleGlobalKeydown(event) {
  if (document.activeElement === categoryFilter) {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearchState();
    }
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
    return;
  }

  if (event.key === "Enter" && document.activeElement !== favoriteToggle) {
    event.preventDefault();
    insertSelectedPrompt().catch(() => {
      setStatus("処理に失敗しました。", "error");
      insertButton.disabled = filteredPrompts.length === 0;
    });
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    clearSearchState();
  }
}

async function loadPromptMeta() {
  const response = await fetch(chrome.runtime.getURL("prompt_meta.json"));
  if (!response.ok) {
    throw new Error(`meta_http_${response.status}`);
  }

  const metaList = await response.json();
  const metaById = new Map();
  const metaByFullTitle = new Map();

  for (const meta of Array.isArray(metaList) ? metaList : []) {
    if (!meta || !meta.fullTitle) {
      continue;
    }

    if (meta.id) {
      metaById.set(meta.id, meta);
    }

    metaByFullTitle.set(meta.fullTitle, meta);
  }

  return { metaById, metaByFullTitle };
}

function mergePromptData(parsedPrompts, promptMeta) {
  return parsedPrompts
    .map((prompt) => {
      const meta = promptMeta.metaById.get(prompt.id) || promptMeta.metaByFullTitle.get(prompt.fullTitle) || null;

      return {
        id: meta?.id || prompt.id,
        displayTitle: meta?.displayTitle || createFallbackDisplayTitle(prompt),
        fullTitle: meta?.fullTitle || prompt.fullTitle || prompt.promptTitle || "",
        description: meta?.description || prompt.description || "",
        category: meta?.category || prompt.category || prompt.categoryTitle || "",
        tags: Array.isArray(meta?.tags) ? meta.tags : [],
        sortOrder: typeof meta?.sortOrder === "number" ? meta.sortOrder : null,
        body: prompt.body
      };
    })
    .sort(comparePrompts);
}

async function loadPrompts() {
  const [markdownResponse, promptMeta] = await Promise.all([
    fetch(chrome.runtime.getURL("prompts.md")),
    loadPromptMeta(),
    loadPersistentState()
  ]);

  const markdown = await markdownResponse.text();
  const parsedPrompts = window.parsePrompts(markdown);
  allPrompts = mergePromptData(parsedPrompts, promptMeta);

  console.log(`[Prompt Inserter] recognized prompts: ${allPrompts.length}`);
  if (allPrompts.length === 0 || allPrompts.length < 10 || allPrompts.length > 30) {
    console.warn("[Prompt Inserter] unexpected prompt count", allPrompts.length);
  }

  versionText.textContent = `v${chrome.runtime.getManifest().version}`;
  renderCategoryOptions();
  renderShortcutSections();

  selectedPromptId = recentPromptIds.find((promptId) => getPromptById(promptId))
    || favoriteIds.find((promptId) => getPromptById(promptId))
    || (allPrompts[0] ? allPrompts[0].id : "");

  applyFilters();
  setStatus("対象タブで挿入します。", "info");

  setTimeout(() => {
    searchInput.focus();
  }, 0);
}

searchInput.addEventListener("input", applyFilters);
categoryFilter.addEventListener("change", applyFilters);
favoriteToggle.addEventListener("click", () => {
  toggleFavoriteForSelected().catch(() => {
    setStatus("お気に入りの保存に失敗しました。", "error");
  });
});
insertButton.addEventListener("click", () => {
  insertSelectedPrompt().catch(() => {
    setStatus("処理に失敗しました。", "error");
    insertButton.disabled = filteredPrompts.length === 0;
  });
});
document.addEventListener("keydown", handleGlobalKeydown);

loadPrompts().catch(() => {
  insertButton.disabled = true;
  favoriteToggle.disabled = true;
  promptInfo.textContent = "";
  setStatus("データの読み込みに失敗しました。", "error");
});
