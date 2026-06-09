import "@cloudflare/kumo/styles/standalone";
import "@cloudflare/kumo/styles";
import "./styles/app.css";

import { Toasty } from "@cloudflare/kumo/components/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";

const client = new QueryClient();
document.documentElement.dataset.mode = localStorage.getItem("dental_manager_mode") === "dark" ? "dark" : "light";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <Toasty>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Toasty>
    </QueryClientProvider>
  </React.StrictMode>,
);
