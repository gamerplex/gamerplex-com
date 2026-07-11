import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createScene } from './scene';
import { createPhysics, createBall, BALL_RADIUS } from './physics';
import { TABLE_W, TABLE_D } from './table';
import { buildOuterWalls } from './walls';
import { buildBumpers, type BumperHandle } from './bumpers';
import { buildSlingshots, type SlingshotHandle } from './slingshots';
import { buildFlippers } from './flippers';
import { buildDropTargets, updateDropTargets, hitDropTarget, type DropTargetHandle } from './drop-targets';
import { sfx, unlockAudio } from './audio';
import { buildPlungerLane, updatePistonVisual, chargeImpulse, PLUNGER_SPAWN, PLUNGER_MAX_CHARGE_MS } from './plunger';
import { makeHandleHit, type ScoreState } from './collisions';
import { rememberRest, tickShake, triggerShake } from './camera-shake';
import { buildKickback, fireKickback, rearmKickback, tickKickback, KICKBACK_IMPULSE } from './kickback';
import { buildScoop, catchBall, tickScoop } from './scoop';
import { buildBackground, tickBackground } from './background';
import { startOrbit, returnToRest, tickCameraTour } from './camera-tour';
import { buildOneWayGate, tickOneWayGate } from './one-way-gate';
import { buildPlungerArrow, tickPlungerArrow } from './plunger-arrow';

const HI_STORAGE_KEY = 'flipball:hiscore:v1';
const BALLS_PER_GAME = 3;
const DRAIN_Z = TABLE_D / 2 + 2;
const STUCK_VELOCITY_THRESHOLD = 0.6;
const STUCK_DURATION_MS = 1500;
const STUCK_NUDGE_IMPULSE = { x: 0, y: 0.5, z: 4.0 };

interface Selectors {
  mountSelector: string;
  scoreSelector: string;
  hiSelector: string;
  ballsSelector: string;
  comboSelector?: string;
  playButtonSelector: string;
  mobileLeftSelector?: string;
  mobileRightSelector?: string;
  mobilePlungerSelector?: string;
}

export async function startFlipball(sel: Selectors): Promise<() => void> {
  const mount = document.querySelector<HTMLElement>(sel.mountSelector);
  const scoreEl = document.querySelector<HTMLElement>(sel.scoreSelector);
  const hiEl = document.querySelector<HTMLElement>(sel.hiSelector);
  const ballsEl = document.querySelector<HTMLElement>(sel.ballsSelector);
  const comboEl = sel.comboSelector ? document.querySelector<HTMLElement>(sel.comboSelector) : null;
  const playBtn = document.querySelector<HTMLButtonElement>(sel.playButtonSelector);

  if (!mount || !scoreEl || !hiEl || !ballsEl || !playBtn) {
    console.error('[flipball] missing DOM nodes', sel);
    return () => {};
  }

  const handles = createScene(mount);
  rememberRest(handles.camera);
  startOrbit(handles.camera);
  const background = buildBackground(handles.scene);
  const fit = () => handles.resize(mount.clientWidth, mount.clientHeight);
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(mount);

  const phys = await createPhysics();

  const floorBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0);
  const floorBody = phys.world.createRigidBody(floorBodyDesc);
  const floorColDesc = RAPIER.ColliderDesc.cuboid(TABLE_W / 2 + 0.5, 0.05, TABLE_D / 2 + 0.5)
    .setRestitution(0.1)
    .setFriction(0.05);
  phys.world.createCollider(floorColDesc, floorBody);

  buildOuterWalls(phys.world, handles.scene);
  const bumpers: BumperHandle[] = buildBumpers(phys.world, handles.scene);
  const slingshots: SlingshotHandle[] = buildSlingshots(phys.world, handles.scene);
  const flippers = buildFlippers(phys.world, handles.scene);

  const dropTargets: DropTargetHandle[] = buildDropTargets(phys.world, handles.scene);
  const dropByHandle = new Map<number, DropTargetHandle>();
  for (const d of dropTargets) dropByHandle.set(d.collider.handle, d);

  const kickback = buildKickback(phys.world, handles.scene);
  const kickbackHandle = kickback.collider.handle;

  const scoop = buildScoop(phys.world, handles.scene);
  const scoopHandle = scoop.collider.handle;

  const piston = buildPlungerLane(phys.world, handles.scene);
  const oneWayGate = buildOneWayGate(handles.scene);
  const plungerArrow = buildPlungerArrow(handles.scene);
  let plungerChargingStart = 0;
  let plungerReleasedAt = -1000;

  const bumperByHandle = new Map<number, BumperHandle>();
  for (const b of bumpers) bumperByHandle.set(b.collider.handle, b);
  const slingByHandle = new Map<number, SlingshotHandle>();
  for (const s of slingshots) slingByHandle.set(s.collider.handle, s);

  const ballBody = createBall(phys.world);
  // E2E hook: ball lane-Z, so tests can assert a light plunge clears the lane.
  (window as unknown as { __flipballBallZ?: () => number }).__flipballBallZ = () => ballBody.translation().z;
  let ballColliderHandle = -1;
  for (let i = 0; i < ballBody.numColliders(); i++) {
    ballColliderHandle = ballBody.collider(i).handle;
  }

  const ballGeom = new THREE.SphereGeometry(BALL_RADIUS, 32, 24);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.15,
    metalness: 0.95,
    emissive: 0xffffff,
    emissiveIntensity: 0.05,
  });
  const ballMesh = new THREE.Mesh(ballGeom, ballMat);
  ballMesh.castShadow = true;
  ballMesh.visible = false;
  handles.scene.add(ballMesh);

  const TRAIL_LEN = 14;
  const trailPositions = new Float32Array(TRAIL_LEN * 3);
  const trailGeom = new THREE.BufferGeometry();
  trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeom.setDrawRange(0, 0);
  const trailMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const trail = new THREE.Line(trailGeom, trailMat);
  trail.visible = false;
  handles.scene.add(trail);
  let trailCount = 0;

  const scoreState: ScoreState = { score: 0, comboCount: 0, comboTimer: 0 };
  let hi = Number(localStorage.getItem(HI_STORAGE_KEY) ?? '0');
  if (!Number.isFinite(hi) || hi < 0) hi = 0;
  let ballsLeft = BALLS_PER_GAME;
  let ballInPlay = false;
  let state: 'ready' | 'playing' | 'paused' | 'gameover' = 'ready';
  let stuckSince = 0;
  let lastNudgeAt = 0;

  const renderHud = () => {
    scoreEl.textContent = scoreState.score.toLocaleString();
    hiEl.textContent = hi.toLocaleString();
    ballsEl.textContent = '●'.repeat(Math.max(0, ballsLeft));
    if (comboEl) {
      if (scoreState.comboCount > 1) {
        comboEl.textContent = `×${scoreState.comboCount}`;
        comboEl.classList.add('active');
      } else {
        comboEl.classList.remove('active');
      }
    }
  };
  renderHud();

  const handleHit = makeHandleHit({
    ballBody, bumperByHandle, slingByHandle, dropByHandle,
    dropTargets, bumpers, state: scoreState, renderHud,
  });

  const spawnBall = () => {
    ballBody.setTranslation(PLUNGER_SPAWN, true);
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ballMesh.visible = true;
    ballInPlay = true;
    stuckSince = 0;
    lastNudgeAt = 0;
    rearmKickback(kickback);
  };

  const ballInPlungerZone = () => {
    const p = ballBody.translation();
    return Math.abs(p.x - PLUNGER_SPAWN.x) < 0.8 && p.z > TABLE_D / 2 - 3;
  };
  const launchBall = (chargeMs: number, ts: number) => {
    ballBody.applyImpulse(chargeImpulse(chargeMs), true);
    sfx.slingshot();
    plungerReleasedAt = ts;
    if (chargeMs >= PLUNGER_MAX_CHARGE_MS * 0.9) {
      scoreState.score += 2500;
      sfx.bankClear();
      triggerShake(0.18, 200, ts);
      renderHud();
    }
  };

  const startGame = () => {
    returnToRest(handles.camera, performance.now());
    sfx.start();
    document.querySelector<HTMLElement>('#splash')?.classList.remove('splash-shown');
    scoreState.score = 0;
    scoreState.comboCount = 0;
    scoreState.comboTimer = 0;
    ballsLeft = BALLS_PER_GAME;
    ballsUsedThisGame = 0;
    crypto.getRandomValues(currentSessionSeed);
    state = 'playing';
    for (const b of bumpers) b.lastHitAt = 0;
    for (const s of slingshots) s.lastHitAt = 0;
    renderHud();
    spawnBall();
    playBtn.textContent = '↻ RESTART';
    window.dispatchEvent(new CustomEvent('flipball:gamestart'));
  };

  const sessionStartedAt = Date.now();
  const currentSessionSeed = new Uint8Array(32);
  crypto.getRandomValues(currentSessionSeed);
  let ballsUsedThisGame = 0;

  const loseBall = () => {
    sfx.ballLost();
    ballInPlay = false;
    ballMesh.visible = false;
    trail.visible = false;
    trailCount = 0;
    scoreState.comboCount = 0;
    scoreState.comboTimer = 0;
    ballsLeft = Math.max(0, ballsLeft - 1);
    ballsUsedThisGame++;
    renderHud();
    if (ballsLeft <= 0) {
      state = 'gameover';
      if (scoreState.score > hi) {
        hi = scoreState.score;
        localStorage.setItem(HI_STORAGE_KEY, String(hi));
        renderHud();
      }
      playBtn.textContent = '▶ PLAY AGAIN';
      const durationSec = Math.max(1, Math.floor((Date.now() - sessionStartedAt) / 1000));
      const runId = Array.from(currentSessionSeed.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join('');
      window.dispatchEvent(new CustomEvent('flipball:gameover', {
        detail: {
          score: scoreState.score,
          ballsUsed: ballsUsedThisGame,
          durationSec,
          sessionSeed: Array.from(currentSessionSeed),
        },
      }));
      // Bridge the score to the Gamerplex Arcade Shell when embedded as an
      // iframe (gamerplex.com/play/flipball) — the shell owns the free web2
      // leaderboard save + login, so flipball needs no wallet to be ranked.
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            { type: 'flipball:gameover', score: scoreState.score, durationSec, runId },
            '*',
          );
        }
      } catch { /* not embedded */ }
      setTimeout(() => {
        if (state === 'gameover') {
          startOrbit(handles.camera);
          document.querySelector<HTMLElement>('#splash')?.classList.add('splash-shown');
        }
      }, 2000);
    } else {
      setTimeout(() => {
        if (state === 'playing') spawnBall();
      }, 700);
    }
  };

  playBtn.addEventListener('click', () => { unlockAudio(); startGame(); });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft') {
      flippers.setLeftActive(true);
      e.preventDefault();
    } else if (e.code === 'ArrowRight') {
      flippers.setRightActive(true);
      e.preventDefault();
    } else if (e.code === 'Space') {
      if (e.repeat) { e.preventDefault(); return; }
      if (state === 'ready' || state === 'gameover') startGame();
      else if (state === 'playing' && !ballInPlay) spawnBall();
      else if (state === 'playing' && ballInPlay && ballInPlungerZone()) {
        plungerChargingStart = performance.now();
      }
      e.preventDefault();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'playing') {
        state = 'paused';
        document.querySelector<HTMLElement>('#pause-overlay')?.classList.add('shown');
      } else if (state === 'paused') {
        state = 'playing';
        document.querySelector<HTMLElement>('#pause-overlay')?.classList.remove('shown');
      }
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft') flippers.setLeftActive(false);
    else if (e.code === 'ArrowRight') flippers.setRightActive(false);
    else if (e.code === 'Space' && plungerChargingStart > 0) {
      const now = performance.now();
      const chargeMs = now - plungerChargingStart;
      plungerChargingStart = 0;
      if (state === 'playing' && ballInPlay && ballInPlungerZone()) launchBall(chargeMs, now);
    }
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const onTouch = (e: TouchEvent, down: boolean) => {
    e.preventDefault();
    const rect = mount.getBoundingClientRect();
    let bottomTap = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (!t) continue;
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      const bottomZone = y > rect.height * 0.78;
      if (bottomZone) { bottomTap = true; continue; }
      if (x < rect.width / 2) flippers.setLeftActive(down);
      else flippers.setRightActive(down);
    }
    if (down && (state === 'ready' || state === 'gameover')) { startGame(); return; }
    if (down && state === 'playing' && bottomTap) {
      if (!ballInPlay) spawnBall();
      else if (ballInPlungerZone() && plungerChargingStart === 0) plungerChargingStart = performance.now();
    }
    if (!down && bottomTap && plungerChargingStart > 0) {
      const now = performance.now();
      const chargeMs = now - plungerChargingStart;
      plungerChargingStart = 0;
      if (state === 'playing' && ballInPlay && ballInPlungerZone()) launchBall(chargeMs, now);
    }
  };
  const onTouchStart = (e: TouchEvent) => onTouch(e, true);
  const onTouchEnd = (e: TouchEvent) => onTouch(e, false);
  mount.addEventListener('touchstart', onTouchStart, { passive: false });
  mount.addEventListener('touchend', onTouchEnd, { passive: false });
  mount.addEventListener('touchcancel', onTouchEnd, { passive: false });

  const mcLeft = sel.mobileLeftSelector ? document.querySelector<HTMLButtonElement>(sel.mobileLeftSelector) : null;
  const mcRight = sel.mobileRightSelector ? document.querySelector<HTMLButtonElement>(sel.mobileRightSelector) : null;
  const mcPlunger = sel.mobilePlungerSelector ? document.querySelector<HTMLButtonElement>(sel.mobilePlungerSelector) : null;

  const wireFlipperBtn = (btn: HTMLButtonElement | null, setActive: (a: boolean) => void) => {
    if (!btn) return;
    const press = (e: Event) => {
      e.preventDefault();
      unlockAudio();
      if (state === 'ready' || state === 'gameover') { startGame(); return; }
      if (state !== 'playing') return;
      setActive(true);
      btn.classList.add('active');
    };
    const release = (e: Event) => {
      e.preventDefault();
      setActive(false);
      btn.classList.remove('active');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  };
  wireFlipperBtn(mcLeft, flippers.setLeftActive);
  wireFlipperBtn(mcRight, flippers.setRightActive);

  if (mcPlunger) {
    const press = (e: Event) => {
      e.preventDefault();
      unlockAudio();
      if (state === 'ready' || state === 'gameover') { startGame(); return; }
      if (state !== 'playing') return;
      if (!ballInPlay) { spawnBall(); return; }
      if (ballInPlungerZone() && plungerChargingStart === 0) {
        plungerChargingStart = performance.now();
        mcPlunger.classList.add('active');
      }
    };
    const release = (e: Event) => {
      e.preventDefault();
      mcPlunger.classList.remove('active');
      if (plungerChargingStart > 0) {
        const now = performance.now();
        const chargeMs = now - plungerChargingStart;
        plungerChargingStart = 0;
        if (state === 'playing' && ballInPlay && ballInPlungerZone()) launchBall(chargeMs, now);
      }
    };
    mcPlunger.addEventListener('pointerdown', press);
    mcPlunger.addEventListener('pointerup', release);
    mcPlunger.addEventListener('pointercancel', release);
    mcPlunger.addEventListener('pointerleave', release);
  }

  let raf = 0;
  let lastTs = 0;
  let mounted = true;

  const step = (ts: number) => {
    if (!mounted) return;
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 1 / 30) : 1 / 60;
    lastTs = ts;

    if (state !== 'paused') flippers.update(dt);
    updateDropTargets(dropTargets, ts);
    tickKickback(kickback, ts);
    if (state !== 'paused') {
      if (tickScoop(scoop, ts, ballBody)) { sfx.bankClear(); triggerShake(0.15, 120, ts); }
    }
    const charging = plungerChargingStart > 0;
    const chargeMs = charging ? ts - plungerChargingStart : 0;
    updatePistonVisual(piston, charging, chargeMs, plungerReleasedAt, ts);
    tickPlungerArrow(plungerArrow, ballBody, ts, state === 'playing' && ballInPlay && ballInPlungerZone(), charging);

    if (state === 'playing') {
      phys.step();
      if (ballInPlay) tickOneWayGate(oneWayGate, ballBody, ts);
    }
    if (state === 'playing') {
      // keep this block — collision processing depends on phys.step having run this frame

      phys.eventQueue.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const other = h1 === ballColliderHandle ? h2 : h2 === ballColliderHandle ? h1 : -1;
        if (other === -1) return;
        if (other === kickbackHandle) {
          if (fireKickback(kickback, ts)) {
            ballBody.applyImpulse(KICKBACK_IMPULSE, true);
            sfx.bumper();
            triggerShake(0.25, 220, ts);
          }
          return;
        }
        if (other === scoopHandle) {
          const pts = catchBall(scoop, ts, ballBody);
          if (pts > 0) {
            scoreState.score += pts;
            sfx.dropTarget();
            renderHud();
          }
          return;
        }
        handleHit(other, ts);
      });

      if (scoreState.comboTimer > 0) {
        scoreState.comboTimer -= dt * 1000;
        if (scoreState.comboTimer <= 0) {
          scoreState.comboCount = 0;
          scoreState.comboTimer = 0;
          renderHud();
        }
      }

      if (ballInPlay) {
        const pos = ballBody.translation();
        ballMesh.position.set(pos.x, pos.y, pos.z);
        const rot = ballBody.rotation();
        ballMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

        for (let i = TRAIL_LEN - 1; i > 0; i--) {
          trailPositions[i * 3]     = trailPositions[(i - 1) * 3];
          trailPositions[i * 3 + 1] = trailPositions[(i - 1) * 3 + 1];
          trailPositions[i * 3 + 2] = trailPositions[(i - 1) * 3 + 2];
        }
        trailPositions[0] = pos.x; trailPositions[1] = pos.y; trailPositions[2] = pos.z;
        trailCount = Math.min(trailCount + 1, TRAIL_LEN);
        trailGeom.setDrawRange(0, trailCount);
        trailGeom.attributes.position.needsUpdate = true;
        trail.visible = trailCount > 1;

        // v0.2.1 stuck-ball watchdog — escape dead pockets when player holds
        // a flipper up and the ball wedges with no gravity-downhill exit
        const lv = ballBody.linvel();
        const speed = Math.sqrt(lv.x * lv.x + lv.y * lv.y + lv.z * lv.z);
        if (speed < STUCK_VELOCITY_THRESHOLD && pos.y > -1) {
          if (stuckSince === 0) stuckSince = ts;
          else if (ts - stuckSince > STUCK_DURATION_MS && ts - lastNudgeAt > 600) {
            ballBody.applyImpulse(STUCK_NUDGE_IMPULSE, true);
            lastNudgeAt = ts;
            stuckSince = ts; // re-arm
          }
        } else {
          stuckSince = 0;
        }

        if (pos.z > DRAIN_Z || pos.y < -3) loseBall();
      }

      for (const b of bumpers) {
        const since = ts - b.lastHitAt;
        const flash = b.lastHitAt > 0 ? Math.max(0, 1 - since / 240) : 0;
        b.capMat.emissiveIntensity = 0.9 + flash * 1.8;
        b.ringMat.emissiveIntensity = 1.4 + flash * 2.2;
        b.light.intensity = 0.7 + flash * 2.0;
        const s = 1 + flash * 0.12;
        b.mesh.scale.set(s, s, s);
      }
      for (const s of slingshots) {
        const since = ts - s.lastHitAt;
        const flash = s.lastHitAt > 0 ? Math.max(0, 1 - since / 220) : 0;
        s.mat.emissiveIntensity = 0.55 + flash * 1.8;
      }
    }

    tickBackground(background, ts, dt);
    const touring = tickCameraTour(handles.camera, ts, dt);
    if (touring) rememberRest(handles.camera);
    else tickShake(handles.camera, ts);
    handles.renderer.render(handles.scene, handles.camera);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return () => {
    mounted = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    playBtn.removeEventListener('click', startGame);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    mount.removeEventListener('touchstart', onTouchStart);
    mount.removeEventListener('touchend', onTouchEnd);
    mount.removeEventListener('touchcancel', onTouchEnd);
    handles.dispose();
  };
}
