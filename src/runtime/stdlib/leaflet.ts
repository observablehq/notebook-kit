import {Icon} from "npm:leaflet";

export * from "npm:leaflet";

Icon.Default.imagePath = "https://cdn.jsdelivr.net/npm/leaflet/dist/images/";

const link = document.createElement("link");
link.href = "https://cdn.jsdelivr.net/npm/leaflet/dist/leaflet.css";
link.rel = "stylesheet";
document.head.appendChild(link);
