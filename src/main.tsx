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
    // Safe DOM manipulation to avoid XSS
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 20px; font-family: sans-serif;';
    
    const h1 = document.createElement('h1');
    h1.textContent = 'Failed to load application';
    
    const p = document.createElement('p');
    p.textContent = 'Please refresh the page or try again later.';
    
    const pre = document.createElement('pre');
    pre.style.cssText = 'background: #f5f5f5; padding: 10px; overflow: auto;';
    pre.textContent = String(error);
    
    errorDiv.append(h1, p, pre);
    rootElement.appendChild(errorDiv);
  }
} else {
  console.error("Root element not found");
}
