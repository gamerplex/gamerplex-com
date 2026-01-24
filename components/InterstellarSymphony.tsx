"use client";

import { useEffect, useRef, useState } from "react";
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";

function generateAI(minutes: number) {
    const score = []; const scales = [36, 48, 52, 55, 60, 64, 67, 72, 76, 79]; let t = 0.1;
    for(let i=0; i<minutes*20; i++) {
        score.push({"note":{"onTime": t, "pitch": scales[Math.floor(Math.random()*3)], "offTime": t+3}});
        for(let j=0; j<2; j++) {
            score.push({"note":{"onTime": t+j*0.3, "pitch": scales[Math.floor(Math.random()*scales.length)], "offTime": t+j*0.3+0.3}});
        }
        t += 3.0;
    }
    return score;
}

export default function InterstellarSymphony({ onStatsUpdate }: { onStatsUpdate?: (stats: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const notesRef = useRef<{ m: BABYLON.AbstractMesh; p: number; hit: boolean; durSec: number; onTime: number; radius: number; angle: number }[]>([]);
  const rootRef = useRef<BABYLON.TransformNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastInputTimeRef = useRef<number>(0);
  const isAutoFlyoverRef = useRef(true);

  const [showPlayOverlay, setShowPlayOverlay] = useState(true);

  const synthFrequencies = Array.from({length: 128}, (_, i) => 440 * Math.pow(2, (i - 69) / 12));

  const startAudio = async () => {
    setShowPlayOverlay(false);
    // If audio context exists and suspended, resume it
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log("[SISAO] AUDIO_RESUMED");
        return;
    }

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;
      
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-24, ctx.currentTime);
      limiter.knee.setValueAtTime(30, ctx.currentTime);
      limiter.ratio.setValueAtTime(12, ctx.currentTime);
      limiter.attack.setValueAtTime(0.003, ctx.currentTime);
      limiter.release.setValueAtTime(0.25, ctx.currentTime);
      
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.3, ctx.currentTime); // Increased slightly for impact
      masterGainRef.current = masterGain;

      masterGain.connect(limiter);
      limiter.connect(ctx.destination);
      
      console.log("[SISAO] AUDIO_CONTEXT_CREATED");
    }
    
    startTimeRef.current = performance.now();
    console.log("[SISAO] AUDIO_STREAM_STARTED");
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
    g.gain.linearRampToValueAtTime(0.15, time + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur + 1.5);
    
    f.connect(g); h.connect(g); 
    g.connect(masterGainRef.current);
    
    f.start(); f.stop(time + dur + 1.5);
    h.start(); h.stop(time + dur + 1.5);
  };

  const loadSymphony = async () => {
    if(!rootRef.current) return;
    notesRef.current.forEach(n => n.m.dispose());
    const currentScore = generateAI(60);
    const nMat = new BABYLON.StandardMaterial("nm", rootRef.current.getScene());
    nMat.emissiveColor = new BABYLON.Color3(0.0, 0.8, 1.0); 
    nMat.disableLighting = true; nMat.alpha = 1.0; 

    const baseMesh = BABYLON.MeshBuilder.CreateLathe(`baseNote`, {
        shape: [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(10, 0.01, 0), new BABYLON.Vector3(0, 100, 0)],
        tessellation: 4
    }, rootRef.current!.getScene());
    baseMesh.material = nMat;
    baseMesh.isVisible = false;

    notesRef.current = currentScore.map((d: any) => {
        const pitch = d.note.pitch;
        const dur = Math.max(d.note.offTime - d.note.onTime, 0.1);
        const angle = Math.random() * Math.PI * 2;
        const radius = 4000 + Math.random() * 2000;
        
        const n = baseMesh.createInstance(`n_${pitch}_${d.note.onTime}`);
        n.scaling.y = (dur * 50) / 100;
        n.parent = rootRef.current;
        n.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 10000);
        return { m: n, p: pitch, hit: false, durSec: dur, onTime: d.note.onTime, radius, angle };
    });
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new BABYLON.Engine(canvasRef.current, true, { antialias: true });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
    const root = new BABYLON.TransformNode("root", scene);
    rootRef.current = root;
    const throatRadius = 24;

    const camera = new BABYLON.FreeCamera("bgCamera", new BABYLON.Vector3(0, 0, -2000), scene);
    camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    camera.attachControl(canvasRef.current, true);
    
    // WASD and Arrows
    camera.keysUp = [87, 38]; 
    camera.keysDown = [83, 40]; 
    camera.keysLeft = [65, 37]; 
    camera.keysRight = [68, 39];
    
    camera.speed = 50.0;
    camera.angularSensibility = 500; // Lower is more sensitive for mouse look
    camera.inertia = 0.9;
    camera.checkCollisions = false;
    camera.applyGravity = false;

    const bridgeMat = new BABYLON.StandardMaterial("bm", scene);
    bridgeMat.emissiveColor = new BABYLON.Color3(0.5, 0, 1.0);
    bridgeMat.alpha = 0.3; bridgeMat.wireframe = true;
    bridgeMat.backFaceCulling = false;

    const points = [];
    for(let i=0; i<=150; i++) {
        const t = i / 150;
        const r = throatRadius + (10000 - throatRadius) * t;
        const h = -1000 * (1 / (1 + (r - throatRadius)/100));
        points.push(new BABYLON.Vector3(r, h, 0));
    }
    for(let i=1; i<=100; i++) {
        points.unshift(new BABYLON.Vector3(throatRadius, -1000 - i * (20000/100), 0));
    }
    const wormhole = BABYLON.MeshBuilder.CreateLathe("wormhole", {
        shape: points, tessellation: 128, sideOrientation: BABYLON.Mesh.DOUBLESIDE
    }, scene);
    wormhole.rotation.x = Math.PI / 2; wormhole.material = bridgeMat;

    // INTERACTION HANDLERS TO UNLOCK AUDIO
    const handleInput = () => { 
        lastInputTimeRef.current = Date.now(); 
        isAutoFlyoverRef.current = false; 
        startAudio(); // Attempt audio start on any input
    };
    window.addEventListener("keydown", handleInput);
    window.addEventListener("pointerdown", handleInput);
    window.addEventListener("wheel", handleInput);

    engine.runRenderLoop(() => {
        const now = Date.now();
        const time = now / 1000;
        
        if (now - lastInputTimeRef.current > 10000) isAutoFlyoverRef.current = true;

        if (isAutoFlyoverRef.current) {
            camera.position.x = Math.sin(time * 0.1) * 1500;
            camera.position.y = Math.cos(time * 0.1) * 1500;
            camera.position.z = -3500 + Math.sin(time * 0.2) * 500;
            camera.setTarget(new BABYLON.Vector3(0, 0, 0));
        }

        if (onStatsUpdate && Math.floor(time * 10) % 5 === 0) {
            onStatsUpdate({
                fps: engine.getFps().toFixed(0),
                meshes: scene.meshes.length,
                memory: (window.performance as any).memory ? Math.round((window.performance as any).memory.usedJSHeapSize / 1048576) : 'N/A'
            });
        }

        if (startTimeRef.current !== 0) {
            const sTime = (now - startTimeRef.current) / 1000;
            bridgeMat.emissiveColor = new BABYLON.Color3(0.5 + Math.sin(time * 0.5) * 0.2, 0.1, 0.8 + Math.cos(time * 0.5) * 0.2);

            notesRef.current.forEach(note => {
                const mesh = note.m; if (!mesh) return;
                const progress = (sTime - note.onTime);
                const z = 10000 - (progress * 500);
                
                if (z > -1000) {
                    const currentR = Math.max(throatRadius + (z - (-1000)) * 0.5, throatRadius);
                    const h = -1000 * (1 / (1 + (currentR - throatRadius)/100));
                    mesh.position.set(Math.cos(note.angle) * currentR, Math.sin(note.angle) * currentR, h);
                    mesh.lookAt(new BABYLON.Vector3(0, 0, -5000));
                } else {
                    const tunnelZ = -1000 + (z + 1000); 
                    mesh.position.set(Math.cos(note.angle) * throatRadius, Math.sin(note.angle) * throatRadius, tunnelZ);
                    mesh.lookAt(new BABYLON.Vector3(0, 0, tunnelZ - 100));
                    if (!note.hit && (z <= -1000)) {
                        note.hit = true;
                        playSynth(note.p, note.durSec);
                    }
                }
            });
        }
        scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);
    
    // PRE-LOAD PARTICLES IMMEDIATELY
    startTimeRef.current = performance.now();
    loadSymphony();

    // Setup joystick if on mobile or as an alternative
    const setupJoystick = () => {
        const container = document.createElement("div");
        container.id = "joystick-container";
        container.style.position = "absolute";
        container.style.bottom = "40px";
        container.style.left = "40px";
        container.style.width = "120px";
        container.style.height = "120px";
        container.style.borderRadius = "50%";
        container.style.background = "rgba(255, 255, 255, 0.1)";
        container.style.border = "2px solid rgba(0, 255, 255, 0.3)";
        container.style.touchAction = "none";
        container.style.zIndex = "10";
        document.body.appendChild(container);

        const stick = document.createElement("div");
        stick.style.position = "absolute";
        stick.style.top = "50%";
        stick.style.left = "50%";
        stick.style.width = "50px";
        stick.style.height = "50px";
        stick.style.borderRadius = "50%";
        stick.style.background = "rgba(0, 255, 255, 0.5)";
        stick.style.transform = "translate(-50%, -50%)";
        container.appendChild(stick);

        let active = false;
        let startPos = { x: 0, y: 0 };

        const onMove = (e: TouchEvent | MouseEvent) => {
            if (!active) return;
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            
            const dx = clientX - startPos.x;
            const dy = clientY - startPos.y;
            const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 50);
            const angle = Math.atan2(dy, dx);
            
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            
            stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
            
            // Move camera based on joystick
            const moveSpeed = 5;
            camera.cameraDirection.x += (x / 50) * moveSpeed;
            camera.cameraDirection.z -= (y / 50) * moveSpeed; // Forward/Back
        };

        const onStart = (e: TouchEvent | MouseEvent) => {
            active = true;
            const rect = container.getBoundingClientRect();
            startPos = { x: rect.left + 60, y: rect.top + 60 };
            handleInput();
        };

        const onEnd = () => {
            active = false;
            stick.style.transform = "translate(-50%, -50%)";
        };

        container.addEventListener("mousedown", onStart as any);
        window.addEventListener("mousemove", onMove as any);
        window.addEventListener("mouseup", onEnd);
        
        container.addEventListener("touchstart", onStart as any);
        window.addEventListener("touchmove", onMove as any);
        window.addEventListener("touchend", onEnd);

        return container;
    };

    const joystick = setupJoystick();

    return () => { 
        engine.dispose(); 
        if (joystick && joystick.parentNode) joystick.parentNode.removeChild(joystick);
        window.removeEventListener("resize", handleResize); 
        window.removeEventListener("keydown", handleInput);
        window.removeEventListener("pointerdown", handleInput);
        window.removeEventListener("wheel", handleInput);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block', outline: 'none', border: 'none', margin: 0, padding: 0 }} />
      {showPlayOverlay && (
        <div 
          onClick={startAudio}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
            cursor: 'pointer',
            color: '#00ffff',
            fontFamily: 'monospace',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '1rem', textShadow: '0 0 10px #00ffff' }}>INTERSTELLAR SYMPHONY</div>
          <div style={{ fontSize: '1rem', border: '1px solid #00ffff', padding: '10px 20px', borderRadius: '5px' }}>
            CLICK TO INITIALIZE FREQUENCY STREAM
          </div>
          <div style={{ marginTop: '2rem', fontSize: '0.8rem', opacity: 0.7 }}>
            WASD / MOUSE / JOYSTICK TO NAVIGATE
          </div>
        </div>
      )}
    </div>
  );
}
