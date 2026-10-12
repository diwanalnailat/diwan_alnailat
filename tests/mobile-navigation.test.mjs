import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

// JSDOM has no layout engine. Evaluate width media rules explicitly to inspect
// the production cascade; these assertions do not claim pixel/visual coverage.
function stylesAtWidth(width) {
  const dom = new JSDOM(fs.readFileSync("public/index.html", "utf8"), {
    url: "https://diwan.test/",
    runScripts: "outside-only",
  });
  const { document } = dom.window;
  const applies = (media) =>
    media.split(",").some((query) => {
      if (/print|prefers-|orientation/.test(query)) return false;
      const minimum = /min-width:\s*(\d+)px/.exec(query);
      const maximum = /max-width:\s*(\d+)px/.exec(query);
      return (
        (!minimum || width >= Number(minimum[1])) &&
        (!maximum || width <= Number(maximum[1]))
      );
    });
  const flatten = (rules) =>
    [...rules]
      .flatMap((rule) => {
        if (rule.type === 4)
          return applies(rule.conditionText) ? flatten(rule.cssRules) : [];
        return [rule.cssText];
      })
      .join("\n");
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const style = document.createElement("style");
    style.textContent = fs.readFileSync(
      "public" + link.getAttribute("href"),
      "utf8",
    );
    document.head.append(style);
    const evaluated = flatten(style.sheet.cssRules);
    style.textContent = evaluated;
  }
  return dom;
}

test("phone navigation keeps accessible actions and a shrinking title in one row", () => {
  for (const width of [320, 375, 430, 640]) {
    const dom = stylesAtWidth(width),
      w = dom.window,
      d = w.document;
    try {
      const menu = d.querySelector(".mobile-menu"),
        floating = d.querySelector(".sidebar-toggle");
      assert.ok(
        menu.closest(".topbar .breadcrumb"),
        "menu belongs to the topbar layout",
      );
      assert.equal(menu.dataset.action, "menu");
      assert.equal(menu.getAttribute("aria-controls"), "sidebar");
      assert.equal(
        w.getComputedStyle(floating).display,
        "none",
        `${width}: no floating control over title`,
      );
      const menuStyle = w.getComputedStyle(menu);
      assert.equal(menuStyle.display, "inline-flex");
      assert.notEqual(menuStyle.position, "fixed");
      assert.notEqual(menuStyle.position, "absolute");
      assert.ok(parseFloat(menuStyle.minWidth) >= 44);
      assert.ok(parseFloat(menuStyle.minHeight) >= 44);
      assert.equal(
        w.getComputedStyle(d.querySelector(".topbar")).flexWrap,
        "nowrap",
      );
      assert.equal(
        w.getComputedStyle(d.querySelector(".top-actions")).flexWrap,
        "nowrap",
      );
      assert.equal(
        w.getComputedStyle(d.querySelector(".breadcrumb")).whiteSpace,
        "nowrap",
      );
      const title = d.querySelector("#crumb");
      title.textContent = "A very long workspace page title";
      assert.equal(w.getComputedStyle(title).textOverflow, "ellipsis");
      assert.equal(parseFloat(w.getComputedStyle(title).minWidth), 0);
      const actions = [
        ...d.querySelectorAll(".top-actions > button:not(.search-trigger)"),
      ];
      let actionWidth = 0;
      for (const button of actions) {
        const style = w.getComputedStyle(button);
        assert.ok(
          button.getAttribute("aria-label"),
          "compact buttons retain accessible names",
        );
        assert.equal(parseFloat(style.width), 44);
        assert.equal(parseFloat(style.minHeight), 44);
        assert.equal(style.flexShrink, "0");
        actionWidth += parseFloat(style.width);
      }
      // Budget for all four actions (including Sanad when enabled), the menu,
      // gaps and padding still leaves room for the title on the narrowest phone.
      const bar = w.getComputedStyle(d.querySelector(".topbar"));
      const actionGap = parseFloat(
        w.getComputedStyle(d.querySelector(".top-actions")).gap,
      );
      const breadcrumbGap = parseFloat(
        w.getComputedStyle(d.querySelector(".breadcrumb")).gap,
      );
      const reserved =
        actionWidth +
        actionGap * (actions.length - 1) +
        44 +
        breadcrumbGap +
        parseFloat(bar.gap) +
        parseFloat(bar.paddingLeft) +
        parseFloat(bar.paddingRight);
      assert.ok(
        width - reserved >= 40,
        `${width}: room for page title without wrapping`,
      );
      assert.equal(
        w.getComputedStyle(d.querySelector(".quick-add-label")).display,
        "none",
      );
      assert.equal(
        w.getComputedStyle(d.querySelector(".sanad-brand-mark")).display,
        "none",
      );
    } finally {
      dom.window.close();
    }
  }
});

test("desktop retains its fixed sidebar edge control", () => {
  const dom = stylesAtWidth(1440);
  try {
    const style = dom.window.getComputedStyle(
      dom.window.document.querySelector(".sidebar-toggle"),
    );
    assert.equal(style.position, "fixed");
    assert.notEqual(style.display, "none");
  } finally {
    dom.window.close();
  }
});

test("Escape and backdrop close return focus to the visible mobile menu", () => {
  const dom = stylesAtWidth(375),
    w = dom.window,
    d = w.document;
  Object.defineProperty(w, "innerWidth", { value: 375 });
  w.fetch = () => new Promise(() => {});
  try {
    w.eval(fs.readFileSync("public/app.js", "utf8"));
    const menu = d.querySelector(".mobile-menu"),
      sidebar = d.querySelector("#sidebar");
    menu.click();
    assert.equal(sidebar.classList.contains("open"), true);
    menu.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    assert.equal(sidebar.classList.contains("open"), false);
    assert.equal(d.activeElement, menu);
    menu.click();
    d.querySelector(".menu-backdrop").click();
    assert.equal(sidebar.classList.contains("open"), false);
    assert.equal(d.activeElement, menu);
    assert.equal(menu.getAttribute("aria-expanded"), "false");
  } finally {
    dom.window.close();
  }
});
