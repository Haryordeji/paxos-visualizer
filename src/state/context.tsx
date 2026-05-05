import { createContext, useContext, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import { reducer, initialAppState } from "./reducer.ts";
import type { AppState, Action } from "./reducer.ts";

interface SimContextValue {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const SimContext = createContext<SimContextValue | null>(null);

export function SimProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialAppState);
  return (
    <SimContext.Provider value={{ state, dispatch }}>
      {children}
    </SimContext.Provider>
  );
}

export function useSimulation(): SimContextValue {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSimulation must be inside SimProvider");
  return ctx;
}
