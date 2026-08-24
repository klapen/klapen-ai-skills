import type { RepositoryData } from "../shared/types";
import type { AppState } from "./state";
import type { Derived } from "./derive";

export interface ViewContext {
  data: RepositoryData;
  derived: Derived;
  state: AppState;
  stage: HTMLElement;
  toolbar: HTMLElement;
  select: (id: string) => void;
  showTip: (ev: MouseEvent, html: string) => void;
  hideTip: () => void;
  moveTip: (ev: MouseEvent) => void;
}

export type ViewRenderer = (ctx: ViewContext) => void;
