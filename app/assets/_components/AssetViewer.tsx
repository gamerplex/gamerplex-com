"use client";

import { useEffect, useRef } from "react";

export default function AssetViewer({ src }: { src: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (stop) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.01, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.2;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const draco = new DRACOLoader().setDecoderPath("/draco/"); // the publisher Draco-compresses meshes
      loader.setDRACOLoader(draco);
      el.dataset.state = "loading";
      loader.load(src, (gltf) => {
        if (stop) return;
        el.dataset.state = "loaded";
        const root = gltf.scene;
        scene.add(root);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3()).length();
        const centre = box.getCenter(new THREE.Vector3());
        controls.target.copy(centre);
        camera.position.copy(centre).add(new THREE.Vector3(0.75, 0.35, 0.9).normalize().multiplyScalar(size * 1.1));
        camera.near = size / 100;
        camera.far = size * 100;
        camera.updateProjectionMatrix();
      }, undefined, (err) => {
        if (stop) return;
        el.dataset.state = "error";
        console.error("asset viewer: could not load", src, err);
        const note = document.createElement("p");
        note.textContent = "3D preview unavailable";
        note.style.cssText = "position:absolute;inset:auto 0 12px 0;text-align:center;color:#9a92b5;font-size:13px";
        el.appendChild(note);
      });
      const onResize = () => {
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(el.clientWidth, el.clientHeight);
      };
      window.addEventListener("resize", onResize);
      const stopOnTouch = () => (controls.autoRotate = false);
      renderer.domElement.addEventListener("pointerdown", stopOnTouch);
      renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
      });
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        renderer.setAnimationLoop(null);
        renderer.dispose();
        pmrem.dispose();
        draco.dispose();
        el.removeChild(renderer.domElement);
      };
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, [src]);

  return <div ref={host} style={{ position: "relative", width: "100%", height: "100%", touchAction: "none" }} />;
}
