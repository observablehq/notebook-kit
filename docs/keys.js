import {html} from "https://esm.sh/htl";

export const IS_MAC = /Mac|iPhone/.test(navigator.platform);

const symbols = {
  Alt: "⎇",
  Backspace: "⌫",
  Cmd: "⌘",
  Comma: ",",
  Delete: "⌦",
  Down: "↓",
  Enter: "↩\ufe0e", // variation selector; prevents emoji on iOS
  Escape: "⎋",
  Left: "←",
  Period: ".",
  Question: "?",
  Right: "→",
  Shift: "⇧",
  Slash: "/",
  Tab: "⇥",
  Up: "↑"
};

const macSymbols = {
  ...symbols,
  Alt: "⌥",
  Ctrl: "⌃"
};

const words = {
  Cmd: "Command",
  Escape: "Esc"
};

const macWords = {
  Alt: "option",
  Backspace: "delete",
  Cmd: "command",
  Ctrl: "control",
  Delete: "delete",
  Enter: "return",
  Escape: "esc",
  Fn: "fn",
  Shift: "shift",
  Space: "space",
  Tab: "tab"
};

const order = {
  Ctrl: -4,
  Alt: -3,
  Shift: -2,
  Cmd: -1
};

export const preferSymbols = IS_MAC
  ? (key) => macSymbols[key] ?? macWords[key] ?? key
  : (key) => symbols[key] ?? words[key] ?? key;

export const preferWords = IS_MAC
  ? (key) => macWords[key] ?? key
  : (key) => words[key] ?? key;

export const preferAuto = IS_MAC ? preferSymbols : preferWords;

export function formatKeys(keyset, formatKey = preferAuto) {
  const keys = keyset.split("-");
  const parts = [];
  let previousValue = "";
  for (const key of keys
    .map((k) => (k === "Mod" ? (IS_MAC ? "Cmd" : "Ctrl") : k))
    .sort((a, b) => (order[a] || keys.indexOf(a)) - (order[b] || keys.indexOf(b)))) {
    const value = formatKey(key);
    if (previousValue.length > 1) parts.push("-");
    parts.push(value);
    previousValue = value;
  }
  return parts.join("");
}

export function Keys(set) {
  const words = formatKeys(set, preferWords);
  const symbols = formatKeys(set, preferSymbols);
  return html`<strong>${words}</strong>${words !== symbols ? ` ${symbols}` : ""}`;
}
