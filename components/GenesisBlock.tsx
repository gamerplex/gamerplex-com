"use client";

import { useEffect, useRef } from "react";
import * as BABYLON from "@babylonjs/core";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/**
 * GAMERPLEX GENESIS BLOCK
 * This component initializes the Oasis:
 * 1. Connects to Solana Wallet (Identity Seed)
 * 2. Initializes Babylon.js WebGPU Engine
 * 3. Creates the Architect's Wireframe Avatar (Vertex Map)
 * 4. Prepared for MagicBlock Ephemeral Rollup Delegation
 */
export default function GenesisBlock() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { publicKey } = useWallet();

  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. Initialize Engine & Scene
    const engine = new BABYLON.WebGPUEngine(canvasRef.current);
    const initEngine = async () => {
      await engine.initAsync();
      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

      // 2. Setup Architect Camera (Conductive Flight)
      const camera = new BABYLON.FreeCamera("architectCam", new BABYLON.Vector3(0, 5, -10), scene);
      camera.setTarget(BABYLON.Vector3.Zero());
      camera.attachControl(canvasRef.current, true);
      camera.speed = 0.5;

      // 3. Grid Foundation (The Infinite Fabric)
      const gridMat = new BABYLON.StandardMaterial("gridMat", scene);
      gridMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
      gridMat.wireframe = true;
      gridMat.disableLighting = true;

      const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 2000, height: 2000, subdivisions: 100 }, scene);
      ground.material = gridMat;

      // SISAO ENTRY: THE EVENT HORIZON
      const eventHorizon = BABYLON.MeshBuilder.CreateTorus("eventHorizon", { thickness: 5, diameter: 50 }, scene);
      eventHorizon.position.set(0, 0, 1000);
      eventHorizon.rotation.x = Math.PI / 2;
      const ehMat = new BABYLON.StandardMaterial("ehMat", scene);
      ehMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
      ehMat.wireframe = true;
      eventHorizon.material = ehMat;

      // 4. Architect Avatar Synthesis (Optional Biometric Scan or Proxy)
      let avatarMesh: BABYLON.Mesh;
      if (publicKey) {
        // SISAO PROTOCOL: Identity Synthesis
        const useBiometricScan = false; 
        
        if (useBiometricScan) {
          avatarMesh = BABYLON.MeshBuilder.CreatePolyhedron("architectAvatar", { type: 1, size: 0.5 }, scene);
          console.log("[SISAO] SYNTHESIZING_BIOMETRIC_AVATAR");
        } else {
          avatarMesh = BABYLON.MeshBuilder.CreateSphere("architectAvatar", { diameter: 1, segments: 16 }, scene);
          console.log("[SISAO] ASSIGNING_PROXY_AVATAR");
        }

        const avatarMat = new BABYLON.StandardMaterial("avatarMat", scene);
        avatarMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        avatarMat.wireframe = true;
        avatarMesh.material = avatarMat;
        avatarMesh.parent = camera;
        avatarMesh.position.set(0, 0, 2);
      }

      engine.runRenderLoop(() => {
        scene.render();
      });
    };

    initEngine();

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      engine.dispose();
      window.removeEventListener("resize", handleResize);
    };
  }, [publicKey]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none" />
      <div className="absolute top-4 right-4 z-50">
        <WalletMultiButton />
      </div>
      <div className="absolute top-4 left-4 z-50 p-4 border border-[#0f0] bg-black/50 font-mono text-[#0f0]">
        <h1 className="text-xl font-bold tracking-widest">GAMERPLEX_GENESIS_BLOCK</h1>
        <p className="text-xs opacity-70 mt-2">STATUS: INITIALIZING_OASIS...</p>
        <p className="text-xs opacity-70">IDENTITY: {publicKey?.toBase58().slice(0, 8)}...</p>
      </div>
    </div>
  );
}
