"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Words3DProps {
  revealed: (string | null)[];
  wordLength: number;
  wrongGuesses: number;
  maxWrong: number;
  phase: string;
  shaking: boolean;
}

const MAGIC_PURPLE = 0x9945FF;
const NEON_GREEN = 0x14F195;

/**
 * Background-only 3D scene for Blockwords.
 * Purple nebula + floating particles + magic aura.
 * Does NOT render tiles or letters — those are in the 2D UI overlay.
 * Same vibe as Magic Chess background.
 */
export default function Words3DScene({ wrongGuesses, maxWrong, phase, shaking }: Words3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let time = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x08000f, 0.008);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 2, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Ambient light
    scene.add(new THREE.AmbientLight(0x1a0833, 0.5));

    // Colored point lights that drift
    const purpleLight = new THREE.PointLight(MAGIC_PURPLE, 3, 30);
    purpleLight.position.set(-4, 5, 2);
    scene.add(purpleLight);

    const greenLight = new THREE.PointLight(NEON_GREEN, 2, 25);
    greenLight.position.set(4, 3, -2);
    scene.add(greenLight);

    const deepLight = new THREE.PointLight(0x4422cc, 2, 30);
    deepLight.position.set(0, -2, -5);
    scene.add(deepLight);

    // Wrong guess light — gets redder as you lose lives
    const dangerLight = new THREE.PointLight(0xff1744, 0, 15);
    dangerLight.position.set(0, 4, 3);
    scene.add(dangerLight);

    // Nebula clouds — large translucent planes at different depths
    const nebulaGeo = new THREE.PlaneGeometry(40, 40);
    const nebulae: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const hue = 0.72 + i * 0.03;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 0.7, 0.06 + i * 0.01),
        transparent: true,
        opacity: 0.12 - i * 0.015,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(nebulaGeo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 10 + 2,
        -8 - i * 4
      );
      mesh.rotation.set(
        Math.random() * 0.4 - 0.2,
        Math.random() * 0.4 - 0.2,
        Math.random() * Math.PI
      );
      mesh.userData = {
        rotSpeed: { x: (Math.random() - 0.5) * 0.0003, y: (Math.random() - 0.5) * 0.0003, z: (Math.random() - 0.5) * 0.0002 },
        baseY: mesh.position.y,
      };
      scene.add(mesh);
      nebulae.push(mesh);
    }

    // Sparkle particles — lots of tiny floating lights
    const particleCount = 600;
    const pPos = new Float32Array(particleCount * 3);
    const pCol = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 40;
      pPos[i * 3 + 1] = Math.random() * 20 - 5;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 5;
      // Mix of purple and green sparkles
      const isPurple = Math.random() > 0.3;
      const c = isPurple
        ? new THREE.Color().setHSL(0.75 + Math.random() * 0.08, 0.9, 0.5 + Math.random() * 0.4)
        : new THREE.Color().setHSL(0.42 + Math.random() * 0.05, 0.9, 0.5 + Math.random() * 0.4);
      pCol[i * 3] = c.r;
      pCol[i * 3 + 1] = c.g;
      pCol[i * 3 + 2] = c.b;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    }));
    scene.add(particles);

    // Ember columns — rising magical embers at the edges
    const emberCount = 150;
    for (let col = 0; col < 4; col++) {
      const angle = (col / 4) * Math.PI * 2;
      const dist = 8 + Math.random() * 4;
      const ePos = new Float32Array(emberCount * 3);
      const eCol = new Float32Array(emberCount * 3);
      for (let i = 0; i < emberCount; i++) {
        ePos[i * 3] = Math.cos(angle) * dist + (Math.random() - 0.5) * 2;
        ePos[i * 3 + 1] = Math.random() * 15 - 3;
        ePos[i * 3 + 2] = Math.sin(angle) * dist + (Math.random() - 0.5) * 2;
        const c = new THREE.Color().setHSL(0.75 + Math.random() * 0.1, 0.9, 0.4 + Math.random() * 0.4);
        eCol[i * 3] = c.r; eCol[i * 3 + 1] = c.g; eCol[i * 3 + 2] = c.b;
      }
      const eGeo = new THREE.BufferGeometry();
      eGeo.setAttribute("position", new THREE.BufferAttribute(ePos, 3));
      eGeo.setAttribute("color", new THREE.BufferAttribute(eCol, 3));
      const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      }));
      embers.userData = { baseAngle: angle, dist };
      scene.add(embers);
    }

    // Animation
    const shakingRef = { current: shaking };
    const wrongRef = { current: wrongGuesses };
    const phaseRef = { current: phase };

    const animate = () => {
      if (disposed) return;
      requestAnimationFrame(animate);
      time += 0.016;

      // Nebula drift
      nebulae.forEach(n => {
        n.rotation.x += n.userData.rotSpeed.x;
        n.rotation.y += n.userData.rotSpeed.y;
        n.rotation.z += n.userData.rotSpeed.z;
        n.position.y = n.userData.baseY + Math.sin(time * 0.2 + n.position.x * 0.1) * 0.5;
      });

      // Particle drift upward
      const pp = particles.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < pp.length; i += 3) {
        pp[i + 1] += 0.005 + Math.sin(time + i) * 0.002;
        pp[i] += Math.sin(time * 0.3 + i * 0.5) * 0.002;
        if (pp[i + 1] > 15) {
          pp[i + 1] = -5;
          pp[i] = (Math.random() - 0.5) * 40;
          pp[i + 2] = (Math.random() - 0.5) * 30 - 5;
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;

      // Ember rise
      scene.children.forEach(child => {
        if (child.userData?.baseAngle !== undefined && child instanceof THREE.Points) {
          const ep = child.geometry.attributes.position.array as Float32Array;
          for (let i = 0; i < ep.length; i += 3) {
            ep[i + 1] += 0.02 + Math.random() * 0.01;
            if (ep[i + 1] > 12) {
              ep[i + 1] = -3 + Math.random();
              ep[i] = Math.cos(child.userData.baseAngle) * child.userData.dist + (Math.random() - 0.5) * 2;
              ep[i + 2] = Math.sin(child.userData.baseAngle) * child.userData.dist + (Math.random() - 0.5) * 2;
            }
          }
          child.geometry.attributes.position.needsUpdate = true;
        }
      });

      // Light animation
      purpleLight.intensity = 2.5 + Math.sin(time * 1.2) * 1;
      purpleLight.position.x = -4 + Math.sin(time * 0.4) * 3;
      greenLight.intensity = 1.5 + Math.sin(time * 0.8 + 1) * 0.8;
      greenLight.position.x = 4 + Math.cos(time * 0.3) * 2;

      // Danger light — increases with wrong guesses
      const dangerLevel = wrongRef.current / 6;
      dangerLight.intensity = dangerLevel * 4;

      // Win glow
      if (phaseRef.current === "won") {
        greenLight.intensity = 4 + Math.sin(time * 3) * 2;
      }

      // Camera shake
      if (shakingRef.current) {
        camera.position.x = (Math.random() - 0.5) * 0.15;
        camera.position.y = 2 + (Math.random() - 0.5) * 0.15;
      } else {
        camera.position.x += (0 - camera.position.x) * 0.05;
        camera.position.y += (2 - camera.position.y) * 0.05;
      }

      // Gentle camera sway
      camera.position.x += Math.sin(time * 0.15) * 0.003;
      camera.position.y += Math.sin(time * 0.2) * 0.002;

      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Update refs for animation access
    const interval = setInterval(() => {
      shakingRef.current = shaking;
      wrongRef.current = wrongGuesses;
      phaseRef.current = phase;
    }, 50);

    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener("resize", onResize);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // Update refs without re-creating scene
  useEffect(() => {
    // Handled by interval in the main effect
  }, [wrongGuesses, shaking, phase]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />
  );
}
