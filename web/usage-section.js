// The "Electricity and water" section of the Charts tab (spec 2026-10-26-usage-charts-design.md section 1): under the T, RH
// and CO₂ charts, following the tab's range. A history range: the totals line and two bar charts, kWh and litres per history
// bucket (metered bars solid, estimated ones hatched like the Energy card's days). Live: the meter's power as a line when the
// room has a meter.

import { OFFLINE } from './api.js';
import { drawLineChart } from './chart.js';
import { drawTimeBars } from './bar-chart.js';
import { meterCard } from './ratings-math.js';
import { timeTicks, tickCountFor, formatStamp } from './history-math.js';
import {
  LIVE_NO_METER, LIVE_WATER, bucketWord, usageTotalsLine, usageBars, usageTip, usageSummary, livePowerPoints,
} from './usage-chart-math.js';

const ENERGY_COLOR = 'var(--s-co2)'; // the Energy card's colours
const WATER_COLOR = 'var(--s-rh)';

function text(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// host: the section element. onCursor(at|null): the pointer's time, for the shared time line of the other charts.
// Returns { update({ hist, sensors, price }), setCursor(at|null), destroy() }; hist is the range's history (null: Live).
export function createUsageSection(host, { onCursor }) {
  host.replaceChildren();
  host.append(text('h2', '', 'Electricity and water'));
  const totals = text('p', 'usage-totals');
  const totalsText = text('span');
  const basis = text('span', 'us-basis');
  totals.append(totalsText, basis);
  host.append(totals);
  const part = () => {
    const box = text('div', 'usage-chart');
    const title = text('h3');
    const none = text('p', 'none');
    const chartHost = text('div', 'chart-host');
    box.append(title, none, chartHost);
    host.append(box);
    return { title, none, host: chartHost, chart: null, kind: null };
  };
  const energy = part();
  const water = part();

  // Shows one chart of a part (kind 'line' or 'bars'), or its message when opts is null.
  function show(p, kind, opts, message) {
    p.none.hidden = opts !== null;
    p.none.textContent = message ?? '';
    p.host.hidden = opts === null;
    if (opts === null || p.kind !== kind) {
      p.chart?.destroy();
      p.chart = null;
      p.kind = null;
    }
    if (opts === null) return;
    if (p.chart) p.chart.update(opts);
    else {
      p.chart = kind === 'line' ? drawLineChart(p.host, opts) : drawTimeBars(p.host, opts);
      p.kind = kind;
    }
  }

  function update({ hist, sensors, price }) {
    const data = hist?.data ?? null;
    if (!hist) { // Live
      totals.hidden = true;
      energy.title.textContent = 'Power (W)';
      water.title.textContent = 'Water (L)';
      const meter = meterCard(sensors.meter);
      const points = meter ? livePowerPoints(sensors.meter) : [];
      const opts = points.some((p) => p.value !== null)
        ? { points, unit: 'W', label: 'Power', color: ENERGY_COLOR, digits: 0, minSpan: 50, bounds: [0, Infinity] } : null;
      show(energy, 'line', opts, meter ? 'No meter readings yet' : LIVE_NO_METER);
      show(water, 'bars', null, LIVE_WATER);
      return;
    }
    const usage = data?.usage ?? null;
    const word = data ? bucketWord(data.bucketS) : '';
    energy.title.textContent = data ? `Electricity (kWh per ${word})` : 'Electricity (kWh)';
    water.title.textContent = data ? `Water (L per ${word})` : 'Water (L)';
    const line = usageTotalsLine(usage, price);
    totals.hidden = line === null;
    if (line) {
      totalsText.textContent = line.text;
      basis.textContent = line.basis;
    }
    if (!data || !line) {
      const message = !data ? (hist.failed ? OFFLINE : 'Loading…') : 'Usage is not available on this server';
      show(energy, 'bars', null, message);
      show(water, 'bars', null, message);
      return;
    }
    const range = { from: data.from, to: data.to };
    const common = { range, ticksFor: (w) => timeTicks(range.from, range.to, tickCountFor(w)), onCursor };
    const formatAt = (ms) => formatStamp(ms);
    const kwhBars = usageBars(usage, 'kWh', data.bucketS, range);
    const waterBars = usageBars(usage, 'waterL', data.bucketS, range);
    show(energy, 'bars', {
      ...common, bars: kwhBars, color: ENERGY_COLOR, hatch: !usage.metered,
      label: usageSummary(kwhBars, { title: `Electricity per ${word}`, unit: 'kWh', metered: usage.metered, formatAt }),
      tip: (bar) => usageTip(bar, { unit: 'kWh', metered: usage.metered, formatAt }),
    });
    show(water, 'bars', {
      ...common, bars: waterBars, color: WATER_COLOR, hatch: false,
      label: usageSummary(waterBars, { title: `Water per ${word}`, unit: 'L', formatAt }),
      tip: (bar) => usageTip(bar, { unit: 'L', formatAt }),
    });
  }

  return {
    update,
    setCursor(at) {
      if (energy.kind === 'bars') energy.chart?.setCursor(at);
      if (water.kind === 'bars') water.chart?.setCursor(at);
    },
    destroy() {
      energy.chart?.destroy();
      water.chart?.destroy();
      host.replaceChildren();
    },
  };
}
