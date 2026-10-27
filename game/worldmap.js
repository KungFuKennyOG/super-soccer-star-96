// A small pixel world map for picking a nation. Continents are rough outlines (longitude, latitude)
// filled on a canvas; each nation is a dot. European nations are close together, so when one of them
// is selected the map zooms in on Europe.
import { NATIONS, NATION_POS } from '../rules/teams.js';
import { drawText, textWidth } from './tex.js';

const LAND = {
  northAmerica: [[-168, 66], [-140, 70], [-100, 72], [-80, 73], [-62, 60], [-55, 50], [-66, 44], [-75, 35], [-81, 25], [-90, 29], [-97, 26], [-97, 20], [-87, 21], [-84, 15], [-79, 8], [-83, 8], [-92, 14], [-105, 20], [-112, 30], [-118, 33], [-124, 40], [-124, 48], [-133, 56], [-150, 60], [-165, 61]],
  greenland: [[-50, 60], [-42, 60], [-20, 70], [-20, 80], [-60, 82], [-70, 76], [-55, 68]],
  southAmerica: [[-79, 8], [-62, 10], [-50, 0], [-35, -5], [-39, -15], [-48, -25], [-58, -35], [-65, -42], [-68, -52], [-74, -50], [-73, -40], [-71, -18], [-81, -5], [-80, 0]],
  europe: [[-9, 43], [-9, 37], [-6, 36], [-1, 37], [3, 42], [7, 44], [12, 44], [16, 38], [19, 40], [13, 45], [19, 42], [24, 37], [27, 40], [29, 41], [40, 45], [40, 60], [30, 70], [20, 70], [14, 66], [5, 62], [5, 58], [8, 57], [10, 54], [8, 54], [5, 53], [2, 51], [-5, 48], [-1, 46], [-2, 43]],
  britain: [[-5, 50], [1, 51], [2, 53], [-1, 55], [-2, 58], [-5, 58.6], [-6, 56], [-3, 54], [-5, 52]],
  ireland: [[-10, 51.5], [-6, 52], [-6, 55], [-8, 55], [-10, 53]],
  africa: [[-17, 21], [-13, 28], [-10, 30], [-6, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 12], [40, -5], [40, -15], [35, -25], [20, -35], [18, -30], [12, -17], [13, -5], [9, 4], [-3, 5], [-8, 4], [-17, 14]],
  madagascar: [[44, -25], [50, -15], [48, -13], [43, -22]],
  asia: [[26, 40], [36, 36], [35, 32], [44, 12], [52, 16], [58, 22], [56, 26], [60, 25], [67, 24], [72, 20], [77, 8], [80, 15], [88, 22], [93, 20], [98, 16], [100, 5], [104, 1], [106, 10], [108, 18], [110, 22], [121, 30], [122, 40], [129, 35], [127, 40], [135, 43], [140, 50], [143, 59], [160, 60], [170, 65], [180, 66], [180, 72], [140, 73], [110, 77], [80, 73], [70, 70], [60, 69], [40, 67], [40, 45], [30, 42]],
  japan: [[130, 31], [136, 34], [140, 35], [142, 40], [141, 45], [139, 42], [135, 35]],
  indonesia: [[95, 5], [106, -6], [115, -8], [125, -9], [125, -7], [115, -6], [106, -4], [98, 3]],
  australia: [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [131, -32], [115, -34]],
};
const WORLD = { lon: [-170, 180], lat: [-55, 80] };
const EUROPE = { lon: [-12, 32], lat: [34, 66] };
const IN_EUROPE = id => { const [x, y] = NATION_POS[id]; return x > -12 && x < 32 && y > 34 && y < 66; };

// Draws the map into the rectangle (x, y, w, h) with `selected` highlighted. t: seconds, for the blink.
export function drawWorldMap(ctx, x, y, w, h, selected, t) {
  const view = IN_EUROPE(selected) ? EUROPE : WORLD;
  const sx = w / (view.lon[1] - view.lon[0]), sy = h / (view.lat[1] - view.lat[0]), s = Math.min(sx, sy);
  const ox = x + (w - (view.lon[1] - view.lon[0]) * s) / 2, oy = y + (h - (view.lat[1] - view.lat[0]) * s) / 2;
  const px = lon => ox + (lon - view.lon[0]) * s, py = lat => oy + (view.lat[1] - lat) * s;

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#0c1a4a'; ctx.fillRect(x, y, w, h);
  // faint grid lines every 30 degrees, like an old atlas
  ctx.fillStyle = '#13245c';
  for (let lon = -150; lon <= 180; lon += 30) ctx.fillRect(Math.round(px(lon)), y, 1, h);
  for (let lat = -30; lat <= 60; lat += 30) ctx.fillRect(x, Math.round(py(lat)), w, 1);
  ctx.fillStyle = '#2f6e3c'; ctx.strokeStyle = '#4c9a58'; ctx.lineWidth = 1;
  for (const pts of Object.values(LAND)) {
    ctx.beginPath();
    pts.forEach(([lon, lat], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, Math.round(px(lon)) + 0.5, Math.round(py(lat)) + 0.5));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // every nation, then the selected one blinking with a ring
  for (const n of NATIONS) {
    const [lon, lat] = NATION_POS[n.id];
    ctx.fillStyle = n.kit.shirt; ctx.fillRect(Math.round(px(lon)) - 1, Math.round(py(lat)) - 1, 3, 3);
    ctx.fillStyle = '#000'; ctx.fillRect(Math.round(px(lon)) - 1, Math.round(py(lat)) + 2, 3, 1);
  }
  const [lon, lat] = NATION_POS[selected], cx = Math.round(px(lon)), cy = Math.round(py(lat));
  const on = Math.floor(t * 4) % 2;
  ctx.strokeStyle = on ? '#f2c21a' : '#ffffff'; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 4.5, cy - 4.5, 9, 9);
  ctx.fillStyle = '#f2c21a'; ctx.fillRect(cx - 2, cy - 2, 5, 5);
  // label, kept inside the map
  const label = selected, lw = textWidth(label);
  const lx = Math.min(x + w - lw - 2, Math.max(x + 2, cx - lw / 2)), ly = cy - 14 < y + 2 ? cy + 7 : cy - 14;
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(lx - 2, ly - 1, lw + 4, 9);
  drawText(ctx, label, lx, ly, '#ffffff');
  drawText(ctx, view === EUROPE ? 'EUROPE' : 'WORLD', x + 3, y + h - 9, '#7d8fd0');
  ctx.restore();
}
