import {observe} from "./observe.js";

export function dark() {
  return observe<boolean>((notify) => {
    let dark: boolean | undefined;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const probe = document.createElement("div");
    probe.style.transitionProperty = "color, background-color";
    probe.style.transitionDuration = "1ms";
    const changed = () => {
      const s = getComputedStyle(document.body).getPropertyValue("color-scheme").split(/\s+/);
      const d = s.includes("light") && s.includes("dark") ? media.matches : s.includes("dark");
      if (dark === d) return;
      notify((dark = d));
    };
    document.body.appendChild(probe);
    changed();
    probe.addEventListener("transitionstart", changed);
    media.addEventListener("change", changed);
    return () => {
      probe.remove();
      media.removeEventListener("change", changed);
    };
  });
}
