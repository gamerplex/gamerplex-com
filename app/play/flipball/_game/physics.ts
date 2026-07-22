import RAPIER from '@dimforge/rapier3d-compat';

export const BALL_RADIUS = 0.4;

// v0.2.36: arcade-tuned, not sim. Real-cabinet physics (gravity ~18, ~9.81 m/s²
// real) feels slow on a 6-inch mobile screen because the ball covers fewer
// pixels per second. Mobile-arcade leaders (Pinball Deluxe 50M+ DLs, Pinball
// Arcade mobile) all use ~1.5× real gravity. Lifting 18 → 28 ≈ 1.55×.
const TILT_RAD = 6.5 * (Math.PI / 180);
const GRAVITY_MAG = 28;

export interface PhysicsHandles {
  world: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
  step: () => void;
}

export async function createPhysics(): Promise<PhysicsHandles> {
  await RAPIER.init();

  const gravity = {
    x: 0,
    y: -GRAVITY_MAG * Math.cos(TILT_RAD),
    z: GRAVITY_MAG * Math.sin(TILT_RAD),
  };
  const world = new RAPIER.World(gravity);
  world.integrationParameters.dt = 1 / 120;

  const eventQueue = new RAPIER.EventQueue(true);

  const step = () => world.step(eventQueue);

  return { world, eventQueue, step };
}

export function createBall(world: RAPIER.World): RAPIER.RigidBody {
  // v0.2.5 ball tuning — fixed the "ball drops slow then picks up" feel.
  // Root cause was friction 0.05 + damping 0.15/0.5 = ball was in molasses.
  // Industry-standard pinball ball:
  //   - 27mm diameter, 80g steel (density 7.8 g/cm³)
  //   - Linear damping near-zero (0.001-0.005) — steel ball doesn't air-drag
  //   - Angular damping 0.1-0.2 — spin decays faster than translation
  //   - Friction 0.002-0.0025 against playfield (very low — rolls freely)
  //   - Restitution 0.85 — quite bouncy off bumpers/slingshots
  //   - Density 5+ — heavy enough that flipper hits feel weighty
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 5, 0)
    .setCcdEnabled(true)
    .setLinearDamping(0.003)
    .setAngularDamping(0.15);
  const body = world.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
    .setRestitution(0.9)
    .setFriction(0.003)
    .setDensity(7.8)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  world.createCollider(colliderDesc, body);

  return body;
}
