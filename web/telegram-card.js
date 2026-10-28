// The "Phone alarms (Telegram)" card of the Settings page: its own form and Save, and a Send test message button.

import { request, OFFLINE } from './api.js';
import { LEVELS, tokenHint, buildTelegramBody, testBody, statusLines, cardValues, parseChatId } from './telegram-math.js';

const COMMAND_TIMEOUT = 15000;
const TEST_TIMEOUT = 20000; // the server gives up on Telegram after 15 s and says so first

const TEMPLATE = `
  <div class="banner" role="alert" data-tg-banner hidden>
    <span data-tg-banner-text></span>
    <button type="button" data-tg-retry>Retry</button>
  </div>
  <form class="card settings telegram" data-tg-form novalidate hidden>
    <h2>Phone alarms (Telegram)</h2>
    <ol class="s-hint tg-steps">
      <li>In Telegram, talk to <strong>@BotFather</strong>, send <code>/newbot</code> and copy the bot's token.</li>
      <li>Open your new bot and send it any message (for a group, add the bot to the group and write there).</li>
      <li>Find the chat id: message <strong>@userinfobot</strong>, or open <code>https://api.telegram.org/bot&lt;token&gt;/getUpdates</code> and look for <code>"chat":{"id":…}</code>.</li>
    </ol>
    <div class="field">
      <label for="f-telegramToken">Bot token</label>
      <input id="f-telegramToken" name="telegramToken" type="password" autocomplete="off" spellcheck="false" aria-describedby="e-telegramToken s-tg-token">
      <p class="field-error" id="e-telegramToken" role="status"></p>
    </div>
    <p class="muted s-hint" id="s-tg-token"><span data-tg-token-hint></span></p>
    <p class="tg-clear-row"><button type="button" class="danger-text" data-tg-clear hidden>Clear token</button></p>
    <div class="field">
      <label for="f-telegramChatId">Chat id</label>
      <input id="f-telegramChatId" name="telegramChatId" type="text" autocomplete="off" spellcheck="false" placeholder="-1001234567890 or @name" aria-describedby="e-telegramChatId">
      <p class="field-error" id="e-telegramChatId" role="status"></p>
    </div>
    <fieldset class="tg-levels">
      <legend>Send a message for</legend>
      ${LEVELS.map((l) => `<label class="tg-check"><input type="checkbox" name="telegramLevels" value="${l.key}"> ${l.label} alarms</label>`).join('')}
    </fieldset>
    <label class="tg-check"><input type="checkbox" name="telegramCleared"> Also tell me when an alarm clears</label>
    <div class="field">
      <label for="f-telegramRepeatMin">Repeat a critical alarm every (minutes)</label>
      <input id="f-telegramRepeatMin" name="telegramRepeatMin" type="number" min="0" max="1440" step="1" inputmode="numeric" aria-describedby="e-telegramRepeatMin s-tg-repeat">
      <p class="field-error" id="e-telegramRepeatMin" role="status"></p>
    </div>
    <p class="muted s-hint" id="s-tg-repeat">While a critical alarm is on and not acknowledged. 0 for no repeat.</p>
    <div class="ac-send">
      <button type="submit" class="primary" data-tg-save>Save</button>
      <button type="button" data-tg-test>Send test message</button>
    </div>
    <p class="s-saved" data-tg-saved role="status" hidden></p>
    <p class="tg-test" data-tg-result role="status" hidden></p>
    <p class="muted s-hint tg-status"><span data-tg-sent></span> <span class="field-error" data-tg-error></span></p>
  </form>`;

export function mountTelegram(container) {
  let alive = true;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const form = q('[data-tg-form]');
  const inputs = {
    telegramToken: q('#f-telegramToken'), telegramChatId: q('#f-telegramChatId'), telegramRepeatMin: q('#f-telegramRepeatMin'),
  };
  const errs = Object.fromEntries(Object.keys(inputs).map((k) => [k, q(`#e-${k}`)]));
  const levelBoxes = [...form.querySelectorAll('input[name="telegramLevels"]')];
  const cleared = form.querySelector('input[name="telegramCleared"]');
  const save = q('[data-tg-save]');
  const test = q('[data-tg-test]');
  const clear = q('[data-tg-clear]');
  const saved = q('[data-tg-saved]');
  const result = q('[data-tg-result]');
  const banner = q('[data-tg-banner]');
  const bannerText = q('[data-tg-banner-text]');
  q('[data-tg-retry]').addEventListener('click', () => load());
  let last = null;

  function setError(name, text) {
    errs[name].textContent = text;
    if (text) inputs[name].setAttribute('aria-invalid', 'true');
    else inputs[name].removeAttribute('aria-invalid');
  }
  const clearErrors = () => { for (const name of Object.keys(inputs)) setError(name, ''); };
  const read = () => ({
    token: inputs.telegramToken.value, chatId: inputs.telegramChatId.value, repeat: inputs.telegramRepeatMin.value,
    levels: levelBoxes.filter((b) => b.checked).map((b) => b.value), cleared: cleared.checked,
  });

  function paint(settings, { keepTyped = false } = {}) {
    last = settings;
    const v = cardValues(settings);
    if (!keepTyped) {
      inputs.telegramChatId.value = v.chatId;
      // A saved chat id that cannot reach anyone (a bot's own name) is said at once, not only on the next Save.
      const bad = parseChatId(v.chatId).error ?? '';
      const err = q('#e-telegramChatId');
      if (err.textContent !== bad) err.textContent = bad;
      if (bad) inputs.telegramChatId.setAttribute('aria-invalid', 'true');
      else inputs.telegramChatId.removeAttribute('aria-invalid');
      inputs.telegramRepeatMin.value = v.repeat;
      for (const b of levelBoxes) b.checked = v.levels.includes(b.value);
      cleared.checked = v.cleared;
    }
    inputs.telegramToken.value = '';
    q('[data-tg-token-hint]').textContent = tokenHint(settings);
    clear.hidden = !settings.telegramTokenSet;
    paintStatus(settings);
  }
  function paintStatus(settings) {
    const s = statusLines(settings);
    q('[data-tg-sent]').textContent = s.sent;
    q('[data-tg-error]').textContent = s.error;
  }

  async function load() {
    banner.hidden = true;
    try {
      const data = await request('GET', '/api/settings');
      if (!alive) return;
      paint(data);
      form.hidden = false;
    } catch (err) {
      if (!alive) return;
      bannerText.textContent = `Phone alarms: ${err.status === 0 ? OFFLINE : err.message}`;
      banner.hidden = false;
    }
  }

  async function put(body, buttons) {
    clearErrors();
    saved.hidden = true;
    for (const b of buttons) b.disabled = true;
    try {
      const data = await request('PUT', '/api/settings', body, COMMAND_TIMEOUT);
      if (!alive) return;
      paint(data);
      saved.textContent = 'Saved';
      saved.hidden = false;
    } catch (err) {
      if (!alive) return;
      if (err.status === 400 && Object.hasOwn(inputs, err.field)) {
        setError(err.field, err.message);
        inputs[err.field].focus();
      } else {
        setError('telegramChatId', err.status === 0 ? `${OFFLINE}. Try again.` : err.message);
      }
    } finally {
      for (const b of buttons) b.disabled = false;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    const built = buildTelegramBody(read());
    if (built.errors) {
      const names = Object.keys(built.errors);
      for (const n of names) setError(n, built.errors[n]);
      inputs[names[0]].focus();
      return;
    }
    await put(built.body, [save, test, clear]);
  });

  clear.addEventListener('click', () => put({ telegramToken: '' }, [save, test, clear]));

  test.addEventListener('click', async () => {
    clearErrors();
    result.hidden = true;
    const typed = testBody(read());
    if (typed.errors) {
      const [name] = Object.keys(typed.errors);
      setError(name, typed.errors[name]);
      inputs[name].focus();
      return;
    }
    test.disabled = true;
    result.className = 'tg-test';
    result.textContent = 'Sending…';
    result.hidden = false;
    try {
      await request('POST', '/api/settings/telegram/test', typed.body, TEST_TIMEOUT);
      if (!alive) return;
      result.textContent = 'Test message sent. Check Telegram.';
      result.className = 'tg-test s-saved';
    } catch (err) {
      if (!alive) return;
      if (err.status === 400 && Object.hasOwn(inputs, err.field)) {
        result.hidden = true;
        setError(err.field, err.message);
        inputs[err.field].focus();
      } else {
        result.textContent = err.status === 0 ? `${OFFLINE}. Try again.` : err.message;
        result.className = 'tg-test field-error';
      }
    } finally {
      test.disabled = false;
    }
    try {
      const data = await request('GET', '/api/settings');
      if (alive) { last = data; paintStatus(data); }
    } catch { /* the status lines stay as they were */ }
  });

  for (const el of [...Object.values(inputs), ...levelBoxes, cleared]) {
    el.addEventListener('input', () => { saved.hidden = true; });
  }

  load();
  return function unmount() {
    alive = false;
    container.replaceChildren();
  };
}
