// One short sound per as-if, synthesised rather than sampled so there's
// nothing to download. Off by default; the toggle is the visitor's own act,
// and nothing here makes an AudioContext before one. Anyone who has asked
// their system for reduced motion gets none of it.

const toggle = document.querySelector("button.sound-toggle");
const select = document.querySelector("form.trace-form select[name=kind]");
const KEY = "liuru-sound";
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

let ctx;
let master;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function envelope(gain, t, attack, peak, release) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

function tone(type, freq, t, attack, peak, release, out = master) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  envelope(gain, t, attack, peak, release);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + attack + release + 0.05);
  return osc;
}

function noise(seconds) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  return src;
}

const VOICES = {
  // a soft chord that swells and fades, slightly out of tune with itself
  dream(t) {
    for (const [f, d] of [[392, -4], [494, 3], [587, -2]]) {
      tone("sine", f, t, 0.45, 0.18, 1.2).detune.value = d;
    }
  },
  // two near-identical tones beating against each other, wavering
  illusion(t) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = 9;
    lfo.connect(depth);
    for (const f of [660, 667]) depth.connect(tone("triangle", f, t, 0.08, 0.32, 0.9).frequency);
    lfo.start(t);
    lfo.stop(t + 1.1);
  },
  // a quick rising bloop
  bubble(t) {
    const osc = tone("sine", 280, t, 0.01, 0.4, 0.22);
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.14);
  },
  // something low and muffled, there and then not
  shadow(t) {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 380;
    lowpass.connect(master);
    tone("triangle", 110, t, 0.25, 0.45, 1.0, lowpass);
    tone("triangle", 165, t, 0.3, 0.2, 0.9, lowpass);
  },
  // two drops
  dew(t) {
    tone("sine", 1760, t, 0.005, 0.4, 0.28);
    tone("sine", 2093, t + 0.17, 0.005, 0.24, 0.25);
  },
  // a crack, then thunder rolling off
  lightning(t) {
    const crack = noise(0.08);
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 2000;
    const crackGain = ctx.createGain();
    envelope(crackGain, t, 0.002, 0.7, 0.07);
    crack.connect(high).connect(crackGain).connect(master);
    crack.start(t);

    const rumble = noise(1.6);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(400, t + 0.05);
    low.frequency.exponentialRampToValueAtTime(90, t + 1.5);
    const rumbleGain = ctx.createGain();
    envelope(rumbleGain, t + 0.05, 0.12, 0.9, 1.35);
    rumble.connect(low).connect(rumbleGain).connect(master);
    rumble.start(t + 0.05);
  },
};

function on() {
  return !reduced.matches && localStorage.getItem(KEY) === "on";
}

function play(kind) {
  if (!on() || !VOICES[kind]) return;
  audio();
  VOICES[kind](ctx.currentTime + 0.02);
}

function render() {
  if (reduced.matches) {
    toggle.disabled = true;
    toggle.setAttribute("aria-pressed", "false");
    toggle.textContent = "sound off (reduced motion)";
    return;
  }
  toggle.disabled = false;
  toggle.setAttribute("aria-pressed", String(on()));
  toggle.textContent = on() ? "sound on" : "sound off";
}

if (toggle && select) {
  toggle.hidden = false;
  render();
  reduced.addEventListener("change", render);
  toggle.addEventListener("click", () => {
    localStorage.setItem(KEY, on() ? "off" : "on");
    render();
    // switching it on is an act, so let it be heard at once
    play(select.value);
  });
  select.addEventListener("change", () => play(select.value));
}
