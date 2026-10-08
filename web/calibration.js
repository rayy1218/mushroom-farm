// web/calibration.js: today's calibration card, moved from the old dashboard script (docs/contracts/web.md C5 3.2, 3.3).
// Wave 1: uses FarmBench (the Simulator's live env), as the brief for this wave requires. Wave 2 (C5 3.6) builds
// its own envBase from a room's data and stops using FarmBench.
(function (global) {
'use strict';

const CAL = global.ClimateCalib;
const UI = global.FarmUi;

let calRows = null, calFit = null, calBase = null;
let mounted = false, el = null, mountGen = 0;

function calParamsNow() { return CAL.paramsOf(global.FarmBench.env); }

function calRender() {
  const now = calParamsNow(), fitP = calFit && calFit.params;
  el.querySelector('#calParams').replaceChildren(...Object.entries(CAL.PARAMS).map(([k, P]) => {
    const tr = document.createElement('tr');
    tr.append(UI.cell('td', P.label), UI.cell('td', now[k].toFixed(k === 'infAch' ? 2 : 1)), UI.cell('td', fitP ? fitP[k].toFixed(k === 'infAch' ? 2 : 1) : '–'));
    return tr;
  }));
  const fe = x => `${x.rmse.T.toFixed(2)} °C / ${x.rmse.RH.toFixed(1)} % / ${x.rmse.CO2.toFixed(0)} ppm`;
  UI.set('calErr0', calBase ? fe(calBase) : '–');
  UI.set('calErr1', calFit ? fe(calFit.result) : '–');
  const host = el.querySelector('#calCharts');
  if (!calRows || !calBase) { host.replaceChildren(); return; }
  global.FarmCharts.drawCalibCharts(host, { rows: calRows, base: calBase, fit: calFit });
}
function calLoad(rows, label) {
  calRows = rows; calFit = null;
  try { calBase = CAL.replay(calRows, global.FarmBench.env, calParamsNow()); }
  catch (err) { UI.set('calMsg', err.message); return; }
  el.querySelector('#calFit').disabled = false; el.querySelector('#calApply').disabled = true;
  UI.set('calMsg', `${label}: ${rows.length} rows, ${(rows[rows.length - 1].t / 3600).toFixed(1)} h.`);
  calRender();
}

const MARKUP = `
<section class="card sim calib" aria-labelledby="hCal">
  <div class="rules-head">
    <h2 id="hCal">Calibration with a farm log</h2>
    <span class="tag">Make the simulation agree with your room. The log must have the machine states at 1 min or less. With a supply fan that always runs, the air leakage cannot be measured (it also has no effect).</span>
  </div>
  <div class="cal-row">
    <label class="btn" for="calFile">Load a CSV log</label><input type="file" id="calFile" accept=".csv,text/csv" class="vh">
    <button class="btn" id="calFit" disabled>Fit the room values</button>
    <button class="btn" id="calApply" disabled>Use the fitted values</button>
    <span class="tag" id="calMsg">No log loaded.</span>
  </div>
  <div class="cal-grid">
    <table><thead><tr><th>Room value</th><th>Now</th><th>Fitted</th></tr></thead><tbody id="calParams"></tbody>
      <tfoot><tr><td>Error T / RH / CO₂</td><td id="calErr0">–</td><td id="calErr1">–</td></tr></tfoot></table>
    <div id="calCharts" class="cal-charts"></div>
  </div>
  <details class="measure">
    <summary>CSV columns</summary>
    <p>Header row, then one row per minute (or less). Columns in any order: <b>time</b> (date and time, or minutes from the start), <b>T</b>, <b>RH</b>, <b>CO2</b>, tOut, rhOut, fan (0–3), fog (0–3), acPower (0/1), acMode (cool/heat/dry/fan), acSet (°C), acFan (low/auto/high), lights (0/1), circ (0/1, circulation fan). Columns in bold are necessary.</p>
  </details>
</section>`;

function mount(viewEl) {
  mounted = true; el = viewEl; mountGen++;
  const myGen = mountGen;
  const stale = () => !mounted || myGen !== mountGen;
  calRows = null; calFit = null; calBase = null;
  el.innerHTML = MARKUP;

  el.querySelector('#calFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      if (stale()) return;
      try { calLoad(CAL.parseCsv(txt), f.name); } catch (err) { UI.set('calMsg', `The file cannot be used: ${err.message}`); }
    }).catch(err => { if (!stale()) UI.set('calMsg', `The file cannot be read: ${err && err.message}`); });
  });
  el.querySelector('#calFit').addEventListener('click', e => {
    const btn = e.target; btn.disabled = true; UI.set('calMsg', 'Fitting… (this takes a few seconds)');
    CAL.fitAsync(calRows, global.FarmBench.env, calParamsNow(), p => { if (!stale()) UI.set('calMsg', `Fitting: run ${p.evals} of up to ${p.maxEval}, error score ${p.score.toFixed(2)}…`); }).then(res => {
      if (stale()) return;
      calFit = res;
      btn.disabled = false; el.querySelector('#calApply').disabled = false;
      UI.set('calMsg', `Fit done after ${calFit.evals} simulation runs. The air leakage is the least certain value.`);
      calRender();
    }).catch(err => {
      if (!stale()) { UI.set('calMsg', `The fit stopped: ${err && err.message}`); btn.disabled = false; }
    });
  });
  el.querySelector('#calApply').addEventListener('click', () => {
    if (!calFit) return;
    global.FarmBench.applyCalib(calFit.params, calFit.result.rmse);
    calBase = CAL.replay(calRows, global.FarmBench.env, calParamsNow()); calFit = null;
    el.querySelector('#calApply').disabled = true;
    UI.set('calMsg', 'The simulation now uses the fitted values.'); calRender();
  });

  calRender();
}
function unmount() { mounted = false; el = null; }

global.FarmShell.register('calibration', { mount, unmount });
})(typeof window !== 'undefined' ? window : globalThis);
