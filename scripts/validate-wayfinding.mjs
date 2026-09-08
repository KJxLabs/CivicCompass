import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = await readFile(resolve(root, "src/index.html"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractObjectLiteral(marker) {
  const markerIndex = html.indexOf(marker);
  assert(markerIndex >= 0, `Missing source object: ${marker}`);
  const start = html.indexOf('{', markerIndex + marker.length);
  assert(start >= 0, `Missing opening brace for: ${marker}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed source object: ${marker}`);
}

const level2Precision = new Function(
  `return (${extractObjectLiteral('const LEVEL2_PRECISION =')});`
)();
const level2Plan = new Function(
  'LEVEL2_PRECISION',
  `return (${extractObjectLiteral('const LEVEL2_PLAN_REGISTER = Object.freeze(')});`
)(level2Precision);

const expectedLevel2Order = {
  admin: {
    upper: ['225', 'E3', '219', '217', 'STAIRS B', '209', '205', 'STAIRS A'],
    lower: ['E1', '208', '202', '200']
  },
  hall: {
    upper: ['233', 'ATM', 'E5/6', '241', '245', '247', '251', '255', 'E7/8', '263', '265'],
    lower: ['STAIRS C', '232', '234', '236', 'STAIRS D', '244', '246', '248', 'STAIRS E', '260', 'STAIRS F', '266', '271', '275']
  }
};

function registeredBandSequence(wingName, bandName) {
  const wing = level2Plan[wingName];
  const side = wing.bandSide[bandName];
  const entities = [
    ...wing.roomBands[bandName].map((room) => ({
      label: room.room,
      grid: (room.start + room.end) / 2
    })),
    ...wing.cores.filter((core) => core.side === side).map((core) => ({
      label: core.label,
      grid: core.grid
    })),
    ...wing.stairs.filter((stair) => stair.side === side).map((stair) => ({
      label: stair.label,
      grid: stair.grid
    }))
  ];
  // Administration grid numbers decrease away from the rotunda; Hall grid
  // numbers increase away from it.
  entities.sort((a, b) => wingName === 'admin' ? b.grid - a.grid : a.grid - b.grid);
  return entities.map((entity) => entity.label);
}

for (const [wingName, bands] of Object.entries(expectedLevel2Order)) {
  for (const [bandName, expected] of Object.entries(bands)) {
    const actual = registeredBandSequence(wingName, bandName);
    assert(
      JSON.stringify(actual) === JSON.stringify(expected),
      `${wingName} ${bandName} band differs from annotated plan:\nexpected ${expected.join(' → ')}\nactual   ${actual.join(' → ')}`
    );
    const sign = level2Plan[wingName].bandSide[bandName];
    assert(Math.sign(level2Precision[wingName][`${bandName}Lane`]) === sign,
      `${wingName} ${bandName} route lane is on the wrong band`);
    assert(Math.sign(level2Precision[wingName][`${bandName}Door`]) === sign,
      `${wingName} ${bandName} room doors are on the wrong band`);
  }
}

assert(level2Plan.hall.cores.every((core) => core.side === level2Plan.hall.bandSide.upper),
  'Elevators 5 & 6 and 7 & 8 must be on the Hall upper band');
assert(level2Plan.hall.stairs.every((stair) => stair.side === level2Plan.hall.bandSide.lower),
  'Stairs C–F must be on the Hall lower band');
assert(level2Plan.admin.cores.find((core) => core.label === 'E1')?.side === level2Plan.admin.bandSide.lower,
  'Elevator 1 must be on the Administration lower band');
assert(level2Plan.admin.cores.find((core) => core.label === 'E3')?.side === level2Plan.admin.bandSide.upper,
  'Elevator 3 must be on the Administration upper band');
assert(level2Plan.admin.stairs.every((stair) => stair.side === level2Plan.admin.bandSide.upper),
  'Stairs A and B must be on the Administration upper band');

// Confirm that those local-axis signs visually resolve to the annotated upper
// and lower sides when East is at the top of the screen.
const geoRotation = -78.1 * Math.PI / 180;
const eastUpYaw = Math.PI / 2 - geoRotation + Math.PI / 2;
function eastUpScreenVertical(wingAngle, lateralSign, pitch = .96) {
  const camera = {
    x: Math.cos(eastUpYaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: Math.sin(eastUpYaw) * Math.cos(pitch)
  };
  const forward = { x: -camera.x, y: -camera.y, z: -camera.z };
  const rightLength = Math.hypot(forward.z, forward.x);
  const right = { x: -forward.z / rightLength, y: 0, z: forward.x / rightLength };
  const screenUp = {
    x: -right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y
  };
  const length = Math.hypot(screenUp.x, screenUp.y, screenUp.z);
  screenUp.x /= length;
  screenUp.z /= length;
  // localToWorld lateral displacement, followed by buildingGroup.scale.z = -1
  const displacement = {
    x: Math.sin(wingAngle) * lateralSign,
    z: -Math.cos(wingAngle) * lateralSign
  };
  return displacement.x * screenUp.x + displacement.z * screenUp.z;
}

assert(eastUpScreenVertical(Math.PI, level2Plan.admin.bandSide.upper) > 0,
  'Administration upper band must appear above the building in East-up view');
assert(eastUpScreenVertical(Math.PI, level2Plan.admin.bandSide.lower) < 0,
  'Administration lower band must appear below the building in East-up view');
assert(eastUpScreenVertical(-0.727, level2Plan.hall.bandSide.upper) > 0,
  'Hall upper band must appear above the building in East-up view');
assert(eastUpScreenVertical(-0.727, level2Plan.hall.bandSide.lower) < 0,
  'Hall lower band must appear below the building in East-up view');

[
  "linkMeasured('central-lower', 'central-entry-lower')",
  "linkMeasured('central-entry-lower', 'e56-lower')",
  "linkMeasured('north-lower', 'north-entry-lower')",
  "linkMeasured('north-entry-lower', 'e78-lower')",
  "linkMeasured('south-l1', 'south-entry-l1')",
  "linkMeasured('south-entry-l1', 'e1-l1')",
  "'central-lower': { 'd-208': 'right', 'd-232': 'right', 'd-234': 'right' }",
  "'north-lower': { 'd-208': 'right', 'd-232': 'right', 'd-234': 'right' }",
  "'south-l1': { 'd-232': 'left', 'd-234': 'left' }",
  "aspect-ratio: 3 / 4",
  "const yaw = EAST_UP_YAW",
  "yaw: EAST_UP_YAW",
  "roomBands: LEVEL2_PLAN_REGISTER.admin.roomBands",
  "roomBands: LEVEL2_PLAN_REGISTER.hall.roomBands",
  "const side = LEVEL2_PLAN_REGISTER[wingName].bandSide[sideName]",
  "const doorLine = LEVEL2_PRECISION[wingName][sideName + 'Door']",
  "linkMeasured('f2-h-u-41', 'f2-rot-3')",
  "linkMeasured('f2-h-l-41', 'f2-rot-6')"
].forEach((snippet) => assert(html.includes(snippet), `Missing required wayfinding rule: ${snippet}`));

[
  "name: 'Elevators 5 & 6', level2Lateral: -3.25",
  "name: 'Elevators 7 & 8', level2Lateral: -3.25",
  "['e56-l2', 'hall', LEVEL2_PRECISION.hall.e56Grid, -3.25]",
  "['e78-l2', 'hall', LEVEL2_PRECISION.hall.e78Grid, -3.25]",
  "addFloor2Node('f2-e56-lobby', 'hall', LEVEL2_PRECISION.hall.e56Grid, -2.92",
  "addFloor2Node('f2-e78-lobby', 'hall', LEVEL2_PRECISION.hall.e78Grid, -2.92"
].forEach((snippet) => assert(html.includes(snippet), `Hall infrastructure is not registered to the upper band: ${snippet}`));

[
  "linkMeasured('central-lower', 'e56-lower')",
  "linkMeasured('north-lower', 'e78-lower')",
  "linkMeasured('f2-h-u-41', 'f2-rot-6')",
  "linkMeasured('f2-h-l-41', 'f2-rot-3')",
  "yaw: NORTH_UP_YAW",
  "yaw: .92",
  "yaw: 1.02"
].forEach((snippet) => assert(!html.includes(snippet), `Route bypasses the entrance turn: ${snippet}`));

function localPoint(angle, distance, lateral) {
  return {
    x: Math.cos(angle) * distance + Math.sin(angle) * lateral,
    z: -Math.sin(angle) * distance + Math.cos(angle) * lateral
  };
}

function renderedTurnCross(angle, entranceDistance, thresholdLateral, insideLateral, elevatorDistance, elevatorLateral = insideLateral) {
  const start = localPoint(angle, entranceDistance, thresholdLateral);
  const inside = localPoint(angle, entranceDistance, insideLateral);
  const elevator = localPoint(angle, elevatorDistance, elevatorLateral);
  const incoming = { x: inside.x - start.x, z: -(inside.z - start.z) };
  const outgoing = { x: elevator.x - inside.x, z: -(elevator.z - inside.z) };
  return incoming.x * outgoing.z - incoming.z * outgoing.x;
}

const hallLength = 42.2;
const hallGridDistance = (grid) => (grid - 38) * hallLength / (92 - 38);
const adminGridDistance = (grid) => 5.82 + (28 - grid) * 1.33;
assert(renderedTurnCross(-0.727, 13.79, 4.46, 3.25, hallGridDistance(58.05), -3.25) < 0,
  'Center Arch geometry must turn left to Elevators 5 & 6');
assert(renderedTurnCross(-0.727, 27.66, 4.46, 3.25, hallGridDistance(75.80), -3.25) < 0,
  'North Arch geometry must turn left to Elevators 7 & 8');
assert(renderedTurnCross(Math.PI, 14.32, -4.46, -3.25, adminGridDistance(25.5)) < 0,
  'South Arch geometry must turn left to Elevator 1');

const e56EntryOffset = hallGridDistance(level2Precision.hall.e56Grid) - 13.79;
const e78EntryOffset = hallGridDistance(level2Precision.hall.e78Grid) - 27.66;
assert(Math.abs(e56EntryOffset - e78EntryOffset) < .01,
  'Hall elevator banks must align with the two owner-marked yellow entrance offsets');

const hallUpperRouteGrids = [41, 45, 47.5, 51.25, level2Precision.hall.e56Grid, 65, 70, level2Precision.hall.e78Grid, 80, 91];
const hallLowerRouteGrids = [41, 45, 47.5, 51.25, level2Precision.hall.e56Grid, 65, 70, level2Precision.hall.stairEGrid, level2Precision.hall.e78Grid, 80, 91];
for (const [name, grids] of [['upper', hallUpperRouteGrids], ['lower', hallLowerRouteGrids]]) {
  assert(grids.every((grid, index) => index === 0 || grid > grids[index - 1]),
    `Hall ${name} route reverses direction at a waypoint`);
}

[
  'const f2HallUpper = [41, 45, 47.5, 51.25, LEVEL2_PRECISION.hall.e56Grid, 65, 70, LEVEL2_PRECISION.hall.e78Grid, 80, 91]',
  'const f2HallLower = [41, 45, 47.5, 51.25, LEVEL2_PRECISION.hall.e56Grid, 65, 70, LEVEL2_PRECISION.hall.stairEGrid, LEVEL2_PRECISION.hall.e78Grid, 80, 91]'
].forEach((snippet) => assert(html.includes(snippet), `Level 2 Hall route order is incorrect: ${snippet}`));

[
  'function roundedGuideCurve(points, cornerRadius = .72)',
  'new THREE.QuadraticBezierCurve3(entry, corner, exit)',
  'new THREE.TubeGeometry(curve, tubularSegments, .43, 8, false)',
  'new THREE.TubeGeometry(curve, tubularSegments, .29, 8, false)',
  'guideFlowState = { curve, totalLength, arrows }',
  'function guideDisplayIds(step)',
  'const activeLegIds = guideStepFloorIds(step)',
  'configureGuideFlow(step, displayIds)',
  "const targetName = step.landmark || nodes[targetId]?.name || 'Next point'"
].forEach((snippet) => assert(html.includes(snippet), `Guide flow is not continuous at route turns: ${snippet}`));
assert(!html.includes('guideFlowState = { points, segmentLengths, totalLength, arrows }'),
  'Guide arrows still use discontinuous per-segment sampling');

[
  'grid-template-rows: auto minmax(0, 1fr) auto auto',
  'height: clamp(210px, 28dvh, 270px)',
  'flex-direction: column',
  'if (guideLayout) guideLayout.scrollTop = 0'
].forEach((snippet) => assert(html.includes(snippet), `Mobile guide layout correction is missing: ${snippet}`));

const guideStart = html.indexOf('const ENTRANCE_ELEVATOR_GUIDANCE');
const guideEnd = html.indexOf('function setRouteButtonsEnabled', guideStart);
assert(guideStart >= 0 && guideEnd > guideStart, 'Could not isolate guide-step logic');
const guideSource = html.slice(guideStart, guideEnd);

const connectorNames = {
  e1: 'Elevator 1',
  e56: 'Elevators 5 & 6',
  e78: 'Elevators 7 & 8'
};
const levelRanks = new Map([['lower', 0], [1, 2], [2, 3]]);

const scenarios = [
  ['central-lower', 'Center Arch', 'e56', 'd-208', 'Assessor · 208', 'right', true],
  ['central-lower', 'Center Arch', 'e56', 'd-232', 'County Recorder · 232', 'right', false],
  ['central-lower', 'Center Arch', 'e56', 'd-234', 'County Clerk · 234', 'right', false],
  ['north-lower', 'North Arch', 'e78', 'd-208', 'Assessor · 208', 'right', true],
  ['north-lower', 'North Arch', 'e78', 'd-232', 'County Recorder · 232', 'right', false],
  ['north-lower', 'North Arch', 'e78', 'd-234', 'County Clerk · 234', 'right', false],
  ['south-l1', 'South Arch', 'e1', 'd-232', 'County Recorder · 232', 'left', true],
  ['south-l1', 'South Arch', 'e1', 'd-234', 'County Clerk · 234', 'left', true]
];

for (const [startId, startName, elevatorId, destinationId, destinationName, side, crossesRotunda] of scenarios) {
  const startFloor = startId === 'south-l1' ? 1 : 'lower';
  const entryId = startId === 'south-l1'
    ? 'south-entry-l1'
    : startId === 'central-lower'
      ? 'central-entry-lower'
      : 'north-entry-lower';
  const elevatorStartId = `${elevatorId}-${startFloor === 'lower' ? 'lower' : 'l1'}`;
  const elevatorLevel2Id = `${elevatorId}-l2`;
  const nodes = {
    [startId]: { id: startId, name: startName, floor: startFloor },
    [entryId]: { id: entryId, name: `Inside ${startName}`, floor: startFloor },
    [elevatorStartId]: { id: elevatorStartId, name: connectorNames[elevatorId], floor: startFloor },
    [elevatorLevel2Id]: { id: elevatorLevel2Id, name: connectorNames[elevatorId], floor: 2 },
    'level2-corridor': { id: 'level2-corridor', name: 'Level 2 corridor', floor: 2 },
    'f2-rot-1': { id: 'f2-rot-1', name: 'Rotunda', floor: 2 },
    'core-l2': { id: 'core-l2', name: 'Rotunda', floor: 2 },
    'f2-rot-3': { id: 'f2-rot-3', name: 'Rotunda', floor: 2 },
    [destinationId]: { id: destinationId, name: destinationName, floor: 2 }
  };
  const path = [startId, entryId, elevatorStartId, elevatorLevel2Id, 'level2-corridor'];
  if (crossesRotunda) path.push('f2-rot-1', 'core-l2', 'f2-rot-3');
  path.push(destinationId);

  const buildGuideSteps = new Function(
    'START_LOCATION_SPECS', 'nodes', 'walkingDirection', 'levelName',
    'connectorNameForEdge', 'routeEdgeKind', 'levelRank',
    `${guideSource}; return buildGuideSteps;`
  )(
    [{ id: 'central-lower' }, { id: 'north-lower' }, { id: 'south-l1' }],
    nodes,
    () => ({ arrow: '↑', phrase: 'Continue straight' }),
    (level) => level === 'lower' ? 'Lower level' : `Level ${level}`,
    (a, b) => {
      const prefix = Object.keys(connectorNames).find((id) => a.startsWith(`${id}-`) || b.startsWith(`${id}-`));
      return prefix ? connectorNames[prefix] : 'Stairs';
    },
    () => 'elevator',
    (level) => levelRanks.get(level)
  );
  const steps = buildGuideSteps(path, nodes[startId], nodes[destinationId]);
  const transferIndex = steps.findIndex((step) => step.type === 'transfer');
  assert(transferIndex > 0, `${startName} → ${destinationName}: missing elevator transfer`);
  assert(steps[1].instruction === `Turn left toward ${connectorNames[elevatorId]}`,
    `${startName} → ${destinationName}: elevator approach is not an explicit left turn`);
  assert(steps[transferIndex].instruction === `Take ${connectorNames[elevatorId]} to Level 2`,
    `${startName} → ${destinationName}: incorrect elevator transfer`);
  assert(!steps.slice(0, transferIndex).some((step) => step.floor === 2),
    `${startName} → ${destinationName}: Level 2 guidance appears before the elevator`);
  assert(steps.slice(transferIndex + 1, -1).some((step) => step.detail?.includes(`on your ${side}`)),
    `${startName} → ${destinationName}: missing ${side}-side room guidance`);
  assert(steps.at(-1).instruction.endsWith(`room on your ${side}`),
    `${startName} → ${destinationName}: arrival side is incorrect`);
}

[
  'viewport-fit=cover',
  '--mcc-viewport-height',
  'height: var(--mcc-viewport-height, 100svh)',
  'grid-template-columns: repeat(3, minmax(0, 1fr))',
  "history.scrollRestoration = 'manual'",
  "window.scrollTo({ top: 0, left: 0, behavior: 'auto' })"
].forEach((snippet) => assert(html.includes(snippet), `Mobile landing viewport fix is missing: ${snippet}`));
assert(!html.includes('element.scrollIntoView('),
  'Mobile workflow must not move the document after the map has loaded');

console.log('Civic Compass wayfinding validation passed.');
