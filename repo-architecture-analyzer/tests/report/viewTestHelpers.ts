import { deriveContext } from "../../src/report/derive";
import { AppState } from "../../src/report/state";
import type { RepositoryData } from "../../src/shared/types";
import type { ViewContext } from "../../src/report/viewContext";

export function makeViewContext(data: RepositoryData, state: AppState = new AppState()): ViewContext {
  const stage = document.createElement("div");
  const toolbar = document.createElement("div");
  return {
    data,
    derived: deriveContext(data),
    state,
    stage,
    toolbar,
    select: (id: string) => state.select(id),
    showTip: () => {},
    hideTip: () => {},
    moveTip: () => {},
  };
}
