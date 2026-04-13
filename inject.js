(function () {
  if (window.__promptInserterInitialized) {
    return;
  }

  window.__promptInserterInitialized = true;

  function isVisible(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  }

  function siteLabel() {
    const host = window.location.hostname;

    if (host.includes("gemini.google.com")) {
      return "Gemini";
    }

    if (host.includes("notebooklm.google.com") || host.includes("notebooklm.google")) {
      return "NotebookLM";
    }

    if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
      return "ChatGPT";
    }

    if (host.includes("claude.ai")) {
      return "Claude";
    }

    return "対象サイト";
  }

  function getSelectorsForCurrentSite() {
    const host = window.location.hostname;

    if (host.includes("notebooklm.google.com") || host.includes("notebooklm.google")) {
      return [
        "textarea[aria-label*='Ask']",
        "textarea[aria-label*='ask']",
        "textarea[placeholder*='Ask']",
        "textarea[placeholder*='ask']",
        "div[role='textbox'][contenteditable='true'][aria-label*='Ask']",
        "div[role='textbox'][contenteditable='true'][aria-label*='ask']",
        "textarea",
        "div[role='textbox'][contenteditable='true']",
        "div[contenteditable='true']"
      ];
    }

    return [
      "rich-textarea div[contenteditable='true']",
      "div.ql-editor[contenteditable='true']",
      "#prompt-textarea",
      "div[contenteditable='true'][data-testid='composer-text-input']",
      ".ProseMirror[contenteditable='true']",
      "textarea[aria-label*='message']",
      "textarea[aria-label*='Message']",
      "textarea[placeholder*='message']",
      "textarea[placeholder*='Message']",
      "textarea",
      "div[role='textbox'][contenteditable='true']",
      "div[contenteditable='true']"
    ];
  }

  function getCandidateScore(element) {
    if (!element || !isVisible(element)) {
      return Number.NEGATIVE_INFINITY;
    }

    const rect = element.getBoundingClientRect();
    const textHints = [
      element.getAttribute("aria-label") || "",
      element.getAttribute("placeholder") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("role") || ""
    ].join(" ").toLowerCase();

    let score = 0;

    if (element instanceof HTMLTextAreaElement) {
      score += 40;
    }

    if (element.getAttribute("role") === "textbox") {
      score += 25;
    }

    if (element.getAttribute("contenteditable") === "true") {
      score += 20;
    }

    if (/(ask|chat|message|prompt|query|質問|チャット)/.test(textHints)) {
      score += 50;
    }

    if (rect.bottom > window.innerHeight * 0.55) {
      score += 20;
    }

    score += Math.min(rect.width, window.innerWidth) / 50;
    score += Math.min(rect.height, 200) / 20;

    if (element.disabled || element.getAttribute("aria-disabled") === "true") {
      score -= 1000;
    }

    if (element.readOnly || element.getAttribute("readonly") !== null) {
      score -= 1000;
    }

    return score;
  }

  function findInput() {
    const selectors = getSelectorsForCurrentSite();
    let bestElement = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector)).filter(isVisible);

      for (const element of elements) {
        const score = getCandidateScore(element);

        if (score > bestScore) {
          bestScore = score;
          bestElement = element;
        }
      }
    }

    return bestElement;
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function insertIntoTextField(element, text) {
    element.focus();
    setNativeValue(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function insertIntoEditable(element, text) {
    element.focus();

    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const inserted = document.execCommand("insertText", false, text);
    if (inserted) {
      return true;
    }

    element.textContent = text;
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      })
    );
    return true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "INSERT_PROMPT") {
      return false;
    }

    const target = findInput();
    if (!target) {
      sendResponse({ ok: false, reason: "input_not_found" });
      return false;
    }

    const text = message.payload && message.payload.text ? message.payload.text : "";
    const ok =
      target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
        ? insertIntoTextField(target, text)
        : insertIntoEditable(target, text);

    sendResponse({
      ok,
      siteLabel: siteLabel()
    });

    return false;
  });
})();
