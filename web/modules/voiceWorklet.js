// 마이크 소리의 크기만 재는 오디오 워크릿 — C 소유. voiceMeter.js가 불러 쓴다 (?marks=voice).
// 10ms마다 그 구간의 RMS(소리 크기) 숫자 하나를 내보낸다. **소리 자체는 어디에도 내보내거나 저장하지 않는다.**
// 왜 워크릿인가: 화면 쪽은 시선 추정으로 프레임마다 십몇 ms씩 바쁘다. 거기서 소리를 재면 음절 사이의 짧은 골을 놓친다.
class RmsMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sum = 0; this.n = 0;
    this.block = Math.max(1, Math.round(sampleRate / 100));   // 10ms어치 표본 수
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.sum += ch[i] * ch[i];
        if (++this.n >= this.block) { this.port.postMessage(Math.sqrt(this.sum / this.n)); this.sum = 0; this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('nd-rms-meter', RmsMeter);
