/* Progressive motion — every view remains readable without animations or JavaScript effects. */
(() => {
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let observer;
  const seen = new WeakSet();
  function enter(root) {
    observer?.disconnect();
    if (!root || preference?.matches) return;
    const cards = [
      ...root.querySelectorAll(
        ".metric-card,.service-tile,.command-section,.season-card,.project-card,.asset-card,.service-card,.page-heading,.command-toolbar",
      ),
    ];
    if (!("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("motion-enter");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.07 },
    );
    cards.forEach((card, index) => {
      card.style.setProperty(
        "--enter-delay",
        `${Math.min(index % 4, 3) * 65}ms`,
      );
      observer.observe(card);
    });
    // Count only real integer metrics and retain the final accessible text throughout.
    root.querySelectorAll(".metric-number").forEach((el) => {
      if (seen.has(el) || !/^\d+$/.test(el.textContent.trim())) return;
      seen.add(el);
      el.animate?.(
        [
          { transform: "translateY(8px)", opacity: 0.5 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    });
  }
  preference?.addEventListener?.("change", () => {
    if (preference.matches) observer?.disconnect();
  });
  document.addEventListener("pointerdown", (e) => {
    if (preference?.matches) return;
    const button = e.target.closest(".button,.service-tile,.filter-chip");
    if (button && !button.disabled)
      button.animate?.([{ scale: "1" }, { scale: ".97" }, { scale: "1" }], {
        duration: 230,
        easing: "ease-out",
      });
  });
  globalThis.DiwanMotion = { enter };
})();
