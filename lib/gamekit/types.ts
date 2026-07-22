// The game lifecycle convention shared by VRFC and Time Gate. This is a
// CONVENTION, not a runtime/framework — a game class implements it so tooling,
// the arcade-shell wrapper, and future authors have one predictable shape.
//
// Convention (constructors can't be typed by an interface, so it's documented):
//   new Game(seed: number, onState: (s) => void, onEvent: (e) => void)
//     - seed: from `seedFrom(runSeed)` or `seedFromBytes(session.seed)`
//     - onState: called with a fresh HUD/state snapshot each tick (drives React)
//     - onEvent: called with discrete gameplay events (for sfx/haptics/juice)
//   then: await game.start(canvas)   // build scene, bind input, run the RAF loop
//   on unmount: game.dispose()       // stop the loop, remove listeners, free GPU

export interface GameSim {
  /** Build the scene, bind input, and start the RAF loop against this canvas. */
  start(canvas: HTMLCanvasElement): void | Promise<void>;
  /** Stop the loop, remove listeners, and dispose all GPU resources. Idempotent. */
  dispose(): void;
}

/** The constructor shape a GameSim class should expose (documentation/tooling aid). */
export type GameSimCtor<S = unknown, E = string> = new (
  seed: number,
  onState: (state: S) => void,
  onEvent: (event: E) => void,
) => GameSim;
