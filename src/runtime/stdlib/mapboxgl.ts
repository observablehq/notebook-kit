export {default} from "npm:mapbox-gl";

const link = document.createElement("link");
link.href = "https://cdn.jsdelivr.net/npm/mapbox-gl/dist/mapbox-gl.css";
link.rel = "stylesheet";
document.head.appendChild(link);
