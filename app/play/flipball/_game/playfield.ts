import { TABLE_W } from './table';
import { PLUNGER_LANE_X, PLUNGER_LANE_W } from './plunger';

// Geometric center of the PLAYABLE area (left wall .. plunger inner wall),
// NOT the table center. The plunger lane on the right shrinks playfield
// to x = -7..+5.65, so the true center is at -0.675. All gameplay elements
// (flippers, bumpers, drops, slingshots, scoop) should derive from this
// — anything centered on table x=0 ends up visibly off-center.
// Kickback is the exception: it defends the LEFT outlane specifically.
export const PLAYFIELD_LEFT_X = -TABLE_W / 2;
export const PLAYFIELD_RIGHT_X = PLUNGER_LANE_X - PLUNGER_LANE_W / 2;
export const PLAYFIELD_CENTER_X = (PLAYFIELD_LEFT_X + PLAYFIELD_RIGHT_X) / 2;
