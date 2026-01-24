"use client";

import { useState, useEffect, useRef } from "react";
import * as BABYLON from "@babylonjs/core";
import { SensorySystem } from "../../gamerplex-lib/visual/SensorySystem";
import { KineticSystem } from "../../gamerplex-lib/kinetic/KineticSystem";

/**
 * SISAO C3D BUILDER
 * A sovereign building environment where local AI (Ollama)
 * generates 3D GreasedLine structures in real-time.
 */
export default function C3DBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("IDLE");
  const [scene, setScene] = useState<BABYLON.Scene | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new BABYLON.Engine(canvasRef.current, true);
    const newScene = new BABYLON.Scene(engine);
    newScene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

    const camera = new BABYLON.FreeCamera("builderCam", new BABYLON.Vector3(0, 10, -30), newScene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.attachControl(canvasRef.current, true);

    // Initialize Sovereign Engine Systems
    SensorySystem.applyAtmosphere(newScene, "REZ");
    SensorySystem.injectCoordinateGrid(newScene);
    KineticSystem.injectFlightPhysics(newScene, camera);

    setScene(newScene);
    engine.runRenderLoop(() => newScene.render());

    return () => engine.dispose();
  }, []);

  const handleBuild = async () => {
    setStatus("GENERATING_GEOMETRY...");
    try {
      // OLLAMA API CALL: Using qwen3-coder:30b as the geometric engine
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        body: JSON.stringify({
          model: "qwen3-coder:30b",
          prompt: `Generate Babylon.js GreasedLine coordinates for: ${prompt}. Output only a JSON array of Vector3 arrays.`,
          stream: false
        })
      });

      const data = await response.json();
      console.log("[SISAO_C3D] RECEIVED_GEOMETRY", data.response);
      
      // Visualization logic would parse 'data.response' and call BABYLON.GreasedLineMeshBuilder
      setStatus("BUILD_COMPLETE");
    } catch (e) {
      console.error(e);
      setStatus("ERROR_LOCAL_AI_OFFLINE");
    }
  };

  return (
    <div className="relative w-full h-screen bg-black font-mono text-[#0f0]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none" />
      
      <div className="absolute bottom-10 left-10 right-10 z-50 p-6 border-2 border-[#0f0] bg-black/80 flex gap-4 items-center">
        <input 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="DESCRIBE_ARCHITECTURAL_INTENT..."
          className="flex-1 bg-transparent border-b border-[#0f0] outline-none p-2 text-xl uppercase placeholder:opacity-30"
        />
        <button 
          onClick={handleBuild}
          className="bg-[#0f0] text-black px-8 py-2 font-black hover:bg-white transition-all"
        >
          {status === "IDLE" ? "CONSTRUCT" : status}
        </button>
      </div>

      <div className="absolute top-10 left-10 z-50 p-4 border border-[#0f0] bg-black/50">
        <h1 className="text-2xl font-bold tracking-tighter">SISAO_C3D_BUILDER</h1>
        <p className="text-xs opacity-50">ENGINE: XIRTAMEHT_PURE_SYSTEM</p>
        <p className="text-xs opacity-50">LOCAL_MODEL: QWEN3_CODER_30B</p>
      </div>
    </div>
  );
}
