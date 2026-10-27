import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base relativa: funciona tanto en un dominio propio como en GitHub Pages (/repo/).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
