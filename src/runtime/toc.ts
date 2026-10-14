const obstacles = "svg:not(svg svg), canvas, img, video, iframe, table, pre, aside, .katex-display";

export function toc(
  nav: HTMLElement,
  root = document.querySelector("main") ?? document.body
): void {
  let signature: string | undefined;
  let frame: number | undefined;

  function update(): void {
    frame = undefined;
    const headings = Array.from(root.querySelectorAll<HTMLElement>("h2[id], h3[id]"));
    const next = headings.map((h) => `${h.tagName} ${h.id} ${h.textContent}`).join("\n");
    if (next !== signature) {
      signature = next;
      nav.replaceChildren(list(headings));
      nav.hidden = !headings.length;
    }
    highlight(nav, headings);
    const obstructed = nav.dataset.style === "float" && isObstructed(nav, root);
    nav.toggleAttribute("data-obstructed", obstructed);
  }

  function schedule(): void {
    frame ??= requestAnimationFrame(update);
  }

  // Don’t hold the marks open after following a link.
  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) event.target.blur();
  });

  addEventListener("scroll", schedule, {passive: true});
  addEventListener("resize", schedule);
  new MutationObserver(schedule).observe(root, {childList: true, subtree: true});
  update();
}

function list(headings: HTMLElement[]): HTMLOListElement {
  const ol = document.createElement("ol");
  for (const heading of headings) {
    const li = ol.appendChild(document.createElement("li"));
    const a = li.appendChild(document.createElement("a"));
    li.dataset.level = heading.tagName.slice(1);
    a.href = `#${encodeURIComponent(heading.id)}`;
    a.textContent = heading.textContent;
  }
  return ol;
}

// The current section is the last heading above the middle of the window.
function highlight(nav: HTMLElement, headings: HTMLElement[]): void {
  let current = -1;
  while (headings[current + 1]?.getBoundingClientRect().top < innerHeight / 2) ++current;
  nav.querySelectorAll("a").forEach((link, i) => {
    if (i === current) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
}

// Collapsing to marks only fades the labels, so the nav keeps the bounds of the
// expanded list; toggling the state to measure would restart the transitions.
function isObstructed(nav: HTMLElement, root: Element): boolean {
  const a = nav.getBoundingClientRect();
  if (!a.width) return false; // not displayed
  for (const element of root.querySelectorAll(obstacles)) {
    const b = element.getBoundingClientRect();
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) return true;
  }
  return false;
}
