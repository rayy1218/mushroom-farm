// web/mimic.js: the room drawing, shared by the Test bench and the room Overview tab (C13 2).
// create(host, { idPrefix }) puts the drawing in host; paint(DrawState) fills it, tick(dt) animates it.
// layout and fromReading are pure (tests/web-mimic.test.js, tests/web-mimic-shared.test.js).
(function (global) {
'use strict';

const NAMES = { ac: 'Aircon', hu: 'Mister', inlet: 'Fresh-air in', outlet: 'Fresh-air out', circ: 'Fan' };
const AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' };
const CAP_SCALE = { spawn: 0, pinning: 0.35, fruiting: 1, rest: 0.12 };
const VENT_Y = { high: 160, low: 352 };

// The air exchange of the drawing (C9 section 7): the filtered intake fan SF-203 on the left wall and the exhaust
// fan EF-206 on the right wall, each high or low as inletAt / exhaustAt say. Pure.
function layout({ inletAt, exhaustAt }) {
  return {
    inlet: { band: inletAt === 'low' ? 'low' : 'high', kind: 'fan', tag: 'SF-203', label: 'Filtered intake' },
    outlet: { band: exhaustAt === 'high' ? 'high' : 'low', kind: 'fan', tag: 'EF-206', label: 'Exhaust' },
  };
}

const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const fix = (x, d) => (num(x) === null ? null : x.toFixed(d));
const clamp01 = x => Math.min(1, Math.max(0, x));
const ui = () => global.FarmUi;

// DrawState -> everything the painter writes, as plain data: texts, levels, flags. Null-safe, no DOM.
function view(s) {
  s = s || {};
  const u = s.units || {}, ac = u.ac || null, cond = u.cond || null, hu = u.hu || null, air = u.air || null;
  const circ = u.circ || null, lights = u.lights || null, st = s.status || {}, codes = s.codes !== false, z = s.zones || null;
  const dash = '--', txt = v => (v == null || v === '' ? '' : String(v)), unit = v => (v == null || v === '' ? dash : String(v));
  const readout = (val, unitText, chip, lo, hi, d) => ({
    val: num(val) === null ? dash : `${val.toFixed(d)}${unitText}`,
    ico: chip && chip.icon ? chip.icon : '', lvl: chip && chip.lvl ? chip.lvl : 'none',
    // the zone line when the state has zones (the bench), else the chip's own words (a real room has no zones)
    zn: z && z.lo && z.hi && num(z.lo[lo]) !== null && num(z.hi[lo]) !== null ? `low ${z.lo[lo].toFixed(d)} · high ${z.hi[lo].toFixed(d)}` : (chip && chip.text ? String(chip.text) : ''),
  });
  const out = s.out || null, vent = (side, key) => {
    const o = layout({ inletAt: air && air.inletAt, exhaustAt: air && air.exhaustAt })[side];
    return { band: o.band, tag: codes ? o.tag : NAMES[key], label: codes ? o.label : '', state: unit(air && air.state) };
  };
  const comp = !!(cond ? cond.on : ac && num(ac.run) > 0);
  return {
    codes, night: !!s.night, title: txt(s.title), note: txt(s.note), roomLine: txt(s.roomLine), airLine: txt(s.airLine), powerLine: txt(s.powerLine),
    outEye: codes ? 'OUTDOOR · OT-104' : 'OUTDOOR',
    outT: out && num(out.T) !== null ? `${out.T.toFixed(1)} °C` : dash, outRH: out && num(out.RH) !== null ? `${out.RH.toFixed(0)} % RH` : dash,
    sky: s.night ? 'Night' : 'Day',
    readouts: { mT: readout(s.T, ' °C', st.T, 'T', 'T', 1), mRH: readout(s.RH, ' % RH', st.RH, 'RH', 'RH', 0), mC: readout(s.CO2, ' ppm', st.CO2, 'C', 'C', 0) },
    acTag: codes ? 'ACU-201' : NAMES.ac, acState: unit(ac && ac.state), acSub: txt(ac && ac.sub),
    condState: unit(cond && cond.state),
    huTag: codes ? 'HU-202' : NAMES.hu, huState: unit(hu && hu.state), huSub: txt(hu && hu.sub),
    circTag: codes ? 'CF-205' : NAMES.circ, circState: unit(circ && circ.state), lampText: unit(lights && lights.state),
    inlet: vent('inlet', 'inlet'), outlet: vent('outlet', 'outlet'),
    blocks: txt(s.blocks), core: txt(s.core),
    manual: { ac: !!(ac && ac.manual), hu: !!(hu && hu.manual), air: !!(air && air.manual), circ: !!(circ && circ.manual), lights: !!(lights && lights.manual) },
    on: { ac: comp, cond: !!(cond && cond.on), hu: !!(hu && num(hu.level) > 0), air: !!(air && air.on), circ: !!(circ && circ.on), lights: !!(lights && lights.on) },
    // animation inputs
    powered: !!(ac && ac.on), acRun: ac && num(ac.run) !== null ? clamp01(ac.run) : 0, comp,
    fogF: hu && num(hu.level) !== null ? clamp01(hu.level / 3) : 0, fanF: air && air.on ? 1 : 0, circF: circ && circ.on ? 1 : 0,
    co2Rate: num(s.co2Rate) === null ? 0 : clamp01(s.co2Rate), capScale: Object.hasOwn(CAP_SCALE, s.stage) ? CAP_SCALE[s.stage] : 0,
  };
}

// ---------------- fromReading (C13 2) ----------------
const ellipsis = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const onOff = v => (v === 1 ? 'On' : 'Off');
function farmHour(t) { return Math.floor((((t + ui().farmClock().offset) % 86400) + 86400) % 86400 / 3600); }
function fromReading({ reading, live, room, settings, level } = {}) {
  const r = reading;
  if (!r) return null;
  const U = ui(), CC = global.ClimateController, lv = live || {}, man = new Set(lv.manual || []), codes = level !== 'farmer';
  const st = lv.status || null, chip = k => (st && st[k] ? (codes ? st[k] : U.plainChip(k, st[k])) : null);
  const acOn = r.ac_mode !== 'off' && r.ac_mode != null, powerW = num(r.power_w);
  const fog = num(r.fog) || 0, airOn = r.air === 1;
  const vol = room && num(room.volume), airM3h = settings && num(settings.airM3h);
  const crop = CC && CC.CROPS && CC.CROPS[lv.crop], stage = CC && CC.STAGES && CC.STAGES[lv.stage];
  const title = [crop ? crop.name : lv.crop, stage || lv.stage].filter(Boolean).join(' · ');
  const power = powerW !== null ? `Power now ${U.watts(powerW)}` : '';
  const blocks = num(lv.blocks), out = num(r.t_out) !== null || num(r.rh_out) !== null ? { T: num(r.t_out), RH: num(r.rh_out) } : null;
  return {
    title,
    roomLine: room && room.name ? ellipsis(vol !== null ? `${room.name} · ${vol} m³` : room.name, 34) : '',
    airLine: airOn ? (airM3h !== null && vol ? `Fresh air ${(airM3h / vol).toFixed(1)} changes an hour` : 'Fresh air on') : 'Fresh air off',
    powerLine: power,
    out, night: num(r.t) !== null ? (h => h >= 19 || h < 7)(farmHour(r.t)) : false,
    T: num(r.T), RH: num(r.RH), CO2: num(r.CO2),
    status: { T: chip('T'), RH: chip('RH'), CO2: chip('CO2') },
    zones: null,
    units: {
      ac: { on: acOn, run: acOn ? 0.6 : 0, state: acOn ? `${AC_WORD[r.ac_mode] ?? r.ac_mode} ${U.fmtNum(r.ac_setpoint, 1)} °C` : 'Off', sub: '', manual: man.has('ac') },
      cond: { on: acOn, state: acOn ? 'Running' : 'Idle' },
      hu: { level: fog, state: fog > 0 ? `Level ${fog}` : 'Off', sub: '', manual: man.has('hu') },
      air: { on: airOn, state: airOn ? (airM3h !== null ? `On · ${U.nf(airM3h)} m³/h` : 'On') : 'Off · dampers closed', manual: man.has('air'),
        inletAt: settings && settings.inletAt === 'low' ? 'low' : 'high', exhaustAt: settings && settings.exhaustAt === 'high' ? 'high' : 'low' },
      circ: { on: r.circ === 1, state: onOff(r.circ), manual: man.has('circ') },
      lights: { on: r.lights === 1, state: r.lights === 1 ? 'Lights on' : 'Lights off', manual: man.has('lights') },
    },
    blocks: blocks !== null ? `${U.nf(blocks)} blocks` : '', core: num(r.core) !== null ? `Core ${r.core.toFixed(1)} °C` : '',
    co2Rate: blocks !== null ? clamp01(blocks / 2000) : 0,
    stage: lv.stage || null, codes,
  };
}

// ---------------- The drawing ----------------
function markup(p) {
  return `
    <svg class="mimic-svg" viewBox="0 0 1000 420" role="img" aria-labelledby="${p}mimicTitle ${p}mimicDesc">
      <title id="${p}mimicTitle">Room schematic</title>
      <desc id="${p}mimicDesc">View of a mushroom room: the growing rack, the three sensors, the air conditioner, the fogger, the circulation fan, and the air exchange (a filtered intake fan and an exhaust fan; their dampers close when they are off).</desc>
      <defs>
        <pattern id="${p}hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect class="hatch-bg" width="7" height="7"/><line class="hatch-line" x1="0" y1="0" x2="0" y2="7"/>
        </pattern>
        <marker id="${p}arAc" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="arrowhead ac" d="M0 0 L10 5 L0 10 z"/></marker>
        <marker id="${p}arFan" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="arrowhead fan" d="M0 0 L10 5 L0 10 z"/></marker>
      </defs>
      <text x="12" y="26" class="m-eyebrow" id="${p}mOutEye">OUTDOOR · OT-104</text>
      <text x="12" y="54" class="m-big" id="${p}mOutT">32.0 °C</text>
      <text x="12" y="76" class="m-small" id="${p}mOutRH">60 % RH</text>
      <g id="${p}mSun" transform="translate(110 72)"><circle class="sun" r="5"/>
        <path class="sun" d="M0,-8.5V-7 M0,7V8.5 M-8.5,0H-7 M7,0H8.5 M-6,-6L-5,-5 M5,5L6,6 M-6,6L-5,5 M5,-5L6,-6"/></g>
      <g id="${p}mMoon" transform="translate(110 72)"><circle class="moon" r="6.5"/><circle class="moon-cut" cx="3.6" cy="-2.4" r="5.4"/></g>
      <text x="124" y="76" class="m-small" id="${p}mSkyTxt">Day</text>
      <text x="994" y="26" text-anchor="end" class="m-eyebrow" id="${p}mTitle"></text>
      <text x="994" y="84" text-anchor="end" class="m-small" id="${p}mNote"></text>
      <text x="520" y="26" class="m-eyebrow" id="${p}mRoomName"></text>
      <text x="520" y="48" class="m-small" id="${p}mAch"></text>
      <text x="520" y="66" class="m-small" id="${p}mPowerNow"></text>
      <line class="ground" x1="0" y1="412" x2="1000" y2="412"/>
      <rect class="wall" fill="url(#${p}hatch)" x="176" y="92" width="648" height="320"/>
      <rect class="room" x="184" y="100" width="632" height="312"/>
      <g id="${p}condenser">
        <rect class="unit" x="290" y="30" width="80" height="58" rx="4"/>
        <circle class="ring" cx="330" cy="59" r="22"/>
        <g transform="translate(330 59)"><g id="${p}condBlades">
          <path class="blade" d="M0,-3 C7,-6 15,-4 18,0 C14,3 6,3 0,3 Z"/>
          <path class="blade" d="M0,-3 C7,-6 15,-4 18,0 C14,3 6,3 0,3 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-3 C7,-6 15,-4 18,0 C14,3 6,3 0,3 Z" transform="rotate(240)"/>
        </g><circle r="3.5" class="blade"/></g>
        <text x="380" y="54" class="m-small">Condenser</text>
        <text x="380" y="70" class="m-small" id="${p}mCondState">Idle</text>
      </g>
      <path class="pipe" d="M346 88 V108"/>
      <path class="pipe" d="M356 88 V108"/>
      <g class="lamp-g" id="${p}lamp">
        <rect class="lamp" x="470" y="100" width="64" height="6" rx="2"/>
        <path class="lamp-ray" d="M480,110 L474,118 M502,110 V120 M524,110 L530,118"/>
        <text x="502" y="136" text-anchor="middle" class="m-small" id="${p}mLamp">Lights off</text>
      </g>
      <g id="${p}acUnit">
        <rect class="unit" x="250" y="108" width="196" height="58" rx="6"/>
        <rect class="keybar ac" x="250" y="108" width="6" height="58" rx="2"/>
        <text x="266" y="126" class="m-tag" id="${p}mAcTag">ACU-201</text>
        <text x="266" y="142" class="m-small" id="${p}mAcState">Off</text>
        <text x="266" y="158" class="m-small" id="${p}mAcPower">0 W</text>
      </g>
      <path class="flow ac" data-flow="ac" d="M280 172 C282 205, 270 228, 256 248" marker-end="url(#${p}arAc)"/>
      <path class="flow ac" data-flow="ac" d="M340 172 C342 210, 330 236, 316 256" marker-end="url(#${p}arAc)"/>
      <path class="flow ac" data-flow="ac" d="M400 172 C402 210, 392 238, 380 258" marker-end="url(#${p}arAc)"/>
      <g id="${p}circUnit" transform="translate(720 150)">
        <circle class="unit" r="20"/>
        <g id="${p}circBlades">
          <path class="blade" d="M0,-2.5 C6,-5 12,-4 15,0 C12,2.5 5,2.5 0,2.5 Z"/>
          <path class="blade" d="M0,-2.5 C6,-5 12,-4 15,0 C12,2.5 5,2.5 0,2.5 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-2.5 C6,-5 12,-4 15,0 C12,2.5 5,2.5 0,2.5 Z" transform="rotate(240)"/>
        </g><circle r="3" class="blade"/>
      </g>
      <text x="720" y="188" text-anchor="middle" class="m-tag" id="${p}mCircTag">CF-205</text>
      <text x="720" y="204" text-anchor="middle" class="m-small" id="${p}mCircState">Off</text>
      <g id="${p}sensors">
        <g id="${p}sensorCodes">
        <line class="leader" x1="490" x2="500" y1="196" y2="196"/>
        <line class="leader" x1="490" x2="500" y1="246" y2="246"/>
        <line class="leader" x1="490" x2="500" y1="296" y2="296"/>
        <circle class="bubble-tag" cx="470" cy="196" r="20"/><text x="470" y="194" text-anchor="middle" class="m-tag" style="font-size:11px">TT</text><text x="470" y="207" text-anchor="middle" style="font-size:11px">101</text>
        <circle class="bubble-tag" cx="470" cy="246" r="20"/><text x="470" y="244" text-anchor="middle" class="m-tag" style="font-size:11px">MT</text><text x="470" y="257" text-anchor="middle" style="font-size:11px">102</text>
        <circle class="bubble-tag" cx="470" cy="296" r="20"/><text x="470" y="294" text-anchor="middle" class="m-tag" style="font-size:11px">AT</text><text x="470" y="307" text-anchor="middle" style="font-size:11px">103</text>
        </g>
        <g class="readout" id="${p}mT"><rect x="500" y="176" width="156" height="40" rx="4"/><text class="val" x="510" y="195">--</text><text class="ico" x="646" y="194" text-anchor="end"></text><text class="zn" x="510" y="210"></text></g>
        <g class="readout" id="${p}mRH"><rect x="500" y="226" width="156" height="40" rx="4"/><text class="val" x="510" y="245">--</text><text class="ico" x="646" y="244" text-anchor="end"></text><text class="zn" x="510" y="260"></text></g>
        <g class="readout" id="${p}mC"><rect x="500" y="276" width="156" height="40" rx="4"/><text class="val" x="510" y="295">--</text><text class="ico" x="646" y="294" text-anchor="end"></text><text class="zn" x="510" y="310"></text></g>
      </g>
      <g id="${p}fanIn">
        <rect class="unit" x="-40" y="-40" width="80" height="80" rx="6"/>
        <rect class="keybar fan" x="-40" y="34" width="80" height="6" rx="2"/>
        <circle class="ring" r="31"/>
        <g id="${p}fanInBlades">
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(240)"/>
        </g><circle r="5" class="blade"/>
        <rect class="damper" x="-3" y="-36" width="6" height="72" rx="2"/>
      </g>
      <g id="${p}fanOut">
        <rect class="unit" x="-40" y="-40" width="80" height="80" rx="6"/>
        <rect class="keybar fan" x="-40" y="34" width="80" height="6" rx="2"/>
        <circle class="ring" r="31"/>
        <g id="${p}fanOutBlades">
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(240)"/>
        </g><circle r="5" class="blade"/>
        <rect class="damper" x="-3" y="-36" width="6" height="72" rx="2"/>
      </g>
      <g class="m-manual" id="${p}manAc" transform="translate(378 112)" display="none"><rect width="60" height="16" rx="8"/><text x="30" y="12" text-anchor="middle">MANUAL</text></g>
      <g class="m-manual" id="${p}manLights" transform="translate(538 96)" display="none"><rect width="60" height="16" rx="8"/><text x="30" y="12" text-anchor="middle">MANUAL</text></g>
      <g class="m-manual" id="${p}manCirc" transform="translate(690 110)" display="none"><rect width="60" height="16" rx="8"/><text x="30" y="12" text-anchor="middle">MANUAL</text></g>
      <g class="m-manual" id="${p}manHu" transform="translate(620 396)" display="none"><rect width="60" height="16" rx="8"/><text x="30" y="12" text-anchor="middle">MANUAL</text></g>
      <g id="${p}ventFlows"></g>
      <g id="${p}ventText"></g>
      <g id="${p}ventManual"></g>
      <g id="${p}mist"></g>
      <g id="${p}huUnit">
        <rect class="unit" x="712" y="326" width="20" height="12" rx="3"/>
        <rect class="unit body" x="690" y="336" width="64" height="76" rx="8"/>
        <rect class="keybar hu" x="690" y="336" width="64" height="6" rx="2"/>
        <rect class="tank" x="700" y="370" width="44" height="30" rx="3"/>
      </g>
      <text x="680" y="356" text-anchor="end" class="m-tag" id="${p}mHuTag">HU-202</text>
      <text x="680" y="373" text-anchor="end" class="m-small" id="${p}mHuState">Off</text>
      <text x="680" y="390" text-anchor="end" class="m-small" id="${p}mHuPower">0 W</text>
      <g id="${p}bubbles"></g>
      <g id="${p}rack">
        <line class="post" x1="240" x2="240" y1="312" y2="412"/>
        <line class="post" x1="394" x2="394" y1="312" y2="412"/>
        <line class="shelf" x1="238" x2="396" y1="362" y2="362"/>
        <g id="${p}bags"></g>
      </g>
      <text x="404" y="356" class="m-tag">Growing blocks</text>
      <text x="404" y="373" class="m-small" id="${p}mCo2Src">2,000 blocks</text>
      <text x="404" y="390" class="m-small" id="${p}mCore">Core -- °C</text>
    </svg>`;

}


function create(host, opts) {
  const p = (opts && opts.idPrefix) || '', UI = ui();
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  host.insertAdjacentHTML('beforeend', markup(p));
  const svg = host.lastElementChild;
  const q = id => svg.querySelector('#' + p + id);
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const putId = (id, text) => put(q(id), text);
  const ids = ['mTitle', 'mNote', 'mRoomName', 'mAch', 'mPowerNow', 'mOutEye', 'mOutT', 'mOutRH', 'mSkyTxt', 'mLamp', 'mAcTag', 'mAcState', 'mAcPower', 'mCondState',
    'mCircTag', 'mCircState', 'mHuTag', 'mHuState', 'mHuPower', 'mCo2Src', 'mCore', 'mSun', 'mMoon', 'sensorCodes', 'lamp', 'acUnit', 'condenser', 'huUnit', 'circUnit',
    'fanIn', 'fanOut', 'fanInBlades', 'fanOutBlades', 'condBlades', 'circBlades', 'mist', 'bubbles', 'bags', 'ventFlows', 'ventText', 'ventManual', 'mT', 'mRH', 'mC',
    'manAc', 'manHu', 'manCirc', 'manLights'];
  const e = {};
  for (const id of ids) e[id] = q(id);

  const mist = [], bubbles = [], caps = [];
  for (let i = 0; i < 16; i++) mist.push({ ph: i / 16, dx: (Math.random() - 0.5) * 14, elm: UI.svgEl('circle', { class: 'mist', r: 3 }, e.mist) });
  for (let i = 0; i < 14; i++) bubbles.push({ ph: i / 14, dx: Math.random() * 136, elm: UI.svgEl('circle', { class: 'bubble', r: 2.5 }, e.bubbles) });
  for (const y0 of [324, 374]) for (let i = 0; i < 5; i++) {
    const x = 246 + i * 29;
    UI.svgEl('rect', { class: 'bag', x, y: y0, width: 24, height: 36, rx: 7 }, e.bags);
    for (const [cx, cy, side] of [[x + 2, y0 + 12, -1], [x + 22, y0 + 24, 1]]) {
      const outer = UI.svgEl('g', { transform: `translate(${cx} ${cy})` }, e.bags);
      const c = UI.svgEl('g', { class: 'cap' }, outer);
      UI.svgEl('ellipse', { cx: 3 * side, cy: 0, rx: 7, ry: 3.6 }, c);
      UI.svgEl('ellipse', { cx: 2 * side, cy: 5, rx: 5, ry: 2.8 }, c);
      caps.push(c);
    }
  }
  const acFlows = [...svg.querySelectorAll('[data-flow="ac"]')];
  let fanFlows = [], ventKey = '', v = view(null);
  const anim = { fan: 0, cond: 0, circ: 0, acFlow: 0, fanFlow: 0 };
  const mansVent = {};

  // Places the intake fan, the exhaust fan, their arrows and texts for the positions (on a change only).
  function layoutVents() {
    const key = `${v.inlet.band}|${v.outlet.band}|${v.codes}`;
    if (key === ventKey) return;
    ventKey = key;
    e.ventFlows.replaceChildren(); e.ventText.replaceChildren(); e.ventManual.replaceChildren();
    for (const side of ['inlet', 'outlet']) {
      const o = v[side], y = VENT_Y[o.band], left = side === 'inlet';
      (left ? e.fanIn : e.fanOut).setAttribute('transform', `translate(${left ? 180 : 820} ${y})`);
      const [x1, x2] = left ? [60, 134] : [866, 990];
      for (const d of [-18, 0, 18]) UI.svgEl('path', { class: 'flow fan', 'data-flow': 'fan', d: `M${x1} ${y + d} H${x2}`, 'marker-end': `url(#${p}arFan)` }, e.ventFlows);
      const lines = [['m-tag', 'tag', 0], ['m-small', 'state', 17]];
      if (o.label) lines.push(['m-small', 'label', 17]);
      let ty = o.band === 'high' ? 226 : 300 - lines.reduce((h, l) => h + l[2], 0);
      for (const [cls, k, gap] of lines) {
        ty += gap;
        const t = UI.svgEl('text', { x: left ? 12 : 836, y: ty, class: cls }, e.ventText);
        t.dataset.k = k; t.dataset.side = side; t.textContent = o[k];
      }
      const m = UI.svgEl('g', { class: 'm-manual', transform: `translate(${(left ? 180 : 820) - 30} ${y + (o.band === 'low' ? 44 : -58)})`, display: 'none' }, e.ventManual);
      UI.svgEl('rect', { width: 60, height: 16, rx: 8 }, m);
      UI.svgEl('text', { x: 30, y: 12, 'text-anchor': 'middle' }, m).textContent = 'MANUAL';
      mansVent[side] = m;
    }
    fanFlows = [...e.ventFlows.querySelectorAll('[data-flow="fan"]')];
  }

  // Applies the animation state; dt > 0 moves it on (tick), dt 0 only redraws the current pose (paint).
  function frame(dt) {
    const move = dt > 0;
    if (move) {
      anim.fan = (anim.fan + 1080 * v.fanF * dt) % 360;
      anim.cond = (anim.cond + 720 * (v.comp ? 0.3 + v.acRun : 0) * dt) % 360;
      anim.circ = (anim.circ + 900 * v.circF * dt) % 360;
      anim.acFlow -= dt * 40 * (0.5 + v.acRun);
      anim.fanFlow -= dt * 60 * (0.3 + v.fanF);
    }
    const fanRot = `rotate(${anim.fan.toFixed(1)})`;
    e.fanInBlades.setAttribute('transform', fanRot);
    e.fanOutBlades.setAttribute('transform', fanRot);
    e.condBlades.setAttribute('transform', `rotate(${anim.cond.toFixed(1)})`);
    e.circBlades.setAttribute('transform', `rotate(${anim.circ.toFixed(1)})`);
    for (const f of acFlows) { f.style.opacity = !v.powered ? 0 : v.comp ? 0.35 + 0.65 * v.acRun : 0.2; f.style.strokeDashoffset = anim.acFlow; }
    for (const f of fanFlows) { f.style.opacity = v.fanF > 0 ? 0.35 + 0.65 * v.fanF : 0; f.style.strokeDashoffset = anim.fanFlow; }
    for (const m of mist) {
      if (move) { m.ph += dt * (0.25 + 0.5 * v.fogF); if (m.ph > 1) { m.ph -= 1; m.dx = (Math.random() - 0.5) * 14; } }
      m.elm.setAttribute('cx', (722 + m.dx + Math.sin(m.ph * 7 + m.dx) * 4).toFixed(1));
      m.elm.setAttribute('cy', (322 - m.ph * 80).toFixed(1));
      m.elm.setAttribute('r', (2.5 + m.ph * 6).toFixed(1));
      m.elm.style.opacity = (v.fogF * (1 - m.ph) * 0.7).toFixed(2);
    }
    const lpm = v.co2Rate * 3;
    for (const b of bubbles) {
      if (move) { b.ph += dt * (0.3 + 0.1 * lpm); if (b.ph > 1) { b.ph -= 1; b.dx = Math.random() * 136; } }
      b.elm.setAttribute('cx', (249 + b.dx + Math.sin(b.ph * 9 + b.dx) * 3).toFixed(1));
      b.elm.setAttribute('cy', (318 - b.ph * 46).toFixed(1));
      b.elm.style.opacity = (v.co2Rate * (1 - b.ph)).toFixed(2);
    }
  }

  function paint(state) {
    v = view(state);
    putId('mTitle', v.title); putId('mNote', v.note); putId('mRoomName', v.roomLine); putId('mAch', v.airLine); putId('mPowerNow', v.powerLine);
    putId('mOutEye', v.outEye); putId('mOutT', v.outT); putId('mOutRH', v.outRH); putId('mSkyTxt', v.sky);
    e.mSun.style.display = v.night ? 'none' : ''; e.mMoon.style.display = v.night ? '' : 'none';
    e.sensorCodes.style.display = v.codes ? '' : 'none';
    for (const id of ['mT', 'mRH', 'mC']) {
      const g = e[id], r = v.readouts[id];
      g.dataset.lvl = r.lvl;
      put(g.querySelector('.val'), r.val); put(g.querySelector('.ico'), r.ico); put(g.querySelector('.zn'), r.zn);
    }
    putId('mAcTag', v.acTag); putId('mAcState', v.acState); putId('mAcPower', v.acSub); putId('mCondState', v.condState);
    putId('mHuTag', v.huTag); putId('mHuState', v.huState); putId('mHuPower', v.huSub);
    putId('mCircTag', v.circTag); putId('mCircState', v.circState); putId('mLamp', v.lampText);
    layoutVents();
    for (const t of e.ventText.children) put(t, v[t.dataset.side][t.dataset.k]);
    putId('mCo2Src', v.blocks); e.mCo2Src.style.display = v.blocks ? '' : 'none'; putId('mCore', v.core || 'Core -- °C');
    e.acUnit.classList.toggle('on', v.on.ac); e.condenser.classList.toggle('on', v.on.cond); e.huUnit.classList.toggle('on', v.on.hu);
    e.fanIn.classList.toggle('on', v.on.air); e.fanOut.classList.toggle('on', v.on.air);
    e.circUnit.classList.toggle('on', v.on.circ); e.lamp.classList.toggle('on', v.on.lights);
    const show = (g, on) => { g.setAttribute('display', on ? 'inline' : 'none'); };
    show(e.manAc, v.manual.ac); show(e.manHu, v.manual.hu); show(e.manCirc, v.manual.circ); show(e.manLights, v.manual.lights);
    for (const m of Object.values(mansVent)) show(m, v.manual.air);
    for (const c of caps) c.style.transform = `scale(${v.capScale})`;
    frame(0);
  }

  function tick(dt) {
    if ((reduced && reduced.matches) || !(dt > 0)) return;
    frame(dt);
  }
  function destroy() { svg.remove(); }

  paint(null);
  return { paint, tick, destroy };
}

global.FarmMimic = { create, layout, fromReading, view };
})(typeof window !== 'undefined' ? window : globalThis);
