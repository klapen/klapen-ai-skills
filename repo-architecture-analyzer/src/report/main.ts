import type { RepositoryData } from "../shared/types";
import { boot } from "./shell";

declare global {
  interface Window {
    __REPO_ARCH_DATA__?: RepositoryData;
  }
}

export function bootstrapReport(): void {
  const data = window.__REPO_ARCH_DATA__;
  if (!data) return;
  const root = document.getElementById("rk-app");
  if (!root) return;
  boot(root, data);
}

bootstrapReport();
