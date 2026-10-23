// Entry for the standalone build: one self-contained page that runs the
// SIMULATED demo session in the browser, with no server.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { installLocalBackend } from "./backend";
import { App } from "../App";
import "../styles.css";

installLocalBackend();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App Router={MemoryRouter} />
  </StrictMode>,
);
