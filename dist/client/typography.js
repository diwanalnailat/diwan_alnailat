/* Display copy only — records, form values, file names and numeric precision stay intact. */
(() => {
  const clean = (value) =>
    String(value ?? "")
      .replace(/(^|\s)([^\s]*)(?=\s|$)/gu, (match, space, word) => {
        if (
          /^(?:https?:\/\/|www\.)/i.test(word) ||
          /@/.test(word) ||
          /\.(?:pdf|docx?|xlsx?|png|jpe?g|webp|txt|csv|mp[34]|wav|zip)$/i.test(
            word,
          )
        )
          return match;
        return (
          space +
          word.replace(/[،؛·…]/g, " ").replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
        );
      })
      .replace(/([^\S\n]){2,}/g, " ");
  globalThis.DiwanTypography = { clean };
  if (typeof document === "undefined") return;
  const excluded =
    "script,style,textarea,input,pre,code,svg,[contenteditable],[data-verbatim],a[href^='/api/files/']";
  const tidy = (root) => {
    if (root.nodeType === 3) {
      if (!root.parentElement || root.parentElement.closest(excluded)) return;
      const next = clean(root.data);
      if (next !== root.data) root.data = next;
      return;
    }
    if (root.nodeType !== 1 || root.matches(excluded)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) tidy(node);
    for (const el of [
      root,
      ...root.querySelectorAll("[placeholder],[aria-label],[title]"),
    ]) {
      for (const attr of ["placeholder", "aria-label", "title"]) {
        if (el.hasAttribute(attr)) {
          const old = el.getAttribute(attr),
            next = clean(old);
          if (old !== next) el.setAttribute(attr, next);
        }
      }
    }
  };
  tidy(document.body);
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === "characterData") tidy(change.target);
      else for (const node of change.addedNodes) tidy(node);
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
})();
