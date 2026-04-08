import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Global reset styles
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { 
    background: #0D0D0D; 
    color: #F0EDE6; 
    font-family: 'DM Sans', -apple-system, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overscroll-behavior: none;
    overflow-x: hidden;
  }
  body { 
    min-height: 100vh; 
    min-height: 100dvh; 
  }
  input, select, textarea, button { font-family: inherit; }
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] { -moz-appearance: textfield; }
  ::selection { background: rgba(212, 133, 62, 0.3); }
  ::-webkit-scrollbar { width: 0; height: 0; }

  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap');
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
