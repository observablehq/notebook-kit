export {default} from "https://esm.sh/mapbox-gl";

const link = document.createElement("link");
link.href = "https://esm.sh/mapbox-gl/dist/mapbox-gl.css";
link.rel = "stylesheet";
document.head.appendChild(link);
