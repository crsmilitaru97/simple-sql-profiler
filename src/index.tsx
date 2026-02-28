/* @refresh reload */
import { render } from "solid-js/web";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import App from "./App.tsx";

render(() => <App />, document.getElementById("root")!);
requestAnimationFrame(() => {
  void getCurrentWindow().show();
});
