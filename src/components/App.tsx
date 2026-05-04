import { SimProvider } from "../state/context.tsx";
import { Header } from "./Header.tsx";
import { NodePanel } from "./NodePanel/NodePanel.tsx";
import { SimulationCanvas } from "./Canvas/SimulationCanvas.tsx";
import { InfoPanel } from "./InfoPanel/InfoPanel.tsx";
import { ControlBar } from "./ControlBar/ControlBar.tsx";
import { ScriptBanner } from "./ScriptBanner.tsx";

export default function App() {
  return (
    <SimProvider>
      <Header />
      <ScriptBanner />
      <main className="app-main">
        <NodePanel />
        <SimulationCanvas />
        <InfoPanel />
      </main>
      <ControlBar />
    </SimProvider>
  );
}
