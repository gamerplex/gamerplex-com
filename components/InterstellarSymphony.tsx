"use client";

import { useEffect, useRef, useState } from "react";
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";

function generateAI(minutes: number) {
    const score = []; const scales = [36, 48, 52, 55, 60, 64, 67, 72, 76, 79]; let t = 0.1;
    for(let i=0; i<minutes*10; i++) {
        score.push({"note":{"onTime": t, "pitch": scales[Math.floor(Math.random()*3)], "offTime": t+3}});
        for(let j=0; j<1; j++) {
            score.push({"note":{"onTime": t+j*0.3, "pitch": scales[Math.floor(Math.random()*scales.length)], "offTime": t+j*0.3+0.3}});
        }
        t += 3.0;
    }
    return score;
}

export default function InterstellarSymphony({ onStatsUpdate, showJoystick = true }: { onStatsUpdate?: (stats: any) => void, showJoystick?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BABYLON.Engine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const notesRef = useRef<{ m: BABYLON.AbstractMesh; p: number; hit: boolean; durSec: number; onTime: number; radius: number; angle: number }[]>([]);
  const rootRef = useRef<BABYLON.TransformNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastInputTimeRef = useRef<number>(0);
  const isAutoFlyoverRef = useRef(true);
  const autoTimeRef = useRef(0);
  const isAudioStartedRef = useRef(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(false);

  const synthFrequencies = Array.from({length: 128}, (_, i) => 440 * Math.pow(2, (i - 69) / 12));

  const startAudio = async () => {
    if (isAudioStartedRef.current) return;
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        isAudioStartedRef.current = true;
        return;
    }
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-24, ctx.currentTime);
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.3, ctx.currentTime);
      masterGainRef.current = masterGain;
      masterGain.connect(limiter);
      limiter.connect(ctx.destination);
    }
    isAudioStartedRef.current = true;
    startTimeRef.current = performance.now();
    loadSymphony();
  };

  const playSynth = (pitch: number, dur: number) => {
    if (!audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current!;
    const freq = synthFrequencies[pitch];
    const time = ctx.currentTime;
    const f = ctx.createOscillator(), h = ctx.createOscillator(), g = ctx.createGain();
    f.type = "square"; f.frequency.value = freq;
    h.type = "sine"; h.frequency.value = freq * 0.5;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.1, time + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur + 1.5);
    f.connect(g); h.connect(g); 
    g.connect(masterGainRef.current);
    f.start(); f.stop(time + dur + 1.5);
    h.start(); h.stop(time + dur + 1.5);
  };

  const loadSymphony = async () => {
    if(!rootRef.current) return;
    const scene = rootRef.current.getScene();
    notesRef.current.forEach(n => { if (n.m) n.m.dispose(false, true); });
    notesRef.current = [];
    const currentScore = generateAI(30);
    const nMat = new BABYLON.StandardMaterial("nm", scene);
    nMat.emissiveColor = new BABYLON.Color3(0.0, 0.8, 1.0); 
    nMat.disableLighting = true;
    const baseMesh = BABYLON.MeshBuilder.CreateLathe(`baseNote`, {
        shape: [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(10, 0.01, 0), new BABYLON.Vector3(0, 100, 0)],
        tessellation: 4
    }, scene);
    baseMesh.material = nMat;
    baseMesh.isVisible = false;
    const MAX_VISIBLE_NOTES = 1000;
    const limitedScore = currentScore.slice(0, MAX_VISIBLE_NOTES);
    notesRef.current = limitedScore.map((d: any) => {
        const pitch = d.note.pitch;
        const dur = Math.max(d.note.offTime - d.note.onTime, 0.1);
        const angle = Math.random() * Math.PI * 2;
        const radius = 4000 + Math.random() * 2000;
        const n = baseMesh.createInstance(`n_${pitch}_${d.note.onTime}`);
        n.scaling.y = (dur * 50) / 100;
        n.parent = rootRef.current;
        n.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 10000);
        n.freezeWorldMatrix();
        return { m: n, p: pitch, hit: false, durSec: dur, onTime: d.note.onTime, radius, angle };
    });
    baseMesh.dispose();
  };

  useEffect(() => {
    const container = document.getElementById("joystick-container");
    if (container) { container.style.display = showJoystick ? "block" : "none"; }
  }, [showJoystick]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (engineRef.current) { engineRef.current.dispose(); }
    
    const engine = new BABYLON.Engine(canvasRef.current, true, { antialias: true, adaptToDeviceRatio: true });
    engineRef.current = engine;
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
    scene.blockMaterialDirtyMechanism = true;

    const root = new BABYLON.TransformNode("root", scene);
    rootRef.current = root;
    const throatRadius = 24;

    const camera = new BABYLON.UniversalCamera("bgCamera", new BABYLON.Vector3(0, 0, -2000), scene);
    camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    camera.attachControl(canvasRef.current, true);
    
    // FLY NAVIGATION
    camera.keysUp = [87, 38];    // W
    camera.keysDown = [83, 40];  // S
    camera.keysLeft = [65, 37];  // A
    camera.keysRight = [68, 39]; // D
    camera.keysUpward = [32];    // SPACE
    camera.keysDownward = [16];  // SHIFT
    
    camera.speed = 100.0;
    camera.angularSensibility = 500;
    camera.inertia = 0.9;

    // INTERACTIVE FOCUS
    const onPointerDown = () => {
        engine.enterPointerlock();
        canvasRef.current?.focus();
    };
    scene.onPointerDown = onPointerDown;

    const bridgeMat = new BABYLON.StandardMaterial("bm", scene);
    bridgeMat.emissiveColor = new BABYLON.Color3(0.5, 0, 1.0);
    bridgeMat.alpha = 0.3; bridgeMat.wireframe = true;
    bridgeMat.backFaceCulling = false;
    bridgeMat.freeze();

    const points = [];
    for(let i=0; i<=100; i++) {
        const t = i / 100;
        const r = throatRadius + (10000 - throatRadius) * t;
        const h = -1000 * (1 / (1 + (r - throatRadius)/100));
        points.push(new BABYLON.Vector3(r, h, 0));
    }
    for(let i=1; i<=50; i++) {
        points.unshift(new BABYLON.Vector3(throatRadius, -1000 - i * (20000/50), 0));
    }
    const wormhole = BABYLON.MeshBuilder.CreateLathe("wormhole", {
        shape: points, tessellation: 64, sideOrientation: BABYLON.Mesh.DOUBLESIDE
    }, scene);
    wormhole.rotation.x = Math.PI / 2; wormhole.material = bridgeMat;
    wormhole.freezeWorldMatrix();

    const handleInput = () => { 
        lastInputTimeRef.current = Date.now(); 
        isAutoFlyoverRef.current = false; 
        startAudio(); 
    };
    window.addEventListener("keydown", handleInput);
    window.addEventListener("pointerdown", handleInput);
    window.addEventListener("wheel", handleInput);

    engine.runRenderLoop(() => {
        const now = Date.now();
        const deltaTime = engine.getDeltaTime() / 1000;
        if (now - lastInputTimeRef.current > 1000) isAutoFlyoverRef.current = true;

        if (isAutoFlyoverRef.current) {
            autoTimeRef.current += deltaTime;
            const t = autoTimeRef.current;
            camera.position.x = Math.sin(t * 0.1) * 1500;
            camera.position.y = Math.cos(t * 0.1) * 1500;
            camera.position.z = -3500 + Math.sin(t * 0.2) * 500;
            camera.setTarget(new BABYLON.Vector3(0, 0, 0));
        }

        if (onStatsUpdate && Math.floor(now / 1000 * 10) % 10 === 0) {
            onStatsUpdate({
                fps: engine.getFps().toFixed(0),
                meshes: scene.meshes.length,
                memory: (window.performance as any).memory ? Math.round((window.performance as any).memory.usedJSHeapSize / 1048576) : 'N/A'
            });
        }

        if (startTimeRef.current !== 0) {
            const sTime = (now - startTimeRef.current) / 1000;
            notesRef.current.forEach(note => {
                const mesh = note.m; if (!mesh) return;
                const progress = (sTime - note.onTime);
                const z = 10000 - (progress * 500);
                if (z < 11000 && z > -20000) {
                    if (z > -1000) {
                        const currentR = Math.max(throatRadius + (z - (-1000)) * 0.5, throatRadius);
                        const h = -1000 * (1 / (1 + (currentR - throatRadius)/100));
                        mesh.position.set(Math.cos(note.angle) * currentR, Math.sin(note.angle) * currentR, h);
                        mesh.lookAt(new BABYLON.Vector3(0, 0, -5000));
                    } else {
                        const tunnelZ = -1000 + (z + 1000); 
                        mesh.position.set(Math.cos(note.angle) * throatRadius, Math.sin(note.angle) * throatRadius, tunnelZ);
                        mesh.lookAt(new BABYLON.Vector3(0, 0, tunnelZ - 100));
                        if (!note.hit && (z <= -1000)) { note.hit = true; playSynth(note.p, note.durSec); }
                    }
                }
            });
        }
        scene.render();
    });

    window.addEventListener("resize", () => engine.resize());
    loadSymphony();

    const setupJoystick = () => {
        const existing = document.getElementById("joystick-container");
        if (existing) existing.remove();
        const container = document.createElement("div");
        container.id = "joystick-container";
        container.style.cssText = "position:absolute;bottom:40px;left:40px;width:120px;height:120px;borderRadius:50%;background:rgba(255,255,255,0.1);border:2px solid rgba(0,255,255,0.3);touchAction:none;zIndex:10;";
        container.style.display = showJoystick ? "block" : "none";
        document.body.appendChild(container);
        const stick = document.createElement("div");
        stick.style.cssText = "position:absolute;top:50%;left:50%;width:50px;height:50px;borderRadius:50%;background:rgba(0,255,255,0.5);transform:translate(-50%,-50%);";
        container.appendChild(stick);
        let active = false; let startPos = { x: 0, y: 0 };
        const onMove = (e: any) => {
            if (!active) return;
            const cx = e.touches ? e.touches[0].clientX : e.clientX;
            const cy = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = cx - startPos.x, dy = cy - startPos.y;
            const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 50), angle = Math.atan2(dy, dx);
            const x = Math.cos(angle) * dist, y = Math.sin(angle) * dist;
            stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
            camera.cameraDirection.x += (x / 50) * 10;
            camera.cameraDirection.z -= (y / 50) * 10;
        };
        container.addEventListener("mousedown", (e) => { active = true; const r = container.getBoundingClientRect(); startPos = { x: r.left + 60, y: r.top + 60 }; handleInput(); });
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", () => { active = false; stick.style.transform = "translate(-50%, -50%)"; });
        container.addEventListener("touchstart", (e) => { active = true; const r = container.getBoundingClientRect(); startPos = { x: r.left + 60, y: r.top + 60 }; handleInput(); });
        window.addEventListener("touchmove", onMove);
        window.addEventListener("touchend", () => { active = false; stick.style.transform = "translate(-50%, -50%)"; });
        return container;
    };
    const joystick = setupJoystick();

    return () => { 
        engine.dispose(); 
        if (joystick && joystick.parentNode) joystick.parentNode.removeChild(joystick);
        window.removeEventListener("keydown", handleInput);
        window.removeEventListener("pointerdown", handleInput);
        window.removeEventListener("wheel", handleInput);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block', outline: 'none', border: 'none', margin: 0, padding: 0 }} tabIndex={1} />
    </div>
  );
}
