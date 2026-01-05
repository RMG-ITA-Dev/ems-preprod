import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Failed to render app:", error);
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif;">
        <h1>Failed to load application</h1>
        <p>Please refresh the page or try again later.</p>
        <pre style="background: #f5f5f5; padding: 10px; overflow: auto;">${error}</pre>
      </div>
    `;
  }
} else {
  console.error("Root element not found");
}
