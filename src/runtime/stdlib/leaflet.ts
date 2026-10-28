import {Icon} from "https://esm.sh/leaflet";

export * from "https://esm.sh/leaflet";

Icon.Default.imagePath = "https://esm.esh/leaflet/dist/images/";

const link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = "https://esm.sh/leaflet/dist/leaflet.css";
const loaded = new Promise((resolve, reject) => {
  link.onload = resolve;
  link.onerror = reject;
});
document.head.appendChild(link);
await loaded;
