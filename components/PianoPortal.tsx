"use client";

import { useEffect, useRef, useState } from "react";
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";

function generateAI(minutes: number) {
    const score = []; const scales = [36, 48, 52, 55, 60, 64, 67, 72, 76, 79]; let t = 1.0;
    for(let i=0; i<minutes*120; i++) {
        score.push({"note":{"onTime": t, "pitch": scales[Math.floor(Math.random()*3)], "offTime": t+3}});
        for(let j=0; j<6; j++) {
            score.push({"note":{"onTime": t+j*0.3, "pitch": scales[Math.floor(Math.random()*scales.length)], "offTime": t+j*0.3+0.3}});
        }
        t += 2.5;
    }
    return score;
}

export default function PianoPortal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [songIndex, setSongIndex] = useState(0);
  const [manifest, setManifest] = useState<any>({ songs: [] });
  const [audioStarted, setAudioStarted] = useState(false);
  const [camCoords, setCamCoords] = useState({ x: 0, y: 0, z: 0, rotX: 0, rotY: 0 });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const notesRef = useRef<{ m: BABYLON.Mesh; p: number; hit: boolean; durSec: number; onTime: number; radius: number; angle: number }[]>([]);
  const rootRef = useRef<BABYLON.TransformNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying && startTimeRef.current === 0) startTimeRef.current = performance.now();
  }, [isPlaying]);

  const pianoFrequencies = Array.from({length: 128}, (_, i) => 440 * Math.pow(2, (i - 69) / 12));

  const startAudio = async () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    const ctx = audioContextRef.current!;
    if (ctx.state === 'suspended') await ctx.resume();
    setAudioStarted(true); setIsPlaying(true);
    startTimeRef.current = performance.now();
    loadSong(songIndex, manifest);
  };

  const playPiano = (pitch: number, dur: number) => {
    if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
    }
    const ctx = audioContextRef.current!;
    if (ctx.state === 'suspended') ctx.resume();
    const freq = pianoFrequencies[pitch];
    const time = ctx.currentTime;
    const f = ctx.createOscillator(), h = ctx.createOscillator(), g = ctx.createGain();
    f.type = "triangle"; f.frequency.value = freq;
    h.type = "sine"; h.frequency.value = freq * 2;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.5, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.3, time + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur + 1.2);
    f.connect(g); h.connect(g); g.connect(ctx.destination);
    console.log("OSCILLATOR START:", freq, "Hz at", time);
    f.start(); f.stop(time + dur + 1.2);
    h.start(); h.stop(time + dur + 1.2);
  };

  const loadSong = async (idx: number, data: any) => {
    if(!rootRef.current || !data.songs[idx]) return;
    notesRef.current.forEach(n => n.m.dispose());
    const song = data.songs[idx];
    let currentScore;
    if(song.isAI) currentScore = generateAI(60);
    else { const res = await fetch(`/${song.file}`); currentScore = await res.json(); }

    const nMat = new BABYLON.StandardMaterial("nm", rootRef.current.getScene());
    nMat.emissiveColor = new BABYLON.Color3(0.0, 1.0, 0.5); 
    nMat.disableLighting = true; nMat.alpha = 1.0; 

    // Create a base mesh to use for instances to save 1.2GB of memory
    const baseMesh = BABYLON.MeshBuilder.CreateLathe(`baseNote`, {
        shape: [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(10, 0.01, 0), new BABYLON.Vector3(0, 100, 0)],
        tessellation: 4
    }, rootRef.current!.getScene());
    baseMesh.material = nMat;
    baseMesh.isVisible = false; // Hide the template

    notesRef.current = currentScore.map((d: any) => {
        const pitch = d.note.pitch;
        const dur = Math.max(d.note.offTime - d.note.onTime, 0.1);
        const angle = Math.random() * Math.PI * 2;
        const radius = 4000 + Math.random() * 2000;
        
        // Use InstancedMesh instead of cloning full mesh data
        const n = baseMesh.createInstance(`n_${pitch}_${d.note.onTime}`);
        n.scaling.y = (dur * 50) / 100; // Scale the base mesh height (100) to match duration
        n.parent = rootRef.current;
        n.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 1000);
        return { m: n, p: pitch, hit: false, durSec: dur, onTime: d.note.onTime, radius, angle };
    });
    startTimeRef.current = performance.now(); setIsPlaying(true);
  };

  useEffect(() => {
    fetch('/manifest.json').then(r => r.json()).then(data => setManifest(data));
    if (!canvasRef.current) return;
    const engine = new BABYLON.Engine(canvasRef.current, true, { antialias: true });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
    const root = new BABYLON.TransformNode("root", scene);
    rootRef.current = root;
    const throatRadius = 24;

    const camera = new BABYLON.FreeCamera("flyCamera", new BABYLON.Vector3(0, 0, 4000), scene);
    camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    camera.attachControl(canvasRef.current, true);
    camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
    camera.keysUpward = [69]; camera.keysDownward = [81];
    camera.speed = 20.0; camera.angularSensibility = 1000;

    const bridgeMat = new BABYLON.StandardMaterial("bm", scene);
    bridgeMat.emissiveColor = new BABYLON.Color3(0, 0.8, 0.1);
    bridgeMat.alpha = 1.0; bridgeMat.wireframe = true;
    bridgeMat.backFaceCulling = false;

    const points = [];
    const sheetExtent = 10000;
    // Tapered Funnel: Hyperbolic-like curve for smooth transition
    // h goes from 0 (rim) to -1000 (throat) to follow the inward flow
    for(let i=0; i<=150; i++) {
        const t = i / 150;
        const r = throatRadius + (sheetExtent - throatRadius) * t;
        // h starts at 0 for large r, and goes down to -1000 for small r
        const h = -1000 * (1 / (1 + (r - throatRadius)/100));
        points.push(new BABYLON.Vector3(r, h, 0));
    }
    // TUBE: extend from throat Z=-1000 to Z=-20000
    const tunnelDepth = 20000;
    for(let i=1; i<=100; i++) {
        points.unshift(new BABYLON.Vector3(throatRadius, -1000 - i * (tunnelDepth/100), 0));
    }

    const wormhole = BABYLON.MeshBuilder.CreateLathe("wormhole", {
        shape: points, tessellation: 128, sideOrientation: BABYLON.Mesh.DOUBLESIDE
    }, scene);
    wormhole.rotation.x = Math.PI / 2; wormhole.material = bridgeMat;

    engine.runRenderLoop(() => {
        if (camera) {
            setCamCoords({
                x: Math.round(camera.position.x), y: Math.round(camera.position.y), z: Math.round(camera.position.z),
                rotX: Number(camera.rotation.x.toFixed(2)), rotY: Number(camera.rotation.y.toFixed(2))
            });
        }
        if (!isPlayingRef.current || !notesRef.current || startTimeRef.current === 0) { scene.render(); return; }
        const time = (performance.now() - startTimeRef.current) / 1000;
        bridgeMat.emissiveColor = new BABYLON.Color3(0, 0.4 + Math.sin(time * 5) * 0.2, 0.1);

        notesRef.current.forEach(note => {
            const mesh = note.m; if (!mesh) return;
            const currentR = note.radius - (time - note.onTime) * 450;
            
            if (currentR > throatRadius) {
                const h = -1000 * (1 / (1 + (currentR - throatRadius)/100));
                mesh.position.set(Math.cos(note.angle) * currentR, Math.sin(note.angle) * currentR, h);
                mesh.lookAt(new BABYLON.Vector3(0, 0, -1000));
            } else {
                const tunnelZ = -1000 + (currentR - throatRadius); 
                mesh.position.set(Math.cos(note.angle) * throatRadius, Math.sin(note.angle) * throatRadius, tunnelZ);
                mesh.lookAt(new BABYLON.Vector3(0, 0, tunnelZ - 100));
                if (!note.hit && (currentR <= throatRadius)) {
                    note.hit = true;
                    // For instances, we can't change individual material properties easily without specialized shaders, 
                    // so we use overlay color or similar if needed, or just rely on the sound trigger.
                    // (mesh.material as BABYLON.StandardMaterial).emissiveColor = new BABYLON.Color3(1, 1, 1);
                    console.log("TRIGGER SOUND: Pitch", note.p);
                    playPiano(note.p, note.durSec);
                }
            }
        });
        scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') { e.preventDefault(); setIsPlaying(p => !p); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => { 
        engine.dispose(); 
        window.removeEventListener("resize", handleResize); 
        window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden font-mono select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block outline-none z-0" />
      
      <div className="absolute top-10 left-10 z-[300] flex flex-col gap-4 pointer-events-none">
        <div className="text-3xl font-black tracking-[10px] text-[#0f0] uppercase [text-shadow:0_0_20px_#0f0] bg-black/40 p-2 border border-[#0f0]/30">
          SCORE: {manifest.songs[songIndex]?.title}
        </div>
        <div className="text-sm font-bold tracking-[4px] text-[#0f0] bg-black/60 p-4 border border-[#0f0]/40">
            TELEMETRY: [ POS: {camCoords.x}, {camCoords.y}, {camCoords.z} ] [ ROT: {camCoords.rotX}, {camCoords.rotY} ]
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-12 bg-black/90 p-10 border-4 border-[#0f0] [box-shadow:0_0_40px_rgba(0,255,0,0.4)] pointer-events-auto">
        <button onClick={() => { const idx=(songIndex-1+manifest.songs.length)%manifest.songs.length; setSongIndex(idx); loadSong(idx, manifest); }} className="text-[#0f0] hover:scale-150 transition-all text-5xl">⏮</button>
        <button onClick={() => setIsPlaying(!isPlaying)} className="text-[#0f0] hover:scale-150 transition-all text-7xl">{isPlaying ? "⏸" : "▶"}</button>
        <button onClick={() => { setIsPlaying(false); startTimeRef.current = 0; }} className="text-[#0f0] hover:scale-150 transition-all text-6xl">⏹</button>
        <button onClick={() => { const idx=(songIndex+1)%manifest.songs.length; setSongIndex(idx); loadSong(idx, manifest); }} className="text-[#0f0] hover:scale-150 transition-all text-5xl">⏭</button>
      </div>

      <div className="absolute top-10 right-10 z-[300] pointer-events-auto">
        <select className="bg-black border-4 border-[#0f0] text-[#0f0] p-6 text-2xl font-black outline-none cursor-pointer hover:bg-[#0f0] hover:text-black transition-all appearance-none uppercase" value={songIndex} onChange={(e) => { const idx = parseInt(e.target.value); setSongIndex(idx); loadSong(idx, manifest); }}>
          {manifest.songs.map((s: any, i: number) => (<option key={i} value={i} className="bg-black text-[#0f0]">{s.composer}: {s.title.toUpperCase()}</option>))}
        </select>
      </div>

      {!audioStarted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[500] bg-black cursor-pointer border-[40px] border-[#0f0]" onClick={startAudio}>
          <div className="animate-pulse flex flex-col items-center">
            <h1 className="text-white tracking-[30px] text-8xl mb-20 text-center uppercase font-black [text-shadow:0_0_50px_#0f0]">[ SINGULARITY_ACTIVATE ]</h1>
            <div className="text-[#0f0] text-3xl tracking-[12px] text-center font-black uppercase underline decoration-4 underline-offset-8">CLICK TO DESCEND</div>
            <div className="text-[#0f0] mt-24 opacity-100 text-xl tracking-[8px] font-black bg-black/80 p-8 border-2 border-[#0f0]">WASD: CONDUCT FLIGHT | MOUSE: ROTATE CAMERA | SPACE: PLAY</div>
          </div>
        </div>
      )}
    </main>
  );
}
