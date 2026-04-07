(function () {
  const EXCLUDED_H2_TITLES = new Set([
    "目次",
    "プロンプトの精度を劇的に高める重要テクニック：XMLタグの活用"
  ]);

  function cleanCategoryTitle(title) {
    return title
      .replace(/^【/, "")
      .replace(/】.*$/, "")
      .replace(/メガプロンプト$/, "")
      .trim();
  }

  function cleanPromptTitle(title) {
    return title
      .replace(/^\d+\.\s*/, "")
      .trim();
  }

  function extractMarkdownCodeBlock(text) {
    const match = text.match(/```markdown\s*\n([\s\S]*?)\n```/i);
    if (!match) {
      return "";
    }

    return match[1].trim();
  }

  function extractDescription(text) {
    const normalized = text.trim();
    if (!normalized) {
      return "";
    }

    const codeBlockIndex = normalized.search(/```markdown\s*\n/i);
    const descriptionSource = codeBlockIndex >= 0
      ? normalized.slice(0, codeBlockIndex)
      : normalized;

    return descriptionSource
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  function createPromptId(categoryTitle, promptTitle) {
    const source = `${categoryTitle}::${promptTitle}`;
    let hash = 2166136261;

    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return `prompt_${(hash >>> 0).toString(16)}`;
  }

  function finalizePrompt(prompt) {
    if (!prompt) {
      return null;
    }

    const sectionText = prompt.sectionLines.join("\n").trim();
    const codeBlockBody = extractMarkdownCodeBlock(sectionText);
    const description = extractDescription(sectionText);
    const body = (codeBlockBody || sectionText).trim();

    if (!body) {
      return null;
    }

    const categoryTitle = cleanCategoryTitle(prompt.categoryTitle || "");
    const promptTitle = cleanPromptTitle(prompt.promptTitle || prompt.categoryTitle || "");
    const displayTitle = categoryTitle && prompt.isH3Prompt
      ? `${categoryTitle}｜${promptTitle}`
      : promptTitle;
    const id = createPromptId(categoryTitle, promptTitle);

    return {
      id,
      title: displayTitle,
      fullTitle: promptTitle,
      displayTitle,
      category: categoryTitle,
      categoryTitle,
      promptTitle,
      description,
      body
    };
  }

  function parsePrompts(markdown) {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const prompts = [];
    let currentH2 = null;
    let currentPrompt = null;
    let currentH2HasH3 = false;

    for (const line of lines) {
      const h2Match = line.match(/^##\s+(.+?)\s*$/);
      const h3Match = line.match(/^###\s+(.+?)\s*$/);

      if (h2Match) {
        if (currentPrompt) {
          const finalizedPrompt = finalizePrompt(currentPrompt);
          if (finalizedPrompt) {
            prompts.push(finalizedPrompt);
          }
        }

        if (currentH2 && !currentH2HasH3 && !EXCLUDED_H2_TITLES.has(currentH2.title)) {
          const fallbackPrompt = finalizePrompt({
            categoryTitle: currentH2.title,
            promptTitle: currentH2.title,
            sectionLines: currentH2.lines,
            isH3Prompt: false
          });

          if (fallbackPrompt && extractMarkdownCodeBlock(currentH2.lines.join("\n").trim())) {
            prompts.push(fallbackPrompt);
          }
        }

        currentH2 = {
          title: h2Match[1].trim(),
          lines: []
        };
        currentPrompt = null;
        currentH2HasH3 = false;
        continue;
      }

      if (h3Match) {
        if (currentPrompt) {
          const finalizedPrompt = finalizePrompt(currentPrompt);
          if (finalizedPrompt) {
            prompts.push(finalizedPrompt);
          }
        }

        if (currentH2) {
          currentH2HasH3 = true;
        }

        currentPrompt = currentH2 && !EXCLUDED_H2_TITLES.has(currentH2.title)
          ? {
              categoryTitle: currentH2.title,
              promptTitle: h3Match[1].trim(),
              sectionLines: [],
              isH3Prompt: true
            }
          : null;
        continue;
      }

      if (currentPrompt) {
        currentPrompt.sectionLines.push(line);
      } else if (currentH2) {
        currentH2.lines.push(line);
      }
    }

    if (currentPrompt) {
      const finalizedPrompt = finalizePrompt(currentPrompt);
      if (finalizedPrompt) {
        prompts.push(finalizedPrompt);
      }
    }

    if (currentH2 && !currentH2HasH3 && !EXCLUDED_H2_TITLES.has(currentH2.title)) {
      const fallbackPrompt = finalizePrompt({
        categoryTitle: currentH2.title,
        promptTitle: currentH2.title,
        sectionLines: currentH2.lines,
        isH3Prompt: false
      });

      if (fallbackPrompt && extractMarkdownCodeBlock(currentH2.lines.join("\n").trim())) {
        prompts.push(fallbackPrompt);
      }
    }

    return prompts.filter((item) => item.displayTitle && item.body);
  }

  window.parsePrompts = parsePrompts;
})();
