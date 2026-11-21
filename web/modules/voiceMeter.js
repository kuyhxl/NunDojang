// 소리 내어 읽기 확인 — C 소유. 개발용 시험(?marks=voice), 팀 합의 전. docs/feedback.md 6-8절.
//
// 무엇: 마이크 소리의 **크기 변화**만 보고 (1) 소리를 낸 시간과 (2) 음절 수를 센다.
//       중요 표시(keySpans.js)가 "그 줄에 있는 동안 그 글자 수만큼 소리 내어 읽었는가"를 판정하는 데 쓴다.
//
// 왜 음성 인식을 쓰지 않는가: 브라우저의 음성 인식은 소리를 외부 서버로 보낸다. 이 앱은 영상도 소리도 밖으로 내보내지 않는다.
//       한글은 한 글자가 한 음절이라, 음절 수만 세어도 "그 글자 수만큼 읽었는가"를 견줄 수 있다.
//
// 어떻게: 말소리는 음절마다 크기가 솟았다 꺼진다. 10ms마다 받은 크기(dB)를 부드럽게 한 뒤,
//       골에서 riseDb 이상 솟았다가 dropDb 이상 꺼지면 음절 하나로 센다.
//
// 못 하는 것:
//   - **무슨 말을 했는지는 모른다.** 아무 말이나 그 길이만큼 하면 통과한다 ("가가가가"). 시선과 묶어 쓰는 까닭이다.
//   - 모음이 이어지거나 웅얼거리면 골이 얕아 덜 센다. 그래서 판정은 글자 수의 절반만 요구한다.
//   - 시끄러운 곳에서는 바닥 소리 위로 솟는 폭이 줄어 덜 센다. 주변 말소리는 내 말소리와 가르지 못한다.
//
// 문턱은 합성 신호로 맞춘 초기값이다. 실제 목소리로 잰 값이 아니다.
// createSyllableCounter는 DOM을 쓰지 않는 순수 함수라 node에서 시험할 수 있다. createVoiceMeter만 브라우저를 쓴다.

export const VOICE_POLICY = Object.freeze({
  version: 'voice-syllable/0.1.0-dev',
  frameMs: 10,
  /** 크기를 부드럽게 하는 시간 (ms). 음절(150~250ms)보다 짧고 성대 떨림보다 길게 */
  smoothMs: 30,
  /** 바닥 소리보다 이만큼(dB) 커야 말소리로 본다 */
  voicedAboveNoiseDb: 9,
  /** 이보다 작은 소리(dBFS)는 무엇이든 말소리로 보지 않는다 */
  minVoicedDb: -55,
  /** 골에서 이만큼(dB) 솟아야 음절 봉우리 후보 */
  riseDb: 2,
  /** 봉우리에서 이만큼(dB) 꺼져야 그 봉우리를 음절로 확정 */
  dropDb: 1.5,
  /** 음절 사이 최소 간격 (ms). 초당 10음절보다 빠른 말은 없다 */
  minGapMs: 100,
  /** 바닥 소리 추정: 말소리가 아닐 때 이 시간 상수(ms)로 따라간다 */
  noiseFollowMs: 800,
  source: '합성 신호로 맞춘 초기값. 실제 목소리 기록으로 다시 고를 것'
});

const toDb = (rms) => 20 * Math.log10(Math.max(rms, 1e-7));

/**
 * 소리 크기의 흐름에서 말소리 시간과 음절 수를 센다.
 * @returns {{push:(rms:number)=>void, take:()=>{syllables:number, voicedMs:number, frames:number}, state:object}}
 */
export function createSyllableCounter(policy = VOICE_POLICY) {
  const aSmooth = 1 - Math.exp(-policy.frameMs / policy.smoothMs);
  const aNoise = 1 - Math.exp(-policy.frameMs / policy.noiseFollowMs);
  let env = null;              // 부드럽게 한 크기 (dB)
  let noise = null;            // 바닥 소리 (dB)
  let valley = null, peak = null, peakAt = 0;   // 지금 골·봉우리 (dB), 봉우리의 프레임 번호
  let rising = false;
  let frame = 0, lastSyllableAt = -1e9;
  let syllables = 0, voicedMs = 0, frames = 0;                 // take()가 가져갈 때까지 쌓는다
  let totalSyllables = 0, totalVoicedMs = 0;
  let voiced = false;

  function push(rms) {
    if (!Number.isFinite(rms)) return;
    const db = toDb(rms);
    env = env === null ? db : env + aSmooth * (db - env);
    // 바닥 소리: 처음에는 들리는 대로, 그 뒤로는 말소리가 아닐 때만 천천히 따라간다. 더 조용해지면 바로 내려간다
    if (noise === null) noise = env;
    else if (env < noise) noise = env;
    else if (!voiced) noise += aNoise * (env - noise);
    else noise += (aNoise / 20) * (env - noise);     // 말하는 중에도 아주 천천히는 올린다 (주변이 시끄러워진 경우)
    voiced = env > noise + policy.voicedAboveNoiseDb && env > policy.minVoicedDb;
    frame++; frames++;
    if (voiced) { voicedMs += policy.frameMs; totalVoicedMs += policy.frameMs; }

    // 봉우리 찾기: 골 → (riseDb 이상 솟음) → 봉우리 → (dropDb 이상 꺼짐) → 음절 하나
    if (valley === null) { valley = env; peak = env; peakAt = frame; return; }
    if (!rising) {
      if (env < valley) valley = env;
      if (env >= valley + policy.riseDb && voiced) { rising = true; peak = env; peakAt = frame; }
    } else if (env > peak) {
      peak = env; peakAt = frame;
    } else if (env <= peak - policy.dropDb || !voiced) {
      if ((peakAt - lastSyllableAt) * policy.frameMs >= policy.minGapMs) { syllables++; totalSyllables++; lastSyllableAt = peakAt; }
      rising = false; valley = env;
    }
  }

  return {
    push,
    /** 지난번 take() 뒤로 쌓인 것을 가져가고 비운다 */
    take() {
      const out = { syllables, voicedMs, frames };
      syllables = 0; voicedMs = 0; frames = 0;
      return out;
    },
    get state() {
      return { levelDb: env, noiseDb: noise, voiced, totalSyllables, totalVoicedMs };
    }
  };
}

/**
 * 글에서 소리 낼 음절 수를 어림한다. 한글 한 글자 = 한 음절, 숫자·영문자는 하나씩 센다(읽는 법에 따라 달라 어림이다).
 * 공백·문장부호는 세지 않는다.
 */
export function countSyllables(text) {
  let n = 0;
  for (const ch of String(text ?? '')) {
    if (/[가-힣]/.test(ch)) n += 1;
    else if (/[0-9A-Za-z]/.test(ch)) n += 1;
  }
  return n;
}

/**
 * 마이크를 열어 소리 크기를 재기 시작한다. 소리 자체는 저장하지도 내보내지도 않는다 — 워크릿이 10ms마다 크기 숫자 하나만 준다.
 * @param {{workletUrl:string}} o
 * @returns {Promise<{take:Function, state:object, stop:Function, sampleRate:number}>}
 */
export async function createVoiceMeter({ workletUrl, policy = VOICE_POLICY }) {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
    throw Object.assign(new Error('이 브라우저에서는 마이크 측정을 쓸 수 없습니다.'), { code: 'voice_unsupported' });
  }
  // 자동 음량 조절은 끈다 — 조용할 때 바닥 소리를 끌어올려 말소리와의 차이를 지운다
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false }, video: false });
  const ctx = new AudioContext();
  try {
    await ctx.audioWorklet.addModule(workletUrl);
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop()); await ctx.close().catch(() => {});
    throw Object.assign(new Error(`마이크 측정을 시작하지 못했습니다 (${e.message}).`), { code: 'voice_failed' });
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'nd-rms-meter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  const mute = ctx.createGain(); mute.gain.value = 0;      // 스피커로는 아무것도 내보내지 않는다. 연결만 해 두어야 워크릿이 돈다
  source.connect(node); node.connect(mute); mute.connect(ctx.destination);
  const counter = createSyllableCounter(policy);
  node.port.onmessage = (e) => counter.push(e.data);
  let stopped = false;
  return {
    sampleRate: ctx.sampleRate,
    take: () => counter.take(),
    get state() { return { ...counter.state, running: !stopped && ctx.state === 'running' }; },
    async stop() {
      if (stopped) return; stopped = true;
      node.port.onmessage = null;
      try { source.disconnect(); node.disconnect(); mute.disconnect(); } catch { /* 이미 끊김 */ }
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => {});
    }
  };
}
