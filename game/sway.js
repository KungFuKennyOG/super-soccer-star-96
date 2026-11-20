// Weight. A light physics layer over whatever pose the player has been given (game/gait.js, game/mocap.js):
// his trunk, arms, hands and shoulders are masses on damped springs, knocked by every change in his
// velocity and heading and by each footfall. So a hard stop rocks him forward over his feet and back, a cut
// throws his arms and trunk wide and they catch up, a turn leaves his chest a moment behind his hips, and
// his shoulders and hands give as each boot lands. Nothing here moves his feet, his hips or the ball.
// Model space: +z the way he faces, +x his left, y up.
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const SWAY = {
  trunk: { w: 10, z: 0.5, g: 0.5, max: 0.2 },      // spring rate (rad/s), damping ratio, rad/s per m/s of jolt, limit (rad)
  arms: { w: 7.5, z: 0.32, g: 0.85, max: 0.5 },
  twist: { w: 9, z: 0.5, g: 0.3, max: 0.3 },       // the chest behind a change in turning rate (g: rad/s per rad/s)
  land: { w: 15, z: 0.38, g: 0.55, max: 0.07 },    // shoulders and hands at each footfall (g: rad/s at a full run)
  ease: 4,                                         // how fast a steady push stops counting as a jolt (1/s)
  jolt: 3.2,                                       // the biggest change in speed felt in one frame (m/s): kick-off teleports
};

// cloth: m of trail per m/s (3 cm at most), m per rad of arm jolt, m per rad of footfall give, flutter (m standing, more per m/s)
const CLOTH = { drag: 0.0045, jolt: 0.07, land: 0.18, flap: [0.0015, 0.0016] };
const AX = ['tp', 'tr', 'ap', 'ar', 'ty', 'ld'];
function stateOf(m) {
  if (!m.sway) { m.sway = { vx: 0, vz: 0, ax: 0, az: 0, ry: m.root.rotation.y, wy: 0, half: 0, on: false }; for (const k of AX) m.sway[k] = m.sway[k + 'v'] = 0; }
  return m.sway;
}
// one spring a step on: x'' = -w² x - 2 z w x'
function step(s, k, c, dt) {
  const v = s[k + 'v'] += (-c.w * c.w * s[k] - 2 * c.z * c.w * s[k + 'v']) * dt;
  s[k] = clamp(s[k] + v * dt, -c.max, c.max);
  if (Math.abs(s[k]) === c.max) s[k + 'v'] = 0;
}

// Call last, on a posed model. p: the sim player (velocity in world space); g: his gait state (for how hard he's running).
export function sway(m, bn, p, dt, g) {
  const s = stateOf(m), ry = m.root.rotation.y, c = Math.cos(ry), sn = Math.sin(ry);
  const vx = p.vx * c - p.vz * sn, vz = p.vx * sn + p.vz * c;
  if (!s.on) { s.on = true; s.vx = vx; s.vz = vz; s.ry = ry; s.half = Math.floor((m.phase || 0) / Math.PI); }
  if (dt > 0) {
    // the jolt: this frame's change in velocity, less the steady push he has had time to brace against
    const e = Math.min(1, dt * SWAY.ease), J = SWAY.jolt;
    const dx = clamp(vx - s.vx, -J, J), dz = clamp(vz - s.vz, -J, J), jx = dx - s.ax * dt, jz = dz - s.az * dt;
    s.ax += (dx / dt - s.ax) * e; s.az += (dz / dt - s.az) * e; s.vx = vx; s.vz = vz;
    let d = ry - s.ry; d -= Math.round(d / TAU) * TAU; s.ry = ry;
    const wy = clamp(d / dt, -9, 9), jw = wy - s.wy; s.wy += jw * Math.min(1, dt * 10);
    s.tpv -= SWAY.trunk.g * jz; s.trv += SWAY.trunk.g * jx;        // stopping tips him forward; pushed left, he's left behind to the right
    s.apv += SWAY.arms.g * jz; s.arv -= SWAY.arms.g * jx;          // his arms trail the push
    s.tyv -= SWAY.twist.g * jw * Math.min(1, dt * 10);
    // a boot lands twice a stride (phase 0 and half way)
    const half = Math.floor((m.phase || 0) / Math.PI);
    if (half !== s.half) { s.half = half; s.ldv += SWAY.land.g * (g ? 0.35 * g.mv + 0.65 * g.run : 0); }
    for (let n = dt > 1 / 50 ? 2 : 1, h = Math.min(dt, 1 / 20) / n, i = 0; i < n; i++) {
      step(s, 'tp', SWAY.trunk, h); step(s, 'tr', SWAY.trunk, h); step(s, 'ap', SWAY.arms, h); step(s, 'ar', SWAY.arms, h);
      step(s, 'ty', SWAY.twist, h); step(s, 'ld', SWAY.land, h);
    }
  }
  if (m.cloth) {
    // loose cloth (game/ps2/player.js): it trails his movement, is thrown by the same jolts as his arms, bounces as a boot lands and flutters more the faster he goes
    const sp = Math.hypot(vx, vz), k = Math.min(1, 0.03 / (sp * CLOTH.drag + 1e-6));
    m.cloth.uCloth.value.set(-vx * CLOTH.drag * k + s.ar * CLOTH.jolt, -s.ld * CLOTH.land, -vz * CLOTH.drag * k - s.ap * CLOTH.jolt);
    s.flap = (s.flap || m.phase || 0) + dt * (7 + sp * 2.6);
    m.cloth.uFlap.value.set(CLOTH.flap[0] + CLOTH.flap[1] * sp, s.flap);
  }
  // trunk: shared between the spine and the chest; the neck gives most of it back, so his head stays level
  bn.spine.rotateX(s.tp * 0.5); bn.spine.rotateZ(s.tr * 0.5); bn.chest.rotateX(s.tp * 0.5); bn.chest.rotateZ(s.tr * 0.5);
  bn.chest.rotateY(s.ty);
  bn.neck.rotateX(-s.tp * 0.7); bn.neck.rotateZ(-s.tr * 0.7); bn.neck.rotateY(-s.ty * 0.8);
  for (const n of 'LR') {
    const sd = n === 'L' ? 1 : -1, ua = bn['upperArm' + n], fa = bn['foreArm' + n], hd = bn['hand' + n], cl = bn['clavicle' + n];
    // sideways an arm swings freely away from him and stops at his ribs
    const out = sd > 0 ? Math.max(-0.06, s.ar) : Math.min(0.06, s.ar);
    ua.rotateX(s.ap * 0.6); ua.rotateZ(out * 0.6);
    fa.rotateX(-Math.max(0, -s.ap) * 0.5 - Math.abs(s.ld) * 1.2);                 // the elbow gives; it can't bend backwards
    hd.rotateX(s.ap * 0.3 + s.ld * 1.2);                                              // a loose wrist, not a broken one
    cl.rotateZ(-sd * s.ld);                                                          // the shoulders drop as the boot lands
  }
  bn.chest.rotateX(s.ld * 0.25);
}
