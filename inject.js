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

    if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
      return "ChatGPT";
    }

    if (host.includes("claude.ai")) {
      return "Claude";
    }

    return "対象サイト";
  }

  function findInput() {
    const selectors = [
      "rich-textarea div[contenteditable='true']",
      "div.ql-editor[contenteditable='true']",
      "#prompt-textarea",
      "div[contenteditable='true'][data-testid='composer-text-input']",
      ".ProseMirror[contenteditable='true']",
      "textarea",
      "div[contenteditable='true']"
    ];

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector)).filter(isVisible);
      if (elements.length) {
        return elements[elements.length - 1];
      }
    }

    return null;
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
