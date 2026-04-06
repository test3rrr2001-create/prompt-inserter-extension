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
const variableModal = document.getElementById("variableModal");
const variableModalMeta = document.getElementById("variableModalMeta");
const variableInputsContainer = document.getElementById("variableInputsContainer");
const variableCancelButton = document.getElementById("variableCancelButton");
const variableConfirmButton = document.getElementById("variableConfirmButton");

const STORAGE_KEYS = {
  favorites: "favorites",
  recentPromptIds: "recentPromptIds"
};

const MAX_RECENT = 5;
const STRINGS = {
  categoryAll: "すべて",
  favoriteAdd: "お気に入りに追加",
  favoriteRemove: "お気に入りから解除",
  favoriteAdded: "お気に入りに追加しました。",
  favoriteRemoved: "お気に入りを解除しました。",
  favoriteSaveError: "お気に入りの更新に失敗しました。",
  insertReady: "対応タブで挿入できます。",
  insertStart: "挿入を開始しています...",
  insertSuccess: (siteLabel) => `${siteLabel} の入力欄に挿入しました。`,
  insertNoSelection: "挿入するプロンプトを選択してください。",
  insertUnsupported: "Gemini / ChatGPT / Claude のタブで使用してください。",
  insertFailedFallback: "挿入できなかったため、クリップボードにコピーしました。",
  insertInputMissingFallback: "入力欄が見つからなかったため、クリップボードにコピーしました。",
  clipboardError: "コピーにも失敗しました。権限とページ状態を確認してください。",
  insertActionError: "挿入処理に失敗しました。",
  loadError: "データの読み込みに失敗しました。",
  emptyPromptList: "条件に一致するプロンプトがありません。",
  variableTitle: "変数の入力",
  variableDescription: "プロンプト内の変数を入力してください（空欄のままでも挿入可能です）",
  variableInputError: "変数入力欄の生成に失敗しました。"
};

let allPrompts = [];
let filteredPrompts = [];
let selectedPromptId = "";
let focusedIndex = -1;
let favoriteIds = [];
let recentPromptIds = [];
let isVariableModalOpen = false;
let isConfirmingVariableInsert = false;
let pendingInsertContext = null;

function setStatus(message, kind = "info") {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message || "";
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
  const source = (prompt?.fullTitle || prompt?.promptTitle || "").trim();
  return source.replace(/^\d+\.\s*/, "").trim();
}

function comparePrompts(a, b) {
  const orderA = typeof a.sortOrder === "number" ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const orderB = typeof b.sortOrder === "number" ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return (a.displayTitle || "").localeCompare(b.displayTitle || "", "ja");
}

function getPromptById(promptId) {
  return allPrompts.find((prompt) => prompt.id === promptId) || null;
}

function getHoverTitle(prompt) {
  if (!prompt) {
    return "";
  }

  return prompt.category ? `${prompt.category} / ${prompt.fullTitle}` : (prompt.fullTitle || "");
}

function getInfoText(prompt) {
  if (!prompt) {
    return "";
  }

  if (prompt.description && prompt.description.trim()) {
    return prompt.description.trim();
  }

  const hoverTitle = getHoverTitle(prompt);
  return hoverTitle || prompt.displayTitle || "";
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

function extractVariables(text) {
  const variableMatches = [];
  const seen = new Set();
  const pattern = /\[([^\]]+)\](?!\()/g;
  const source = String(text || "");
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const fullMatch = match[0];
    const variableName = (match[1] || "").trim();

    if (!variableName || seen.has(fullMatch)) {
      continue;
    }

    seen.add(fullMatch);
    variableMatches.push({
      token: fullMatch,
      label: variableName
    });
  }

  return variableMatches;
}

function autoResizeTextarea(textarea) {
  if (!textarea) {
    return;
  }

  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 60)}px`;
}

function getVariableInputs() {
  return variableInputsContainer
    ? Array.from(variableInputsContainer.querySelectorAll("textarea[data-variable-token]"))
    : [];
}

function updateVariableModalState() {
  const inputs = getVariableInputs();
  const filledCount = inputs.filter((input) => input.value.trim()).length;
  const totalCount = inputs.length;

  for (const input of inputs) {
    input.classList.toggle("has-value", Boolean(input.value.trim()));
    autoResizeTextarea(input);
  }

  if (variableModalMeta) {
    variableModalMeta.textContent = totalCount > 0
      ? `${filledCount} / ${totalCount} 入力済み  空欄はそのまま残ります  Ctrl+Enter ですぐ挿入`
      : "";
  }

  if (variableConfirmButton && !isConfirmingVariableInsert) {
    variableConfirmButton.textContent = totalCount > 0
      ? `確定して挿入${filledCount > 0 ? ` (${filledCount}/${totalCount})` : ""}`
      : "確定して挿入";
  }
}

function setVariableConfirmBusyState(isBusy) {
  isConfirmingVariableInsert = isBusy;

  if (variableConfirmButton) {
    variableConfirmButton.disabled = isBusy;
    variableConfirmButton.textContent = isBusy ? "挿入中..." : "確定して挿入";
  }

  if (variableCancelButton) {
    variableCancelButton.disabled = isBusy;
  }
}

function updatePromptInfo() {
  if (!promptInfo) {
    return;
  }

  const selected = getPromptById(selectedPromptId);
  promptInfo.textContent = getInfoText(selected);
  promptInfo.title = selected ? getHoverTitle(selected) : "";
}

function updateFavoriteToggle() {
  if (!favoriteToggle) {
    return;
  }

  const selected = getPromptById(selectedPromptId);
  const active = selected ? isFavorite(selected.id) : false;
  favoriteToggle.disabled = !selected;
  favoriteToggle.textContent = active ? "★" : "☆";
  favoriteToggle.classList.toggle("is-active", active);
  favoriteToggle.setAttribute("aria-pressed", String(active));
  favoriteToggle.title = active ? STRINGS.favoriteRemove : STRINGS.favoriteAdd;
  favoriteToggle.setAttribute("aria-label", active ? STRINGS.favoriteRemove : STRINGS.favoriteAdd);
}

function renderCategoryOptions() {
  if (!categoryFilter) {
    return;
  }

  const PINNED_CATEGORY = "全社共通";
  const categories = [...new Set(allPrompts.map((prompt) => prompt.category).filter(Boolean))]
    .sort((a, b) => {
      if (a === PINNED_CATEGORY) {
        return -1;
      }
      if (b === PINNED_CATEGORY) {
        return 1;
      }
      return a.localeCompare(b, "ja");
    });

  categoryFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = STRINGS.categoryAll;
  categoryFilter.appendChild(allOption);

  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  }
}

function renderChipList(container, promptIds, type) {
  if (!container || !searchInput || !categoryFilter) {
    return;
  }

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
  if (!favoriteSection) {
    return;
  }

  const validFavorites = favoriteIds.filter((promptId) => getPromptById(promptId));
  favoriteSection.hidden = validFavorites.length === 0;
  renderChipList(favoriteList, validFavorites, "favorite");
}

function matchesFilters(prompt) {
  const query = normalizeText(searchInput?.value);
  const category = categoryFilter?.value || "";

  if (query) {
    const haystack = normalizeText([
      prompt.displayTitle,
      prompt.fullTitle,
      prompt.description,
      prompt.category
    ].join("\n"));

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

function renderPromptList() {
  if (!promptList || !emptyState || !insertButton || !promptInfo) {
    return;
  }

  promptList.innerHTML = "";

  if (!filteredPrompts.length) {
    emptyState.hidden = false;
    insertButton.disabled = true;
    promptInfo.textContent = STRINGS.emptyPromptList;
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
    category.textContent = prompt.category || "";

    body.appendChild(title);
    body.appendChild(category);

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = `item-favorite${isFavorite(prompt.id) ? " is-active" : ""}`;
    favoriteButton.textContent = isFavorite(prompt.id) ? "★" : "☆";
    favoriteButton.title = isFavorite(prompt.id) ? STRINGS.favoriteRemove : STRINGS.favoriteAdd;
    favoriteButton.setAttribute("aria-label", favoriteButton.title);
    favoriteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedPromptId = prompt.id;
      toggleFavoriteForSelected().catch(() => {
        setStatus(STRINGS.favoriteSaveError, "error");
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
    setStatus(STRINGS.favoriteRemoved, "info");
  } else {
    favoriteIds = [selected.id, ...favoriteIds.filter((promptId) => promptId !== selected.id)];
    setStatus(STRINGS.favoriteAdded, "success");
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

async function handleCopyFallback(prompt, text, message) {
  try {
    await copyToClipboard(text);
    await recordRecentPrompt(prompt.id);
    setStatus(message, "warning");
  } catch (error) {
    setStatus(STRINGS.clipboardError, "error");
  }
}

async function sendPromptToActiveTab(selected, text) {
  const tab = await getActiveTab();

  if (!tab || !tab.id) {
    throw new Error("active_tab_not_found");
  }

  if (!isSupportedUrl(tab.url)) {
    setStatus(STRINGS.insertUnsupported, "warning");
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
      text
    }
  });

  if (response && response.ok) {
    await recordRecentPrompt(selected.id);
    setStatus(STRINGS.insertSuccess(response.siteLabel), "success");
    return;
  }

  if (response && response.reason === "input_not_found") {
    await handleCopyFallback(selected, text, STRINGS.insertInputMissingFallback);
    return;
  }

  await handleCopyFallback(selected, text, STRINGS.insertFailedFallback);
}

function closeVariableModal({ restoreFocus = true } = {}) {
  pendingInsertContext = null;
  isVariableModalOpen = false;
  setVariableConfirmBusyState(false);

  if (variableInputsContainer) {
    variableInputsContainer.innerHTML = "";
  }

  if (variableModalMeta) {
    variableModalMeta.textContent = "";
  }

  if (variableModal && typeof variableModal.close === "function" && variableModal.open) {
    variableModal.close();
  }

  if (restoreFocus && insertButton) {
    setTimeout(() => {
      insertButton.focus();
    }, 0);
  }
}

function buildResolvedPromptText(template, inputs) {
  let resolved = template;

  for (const input of inputs) {
    const token = input.dataset.variableToken || "";
    const value = input.value || "";

    if (!token || !value) {
      continue;
    }

    resolved = resolved.split(token).join(value);
  }

  return resolved;
}

async function confirmVariableInsert() {
  if (!pendingInsertContext || !pendingInsertContext.selected) {
    closeVariableModal();
    insertButton.disabled = filteredPrompts.length === 0;
    return;
  }

  const { selected, templateText } = pendingInsertContext;
  const inputs = variableInputsContainer
    ? Array.from(variableInputsContainer.querySelectorAll("textarea[data-variable-token]"))
    : [];
  const resolvedText = buildResolvedPromptText(templateText, inputs);

  closeVariableModal({ restoreFocus: false });
  setStatus(STRINGS.insertStart, "info");

  try {
    await sendPromptToActiveTab(selected, resolvedText);
  } catch (error) {
    await handleCopyFallback(selected, resolvedText, STRINGS.insertFailedFallback);
  } finally {
    if (insertButton) {
      insertButton.disabled = filteredPrompts.length === 0;
      insertButton.focus();
    }
  }
}

function openVariableModal(selected, variables) {
  if (!variableModal || !variableInputsContainer || !variableConfirmButton || !insertButton) {
    setStatus(STRINGS.variableInputError, "error");
    insertButton.disabled = filteredPrompts.length === 0;
    return;
  }

  variableInputsContainer.innerHTML = "";

  for (const variable of variables) {
    const field = document.createElement("label");
    field.className = "variable-field";

    const label = document.createElement("span");
    label.className = "variable-label";
    label.textContent = variable.token;

    const textarea = document.createElement("textarea");
    textarea.className = "variable-textarea";
    textarea.rows = 3;
    textarea.dataset.variableToken = variable.token;
    textarea.setAttribute("aria-label", variable.label);
    textarea.placeholder = variable.label;
    textarea.addEventListener("input", () => {
      updateVariableModalState();
    });
    textarea.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (!isConfirmingVariableInsert) {
          setVariableConfirmBusyState(true);
          confirmVariableInsert()
            .catch(() => {
              setStatus(STRINGS.insertActionError, "error");
            })
            .finally(() => {
              setVariableConfirmBusyState(false);
            });
        }
      }
    });

    field.appendChild(label);
    field.appendChild(textarea);

    variableInputsContainer.appendChild(field);
  }

  pendingInsertContext = {
    selected,
    templateText: selected.body,
    variables
  };
  isVariableModalOpen = true;

  if (typeof variableModal.showModal === "function") {
    variableModal.showModal();
  } else {
    variableModal.setAttribute("open", "open");
  }

  updateVariableModalState();

  const firstTextarea = variableInputsContainer.querySelector("textarea");
  if (firstTextarea) {
    setTimeout(() => {
      autoResizeTextarea(firstTextarea);
      firstTextarea.focus();
    }, 0);
  }
}

async function insertSelectedPrompt() {
  const selected = getPromptById(selectedPromptId);
  if (!selected) {
    setStatus(STRINGS.insertNoSelection, "warning");
    return;
  }

  if (!insertButton) {
    return;
  }

  insertButton.disabled = true;
  setStatus(STRINGS.insertStart, "info");

  const variables = extractVariables(selected.body);
  if (variables.length > 0) {
    openVariableModal(selected, variables);
    return;
  }

  try {
    await sendPromptToActiveTab(selected, selected.body);
  } catch (error) {
    await handleCopyFallback(selected, selected.body, STRINGS.insertFailedFallback);
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
  if (!searchInput || !categoryFilter) {
    return;
  }

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
  if (isVariableModalOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeVariableModal();
      if (insertButton) {
        insertButton.disabled = filteredPrompts.length === 0;
      }
    }
    return;
  }

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
      setStatus(STRINGS.insertActionError, "error");
      if (insertButton) {
        insertButton.disabled = filteredPrompts.length === 0;
      }
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
      const meta = promptMeta.metaById.get(prompt.id)
        || promptMeta.metaByFullTitle.get(prompt.fullTitle)
        || null;

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

  if (versionText) {
    versionText.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  renderCategoryOptions();
  renderShortcutSections();

  selectedPromptId = recentPromptIds.find((promptId) => getPromptById(promptId))
    || favoriteIds.find((promptId) => getPromptById(promptId))
    || (allPrompts[0] ? allPrompts[0].id : "");

  applyFilters();
  setStatus(STRINGS.insertReady, "info");

  if (searchInput) {
    setTimeout(() => {
      searchInput.focus();
    }, 0);
  }
}

if (searchInput) {
  searchInput.addEventListener("input", applyFilters);
}

if (categoryFilter) {
  categoryFilter.addEventListener("change", applyFilters);
}

if (favoriteToggle) {
  favoriteToggle.addEventListener("click", () => {
    toggleFavoriteForSelected().catch(() => {
      setStatus(STRINGS.favoriteSaveError, "error");
    });
  });
}

if (insertButton) {
  insertButton.addEventListener("click", () => {
    insertSelectedPrompt().catch(() => {
      setStatus(STRINGS.insertActionError, "error");
      insertButton.disabled = filteredPrompts.length === 0;
    });
  });
}

if (variableCancelButton) {
  variableCancelButton.addEventListener("click", () => {
    closeVariableModal();
    if (insertButton) {
      insertButton.disabled = filteredPrompts.length === 0;
    }
  });
}

if (variableConfirmButton) {
  variableConfirmButton.addEventListener("click", () => {
    setVariableConfirmBusyState(true);
    confirmVariableInsert()
      .catch(() => {
        setStatus(STRINGS.insertActionError, "error");
      })
      .finally(() => {
        setVariableConfirmBusyState(false);
      });
  });
}

if (variableModal) {
  variableModal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeVariableModal();
    if (insertButton) {
      insertButton.disabled = filteredPrompts.length === 0;
    }
  });
  variableModal.addEventListener("click", (event) => {
    if (event.target === variableModal && !isConfirmingVariableInsert) {
      closeVariableModal();
      if (insertButton) {
        insertButton.disabled = filteredPrompts.length === 0;
      }
    }
  });
}

document.addEventListener("keydown", handleGlobalKeydown);

loadPrompts().catch(() => {
  if (insertButton) {
    insertButton.disabled = true;
  }
  if (favoriteToggle) {
    favoriteToggle.disabled = true;
  }
  if (promptInfo) {
    promptInfo.textContent = "";
  }
  setStatus(STRINGS.loadError, "error");
});
