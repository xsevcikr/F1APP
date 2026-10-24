// Entry for the standalone build: one self-contained page with no server.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { installOfflineBackend } from "./backend";
import { App } from "../App";
import "../styles.css";

installOfflineBackend();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App Router={MemoryRouter} />
  </StrictMode>,
);
