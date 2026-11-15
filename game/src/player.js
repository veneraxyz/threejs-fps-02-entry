// DUSTFALL — the player controller: acceleration-based movement with
// friction, crouch, jump and AABB collision. Movement is the sim's job;
// the renderer only reads the resulting position and angles.

import { PLAYER } from './config.js';
import { clamp, circleBoxResolve } from './utils.js';
import { WALLS, CRATES, MAP_BOUNDS } from './map.js';

const COLLIDERS = [...WALLS, ...CRATES];

export function eyeHeight(agent) {
  return agent.crouch ? PLAYER.eyeCrouch : PLAYER.eyeStand;
}

// One movement tick. wishX/wishZ is the desired direction in world space
// (already normalized, may be zero). `jump` is a one-shot request.
export function moveAgent(agent, wishX, wishZ, jump, dt) {
  const speed = agent.crouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
  const grounded = agent.y <= 0.001;
  const accel = grounded ? PLAYER.accel : PLAYER.airAccel;

  // Accelerate toward the wish velocity; friction pulls to a stop.
  const tx = wishX * speed;
  const tz = wishZ * speed;
  const k = 1 - Math.exp(-accel * dt);
  agent.vx += (tx - agent.vx) * k;
  agent.vz += (tz - agent.vz) * k;
  if (wishX === 0 && wishZ === 0 && grounded) {
    const f = Math.max(0, 1 - PLAYER.friction * dt);
    agent.vx *= f;
    agent.vz *= f;
  }

  if (jump && grounded) {
    agent.vy = PLAYER.jumpSpeed;
  }
  agent.vy -= PLAYER.gravity * dt;
  agent.y += agent.vy * dt;
  if (agent.y <= 0) {
    agent.y = 0;
    agent.vy = 0;
  }

  // Integrate X, resolve, then Z — per-axis resolution keeps the agent from
  // snagging on corners.
  agent.x += agent.vx * dt;
  for (const b of COLLIDERS) circleBoxResolve(agent, PLAYER.radius, b);
  agent.z += agent.vz * dt;
  for (const b of COLLIDERS) circleBoxResolve(agent, PLAYER.radius, b);

  agent.x = clamp(agent.x, MAP_BOUNDS.x0 + PLAYER.radius, MAP_BOUNDS.x1 - PLAYER.radius);
  agent.z = clamp(agent.z, MAP_BOUNDS.z0 + PLAYER.radius, MAP_BOUNDS.z1 - PLAYER.radius);
  agent.moving = Math.abs(agent.vx) + Math.abs(agent.vz) > 0.5;
}

export function speedOf(agent) {
  return Math.sqrt(agent.vx * agent.vx + agent.vz * agent.vz);
}

// Yaw-forward direction (three.js: yaw 0 faces -Z; yaw PI/2 faces +X).
export function forwardOf(yaw) {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightOf(yaw) {
  return { x: Math.cos(yaw), z: Math.sin(yaw) };
}
