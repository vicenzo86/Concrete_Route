
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log("🚀 Arga Router: Inicializando aplicação...");

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("❌ Erro: Elemento #root não encontrado no DOM.");
}
