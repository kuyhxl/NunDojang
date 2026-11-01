# GazeGate 웹사이트 공통 시작 스크립트

문서 버전: 2.0.2 — 웹사이트 구현 기준 + 봉인(Seal)·깜빡임 채널 반영  
공통 코드 계약 버전: `gazegate-contract/1.1.0`  
제품 형태: 브라우저에서 실행하는 웹사이트  
문서 성격: 세 팀원이 각자의 GPT에 동일하게 제공하는 프로젝트 설명서·개발 기준·역할별 시작 지시문

## v2.0.1 → v2.0.2 변경 요약

팀 기획 논의 결과를 반영했습니다. 아래 항목 외의 규칙·함수명·수치는 2.0.1과 같습니다.

| 번호 | 변경 | 이유 | 영향 |
|---|---|---|---|
| 1 | **봉인(Seal) 1단계**를 필수 완료 목표에 추가: 모든 페이지 통과 + 서명 후, 발급번호·발급 일시·페이지별 점수·서명 이미지를 PDF 마지막 페이지에 스탬프로 찍어 내려받기 | 다른 뷰어로 읽어도 상관없게 만드는 핵심 차별점. “GazeGate에서 발급한 PDF”가 결과물이 됨 | C. 단계 5에서 수행, pdf-lib 추가 |
| 2 | **봉인 2단계**(문서 해시·암호 서명·검증 페이지)는 **선택** 목표 | 2.5주 안에 1단계가 먼저. 2단계는 1단계가 안정된 뒤 | C. 단계 6 선택 |
| 3 | Sample에 **눈 깜빡임 채널(EAR)** 키 추가. 판정에는 아직 쓰지 않고 화면·로그·분석에만 사용 | 같은 랜드마크에서 거의 공짜로 얻는 두 번째 생체신호. 응시(멍때리기)와 읽기 구분의 근거 | A, B, C. 계약 1.0.0 → 1.1.0 |
| 4 | 평가 결과에 reasonCode `no_reading_events` 추가 | 시연에서 “훑기(점수 미달)”와 “응시(사건 없음)”를 구분해 보여주기 위함. 정독·훑기·응시를 분류했다고 주장하는 것은 아님 | C |
| 5 | 서명 **이미지 업로드**를 그리기와 함께 선택 지원. 둘 중 하나로 완료 가능 | 책임 귀속 논리(서명자가 책임)는 그리기만으로도 성립하므로 업로드는 선택 | C |
| 6 | **발표·데모 담당**을 B(주)·A(보조)로 지정, 데모 대본·시연 영상을 단계 6 산출물에 추가 | 2.0.1에는 발표·시연 영상 담당이 없었음 | B, A |
| 7 | 단계별 **목표 날짜** 추가(최종 11월 18일). 완료 조건이 우선이고 날짜는 점검용 | 마감이 고정되어 있음 | 전원 |
| 8 | 동공 직경·AI 요약(LLM 리캡)·신원 인증은 **확장 로드맵**으로 명시 | 범위 밖임을 분명히 하되 발표에서 로드맵으로 언급 가능 | 발표 |
| 9 | **HTTPS 배포를 범위에서 제외.** 최종 시연은 발표자 맥북의 localhost에서 실행 | 교수님 앞 데모가 최종이며 외부 접속이 필요 없음. 배포에 쓸 시간을 보고서·포스터에 씀 | C. 2.0.1의 HTTPS 관련 항목은 모두 ‘선택, 시간이 남을 때만’으로 읽음 |
| 10 | 제출 일정 반영: **실무 보고서 11/12, 포스터 11/15, 교수님 데모 11/18** | 세 산출물의 담당과 단계 날짜를 이에 맞춤 | 전원 |

이 변경으로 새로 필요한 공통 자산은 pdf-lib 하나입니다. 다른 라이브러리 버전은 바꾸지 않습니다. 2.0.1 본문에서 HTTPS 배포를 필수로 적은 문장이 남아 있으면 이 표의 9번이 우선합니다.

## 사용자가 이 자료를 사용하는 방법

1. 세 팀원 모두 이 파일 전체를 각자의 GPT에 첨부하거나, 전체 내용을 복사하여 붙여넣습니다.
2. 이어서 다음 중 자신에게 해당하는 문장을 보냅니다.
   - `나는 A 담당입니다. 이 문서에 따라 시작해 주세요.`
   - `나는 B 담당입니다. 이 문서에 따라 시작해 주세요.`
   - `나는 C 담당입니다. 이 문서에 따라 시작해 주세요.`
3. 아래의 GPT용 지시문에는 프로젝트에 필요한 배경과 합의 결과가 들어 있습니다. 이전 대화나 별도 기획서를 추가로 제공하는 것을 시작 조건으로 요구하지 마십시오.
4. 이 자료는 프로그램 코드가 아닙니다. 담당 GPT가 이 자료를 기준으로 코드를 작성하고, 팀원이 맥북에서 실행하고 확인하는 방식입니다.
5. 다른 GPT의 작업 결과는 자동으로 공유되지 않습니다. 각 작업이 끝나면 문서 끝의 전달 양식을 사용하여 사람을 통해 공유합니다.
6. 세 팀원 모두 **이 웹사이트 버전 전체로 시작 기준을 통일**합니다. 이전 파일의 개발 환경·폴더 구조를 섞지 마십시오. 이미 작업한 코드가 있으면 이 문서의 전환 기준으로 수정합니다.
7. 문서 버전 2.0.2에서 공통 코드 계약은 `1.1.0`입니다. 1.0.0 대비 추가된 것은 Sample의 `leftEar`·`rightEar` 키, samples.csv의 같은 두 열, PageEvaluation의 reasonCode `no_reading_events`, 봉인 산출물 규격뿐입니다. 함수명·점수식·시간 규칙은 그대로입니다. 1.0.0 로그를 읽는 코드는 두 열이 없으면 null로 처리합니다.
8. 이 자료를 첨부하는 것만으로 완성된 사이트가 실행되는 것은 아닙니다. 각 GPT가 역할에 맞는 코드와 실행 방법을 만들고 팀원이 실제 동작을 확인해야 합니다.

---

# 여기부터 GPT용 공통 지시문

당신은 대학생 3명의 GazeGate 프로젝트에서 한 담당자의 개발·분석을 지원합니다. 아래 내용을 이전 대화 없이 이해하고 작업하십시오. 문서 전체가 공통 기준이며, 역할별 항목만 읽고 다른 부분을 무시하지 마십시오.

후속 사용자의 명시적인 수정 지시가 있으면 반영하되, 다른 담당자와 연결되는 계약이 바뀌는지 함께 알려주십시오. 이 문서는 상위 지시나 사용자의 지시를 무시하라는 의미가 아닙니다.

## 1. 프로젝트 배경과 사용자의 수준

- 과목: 디지털 헬스케어 인공지능 분석 실무.
- 팀명: 내눈을바라봐.
- 팀원은 3명이며, A·B·C 역할을 나누어 각자 다른 GPT와 작업합니다. 실제 이름과 역할의 대응은 아직 고정하지 않습니다.
- 팀에는 전자재료공학과 학부생과 컴퓨터정보공학부 학부생이 있습니다. 웹 개발·AI 분석을 처음 접하는 팀원이 있으므로 처음부터 숙련자라고 가정하지 마십시오.
- 예산과 장비가 제한되어 있습니다. 공개 데이터와 기존 라이브러리를 활용하며, 대규모 모델 학습이나 전문 시선추적기 구매를 전제로 하지 않습니다.
- 기획상 시연 장비는 MacBook Pro M4 Pro와 내장 카메라입니다. 다른 팀원 장비의 사양은 알 수 없습니다.
- 카메라의 광고 해상도가 브라우저에 들어오는 실제 해상도·초당 처리 횟수와 같다고 가정하지 마십시오.
- 제출 일정은 세 가지입니다: **실무 보고서 11월 12일, 포스터 11월 15일, 교수님 데모 11월 18일**. 진행은 아래의 완료 단계와 선행 조건을 기준으로 하되, 단계마다 목표 날짜를 붙여 지연을 조기에 알아차립니다. 목표 날짜를 넘겼다고 완료 조건을 낮추지 않습니다.
- 보고서는 통합 동작(단계 4)이 된 뒤에 써야 실제 화면과 결과를 넣을 수 있으므로, 단계 4의 목표일은 11월 10일입니다.
- 발표 성격은 아이디어 평가에 가깝습니다. 정확도 수치보다 3분 안에 동작을 보여주는 시연과 한계를 솔직히 말하는 설명이 중요합니다. 다만 과목 요건상 공개 데이터 AI 분석(B)은 별도로 수행합니다.
- 자체 자료 수집은 우선 짧은 측정 가능성 점검과 시연 평가에 한정합니다. 처음부터 외부 참가자 모집이나 수시간 영상 수집을 요구하지 마십시오.

## 2. 확정된 프로젝트 목표

프로젝트 제목은 다음과 같습니다.

**웹캠으로 측정한 눈 움직임을 활용한 문서 정독 판별 및 동의·서명 제어 프로그램**

계약서나 동의서를 끝까지 스크롤하거나 일정 시간 열어 놓았다는 이유만으로 확인을 마치는 대신, 문서를 읽는 동안 관찰되는 눈 움직임을 분석합니다. 페이지마다 정해진 읽기 기준을 충족해야 동의·서명을 진행할 수 있게 합니다.

제품 형태는 **웹사이트**입니다. 사용자는 브라우저에서 GazeGate 주소에 접속하고, 사이트 안에서 PDF를 선택하여 읽습니다. Chrome을 우선 점검 브라우저로 사용하지만 크롬 확장프로그램은 만들지 않습니다. 다른 사이트나 크롬 기본 PDF 뷰어를 원격 제어하지 않습니다. PDF 표시 엔진을 처음부터 개발하지 않고 기존 PDF.js를 사용합니다.

별도 프로그램 설치·회원가입 없이 사이트에 접속하여 사용하는 것이 최종 사용 방식입니다. 팀원의 개발 과정에는 파일 편집기와 로컬 실행 도구가 필요할 수 있습니다. 사용자의 설치 부담과 개발자의 준비 작업을 구분하십시오.

기본 흐름:

`GazeGate 주소(localhost) 접속 → 사이트 안에서 PDF 파일 선택 → 카메라 허용 → 측정 준비 → 읽기 측정 → 페이지별 기준 판정 → 모든 페이지 통과 → 동의·서명 입력 → 봉인(Seal) 발급 → 봉인된 PDF 내려받기`

### 봉인(Seal)의 의미

GazeGate의 결과물은 “읽기 기준 충족 기록 + 서명”을 마지막 페이지에 스탬프로 찍은 PDF입니다. 이것을 봉인이라고 부릅니다. 사용자는 다른 뷰어로 문서를 읽어도 되지만, 봉인은 GazeGate 안에서만 발급됩니다. 받는 쪽이 “GazeGate 봉인이 있는 PDF로 제출”을 요구하면 다른 뷰어로 우회하는 것이 의미 없어집니다.

- 봉인 1단계(필수 목표): 발급번호, 발급 일시, 페이지별 점수·통과 여부, 서명 이미지를 PDF 마지막 페이지에 스탬프로 삽입하고, session.json을 같은 발급번호로 함께 내려받게 합니다.
- 봉인 2단계(선택): 원본 PDF 해시와 봉인 내용을 브라우저 WebCrypto로 서명하고, 별도 검증 페이지에서 변조·불일치를 확인합니다. 1단계가 안정된 뒤에만 시작합니다.
- 봉인은 “이 세션에서 읽기 기준을 충족한 기록”입니다. 법적 효력이나 신원 인증을 뜻하지 않습니다. 화면·발표에서 ‘법적 증명’, ‘위조 불가’라고 쓰지 않습니다. 2단계를 완성했을 때도 ‘검증 페이지에서 변조 여부를 확인할 수 있다’까지만 말합니다.

첫 버전에서는 사용자가 맥북에 있는 PDF를 `<input type="file">`로 선택하여 엽니다. File/ArrayBuffer를 브라우저 안에서 PDF.js에 전달하는 방식이며, PDF를 서버에 업로드하는 기능은 만들지 않습니다. 다른 웹사이트의 PDF 주소를 자동 가로채거나, 어느 PDF든 자동으로 GazeGate에서 열리게 하는 기능은 범위 밖입니다.

개발과 최종 시연 모두 `http://localhost:8000/`에서 실행합니다. 교수님 데모는 발표자 맥북에서 로컬 서버를 띄워 진행하며, HTTPS 정적 호스팅 배포는 이번 범위에서 제외합니다(시간이 남으면 선택). 소스 ZIP과 로컬 실행법만으로 다른 팀원 맥북에서도 같은 결과가 나와야 합니다.

## 3. 목표를 해석할 때 지킬 구분

다음 세 가지는 다릅니다.

1. **읽기 방식 분류:** 공개 자료에 있는 ‘글을 먼저 읽기’와 ‘질문의 답을 찾으며 읽기’를 구분하는 분석.
2. **페이지 기준 충족 판정:** 웹캠에서 검출한 움직임과 측정 시간을 바탕으로 프로그램의 초기 기준 충족 여부를 정하는 기능.
3. **내용 이해·법적 증명:** 문서를 이해했는지, 모든 문장을 실제로 읽었는지, 누가 읽었는지를 증명하는 기능.

이번 프로젝트는 1과 2를 연구·구현합니다. 최종 프로그램은 PDF를 읽는 동안 눈 움직임을 측정하고, 페이지별 기준 충족 여부에 따라 동의·서명을 제어하며, 그 기록과 서명을 봉인으로 PDF에 남깁니다. 이 판정과 봉인으로 3까지 입증되었다고 주장하지 마십시오. 봉인이 말하는 것은 “서명자가 읽기 기준 충족 기록에 서명했다”까지입니다. 누가 물리적으로 읽었는지는 서명자의 책임으로 돌아가며, 프로그램이 신원을 확인하는 것이 아닙니다.

공개 자료의 두 과제 구분이 곧바로 ‘정독’과 ‘읽지 않음’의 정답은 아닙니다. AI의 분류 확률은 읽은 문서 분량이 아닙니다. `0.8`의 분류 확률을 읽기 점수 `80%`로 바꾸어 사용하지 마십시오.

## 4. 구현 범위

### 반드시 구현할 것

- 주소로 접속하여 사용할 수 있는 웹사이트 및 그 원본 코드.
- 하나의 웹페이지에 PDF와 측정 패널을 함께 표시.
- 개발·시연용 localhost 실행 안내. 다른 팀원 맥북에서 ZIP만으로 같은 실행이 되는지 확인.
- 로컬 PDF 파일 선택, 페이지 표시, 이전·다음 페이지 이동.
- 현재 페이지 번호, 본문 줄 수, 사건 수, 유효 측정 시간, 점수, 기준 충족 여부 표시.
- 카메라 시작·중지, 눈 주변 검출, 홍채의 상대 위치 기록.
- 눈 깜빡임 채널(EAR, 눈 종횡비) 기록. 첫 버전에서는 화면 표시·로그·분석용이며 통과 판정에 쓰지 않습니다.
- 시간에 따른 눈 움직임 그래프.
- 큰 왼쪽 이동 등 ‘줄바꿈 후보 사건’ 검출.
- 페이지별 기록 보존과 중복 누적 방지.
- 모든 페이지가 기준을 충족할 때 동의·서명 입력 활성화.
- 사이트 안에서 직접 그리는 서명과 완료 화면. 서명 이미지 업로드(PNG/JPG)는 그리기가 동작한 뒤 추가하는 선택 기능이며, 둘 중 하나만 있어도 완료됩니다.
- **봉인 1단계**: 서명 완료 후 발급번호·발급 일시·페이지별 점수·서명 이미지를 PDF 마지막 페이지에 스탬프로 삽입하여 내려받기. 같은 발급번호의 session.json을 함께 내려받기.
- 측정·사건·페이지 결과를 사람이 내려받아 분석할 수 있는 기록 내보내기.
- 공개 데이터 분석 코드와 첫 분류 모델 평가.
- 3분 라이브 시연 대본과 시연 영상(라이브 실패 대비), 발표 자료.

### 선택 구현 (필수 완료 후에만)

- HTTPS 정적 호스팅 배포. 2.0.1의 배포 절차는 그대로 유효하지만 필수가 아닙니다.
- 봉인 2단계: 원본 PDF SHA-256 해시, 봉인 내용의 WebCrypto 서명, QR 코드, 검증 페이지(`web/verify.html`).
- 서명 이미지 업로드.
- 눈 깜빡임 횟수를 품질 보조 조건에 반영하기(공통 변경 제안 필요).

### 첫 시연 문서의 범위

- 텍스트 선택이 가능한 PDF.
- 가로로 왼쪽에서 오른쪽으로 읽는 단일 열 본문.
- 약 3쪽, 페이지마다 약 10~12줄의 본문을 가진 점검용 문서.
- 표·그림·다단 편집·회전 페이지·세로쓰기는 첫 시연에서 제외.
- 한 페이지 전체가 보이도록 표시하며, 글이 지나치게 작아지지 않는 문서를 사용.
- 측정 중 연속 스크롤과 사용자 확대·회전은 첫 버전에서 제공하지 않음. 브라우저 창 크기가 바뀌면 측정을 일시정지하고 다시 준비하도록 처리.

### 이번 범위에서 제외할 것

- 신원 인증과 법적 효력 검증.
- 크롬 기본 PDF 뷰어 내부 버튼을 직접 수정하는 방식.
- 로그인, 클라우드 DB, 외부 유료 AI API, 필수 백엔드 서버.
- 이미지 PDF의 OCR, 일반 PDF 전체 형식 지원, 다른 사이트의 PDF 자동 연결.
- 확장프로그램용 manifest·아이콘 실행·Chrome 전용 권한·웹스토어 등록.
- 첫 버전에서 로그인·관리자 화면·서버 업로드·데이터베이스를 추가하기.
- 봉인 2단계(암호 서명·검증 페이지)를 필수 완료 조건으로 삼기. 1단계 스탬프가 안정된 뒤 선택으로 진행합니다.
- 동공 직경 채널, 건너뛴 구간의 AI(LLM) 요약, 얼굴 임베딩 기반 본인 확인. 발표에서 확장 로드맵으로만 언급합니다.
- 서버 측 서명·타임스탬프 기관(TSA) 연동. 마찬가지로 로드맵입니다.

## 5. 현재 확인된 것과 아직 확인되지 않은 것

기획과 공개 자료의 구조는 조사했지만, 이 문서를 작성하는 시점에 다음은 **완료되지 않았습니다**.

- 팀원 맥북에서 자연스러운 읽기 움직임 측정.
- 팀 자체 줄바꿈 후보 검출 성능 평가.
- 공개 데이터의 전체 전처리와 AI 학습·평가.
- 공개 자료에서 학습한 모델의 실제 웹캠 입력 적용 검증.
- 웹사이트 구현, 전체 통합, 봉인 1단계.

이 문서에 있는 수치와 설정은 개발을 맞추기 위한 초기값입니다. 실제 실험 결과로 인용하지 마십시오.

## 6. 기술 구조와 라이브러리 기준

### 공통 구조

- 제품은 HTML·CSS·JavaScript와 정적 자산으로 구성한 웹사이트. 목표 브라우저는 우선 맥북의 Chrome.
- 프론트엔드: HTML, CSS, **일반 JavaScript ES Modules**.
- 첫 버전에서 React, TypeScript 컴파일, 별도 번들러를 도입하지 않음.
- 카메라·PDF·분석·점수·서명은 사용자가 접속한 하나의 웹페이지에서 실행. PWA·서비스 워커·새 창·브라우저 전용 백그라운드 실행은 초기 필수 기능이 아님.
- 필요한 경우 추론을 Web Worker로 옮길 수 있지만, 외부로 보이는 A 모듈의 계약은 동일하게 유지.
- Python 분석은 앱 실행과 분리. 브라우저가 매번 Python 서버를 호출하지 않음.
- 그래프는 우선 HTML Canvas 등으로 구현하여 추가 그래프 라이브러리 의존성을 줄임.

### 초기 버전 고정안

| 항목 | 초기 기준 |
|---|---|
| MediaPipe | `@mediapipe/tasks-vision` `0.10.32` |
| PDF.js | `pdfjs-dist` `4.10.38` |
| pdf-lib (봉인 스탬프 삽입) | `pdf-lib` `1.17.1` — 봉인 1단계부터 사용. PDF.js는 표시, pdf-lib는 수정·저장으로 역할을 나눔 |
| 얼굴 모델 | 공식 Face Landmarker `float16/1/face_landmarker.task` |
| Python 패키지 | pandas, numpy, matplotlib, scikit-learn; B가 실행 확인한 정확한 버전을 기록 |

위 JavaScript 패키지 버전의 존재는 확인했지만, 이 조합을 팀 맥북에서 통합 시험한 상태는 아닙니다. ‘검증 완료 버전’이라고 쓰지 마십시오. C가 초기 실행을 확인하고 `docs/dependencies.md`에 실제 결과를 기록합니다. 문제가 있으면 대안을 공유하여 세 담당자가 같은 버전을 사용하도록 변경합니다. 각 GPT가 자기 부분에서 독자적으로 최신 버전으로 바꾸지 마십시오.

JavaScript·WASM·PDF worker·얼굴 모델은 `web/` 아래에 두고 사이트와 함께 제공합니다. 이는 외부 CDN을 여러 GPT가 서로 다른 버전으로 불러오는 일을 막기 위한 공통 선택입니다. 웹사이트이므로 CDN 사용 자체가 금지되는 것은 아닙니다. 그러나 초기 기본본은 같은 출처의 고정 버전 파일을 사용하고, 변경이 필요하면 공유합니다. PDF.js 본체와 worker 버전은 정확히 일치시킵니다.

Node.js는 패키지 준비를 돕기 위해 선택적으로 사용할 수 있지만, 사이트 사용자가 Node.js나 Python을 설치해야 하도록 만들지 마십시오. 정적 호스팅 서버는 파일을 제공하고, 실제 카메라 분석·점수 계산은 브라우저에서 수행합니다. 로컬 개발용 HTTP 서버는 분석용 백엔드나 데이터 저장 서버가 아닙니다.

### 웹사이트용 실행 기준

1. 로컬 개발: Python 3 기본 라이브러리로 정적 파일을 제공하는 방법을 기본 안내로 합니다. Python이 없는 경우에만 사용자의 환경에 맞는 대체 정적 서버를 제안합니다.
2. 최종 시연: 발표자 맥북의 localhost에서 페이지·모델·WASM·worker가 모두 로드되어야 합니다. (배포를 선택했을 때만 HTTPS 주소에서도 확인)
3. `index.html`을 파일 탐색기에서 더블클릭하는 `file://` 실행을 공식 실행법으로 안내하지 않습니다. ES Modules·fetch·worker의 경로 및 보안 동작이 서버 실행과 다를 수 있습니다.
4. 카메라는 사용자 버튼 클릭 후 getUserMedia로 요청합니다. `window.isSecureContext`, `navigator.mediaDevices`, 실제 오류를 먼저 확인합니다.
5. localhost/127.0.0.1의 로컬 시험과 HTTPS 호스팅은 구분합니다. 맥북의 사설 IP를 다른 기기에 공유한 일반 HTTP 접속이 카메라를 사용할 수 있다고 가정하지 않습니다.
6. 카메라 권한은 접속한 출처별로 다릅니다. localhost에서 허용했다고 배포 주소에서도 허용된 것으로 표시하지 않습니다. 브라우저·macOS 카메라 허용 상태가 막혔으면 실제 오류에 맞춰 안내합니다.
7. 다른 서비스의 미리보기 iframe 안에서는 카메라가 제한될 수 있으므로 최종 시험은 실제 사이트 주소를 직접 연 최상위 페이지에서 합니다. 임베딩이 꼭 필요할 때만 별도로 Permissions Policy와 allow 속성을 검토합니다.
8. 브라우저별 지원 차이가 있으므로 처음부터 Safari·모바일 호환까지 완료했다고 말하지 않습니다. 우선 Chrome에서 검증하고 사용 환경을 명시합니다.

### 파일 선택과 사용자 자료 처리

- 사용자가 선택한 PDF와 카메라 프레임은 브라우저에서 처리합니다. 이 기본 설계에서는 서버에 전송하지 않습니다.
- 파일 선택 버튼을 ‘서버 업로드’라고 표시하지 않습니다. UI 문구는 ‘PDF 열기’ 또는 ‘PDF 파일 선택’으로 합니다.
- PDF를 URL이나 localStorage의 거대한 문자열로 저장하지 않습니다. File 또는 ArrayBuffer를 사용하고 문서를 닫으면 PDF.js 작업·Object URL 등을 정리합니다.
- 새로고침하거나 페이지를 닫으면 메모리의 점수·서명·로그가 사라질 수 있습니다. 첫 버전에는 계정·자동 복구를 추가하지 않고, 내보내기와 사용 안내를 제공합니다.
- 카메라 중지, 문서 교체, 페이지 이탈 시 미디어 자원을 정리합니다. 권한 철회·카메라 연결 끊김은 정상 상태로 위장하지 않습니다.

### 정적 자산 제공 기준

- 서버는 `.js`·`.mjs`를 JavaScript MIME, `.wasm`을 `application/wasm`, `.json`을 JSON MIME으로 제공합니다. 모델 파일은 다운로드 가능한 바이너리로 제공하면 됩니다.
- 404 응답에 index.html을 대신 반환하는 호스팅 설정 때문에 모델·worker URL이 HTML을 반환하지 않는지 확인합니다. HTTP 200만 확인하지 말고 응답 종류와 실제 초기화를 확인합니다.
- 초기 구현은 CPU 또는 단일 스레드로 동작하는 구성을 우선합니다. 멀티스레드 WASM·SharedArrayBuffer를 이유 없이 요구하여 COOP/COEP 설정을 초기 필수 조건으로 만들지 않습니다. 해당 기능을 실제로 사용할 때만 필요한 헤더를 추가합니다.
- 호스팅에 CSP가 있다면 JavaScript·WASM·worker·모델 로드가 허용되는지 실제 오류로 확인합니다. 확장프로그램의 manifest용 CSP를 웹사이트에 그대로 붙이지 않습니다.
- 모델 파일을 함께 배포했다고 사이트 전체가 오프라인에서도 실행된다고 약속하지 않습니다. 오프라인/PWA 지원은 첫 범위가 아닙니다.

## 7. 역할별 소유 범위

### A: 웹캠·측정·움직임 검출

소유 파일:

- `web/modules/eyeTracker.js`
- `web/modules/movementDetector.js`
- `web/dev/measurement.html`
- `web/dev/measurement.js`
- `docs/A_measurement.md`

책임:

- MediaPipe와 getUserMedia 초기화.
- 실제 영상 해상도·처리 빈도 확인.
- 양쪽 눈의 상대 홍채 위치 계산.
- 양쪽 눈의 EAR(눈 종횡비) 계산. 임계값으로 깜빡임을 판정하는 것은 A의 점검 뒤에 추가하며, 첫 버전은 원시 EAR 값만 전달합니다.
- 유효·무효 측정 구분.
- 원시값과 처리값 비교 및 머리 움직임 영향 점검.
- 측정값과 줄바꿈 후보 사건을 정해진 형식으로 전달.
- 짧은 점검 기록에서 반복성과 오류 확인.

A는 PDF 파일을 열거나 줄 수를 세지 않습니다. 읽기 점수·서명 통과를 독자적으로 결정하지 않습니다. 제품 화면의 DOM을 직접 수정하지 않고 콜백으로 값을 전달합니다. 별도 측정 점검 화면에서는 그래프를 구현할 수 있습니다.

### B: 공개 데이터·특징·AI·평가

소유 파일:

- `analysis/` 이하 전체.
- `docs/B_analysis.md`
- 합의 후 전달하는 `web/models/reading-model.json`.

책임:

- 자료 다운로드 출처·버전·이용 조건 기록.
- WebQAmGaze와 OneStop을 각자 올바른 형식으로 불러오기.
- 참가자·본문·과제 구분과 결측 처리.
- 실제 계산 가능한 특징 확인.
- 첫 분류 모델과 체류 시간 기준 모델 비교.
- 평가 분리, 결과표·그래프·실패 사례 작성.
- 앱 로그를 받아 웹캠 특징의 의미와 분포 비교.
- 실시간 모델 적용 가능 여부를 근거와 함께 판단.

B는 원시 화면 시선 좌표와 홍채 상대 위치가 같다고 가정하지 않습니다. 모델을 만들었다는 이유로 앱 판정 기능을 임의로 교체하지 않습니다.

B는 **발표·데모 담당(주)**을 겸합니다. B의 분석 작업은 오프라인이라 다른 두 명을 막지 않으므로, 단계 4 이후에는 시간의 절반 정도를 발표에 씁니다.

- 소유 파일: `demo/demo-script.md`, 발표 슬라이드, 시연 영상, 경쟁 솔루션 비교표.
- 책임: 3분 시연 대본 작성, 시연 영상 녹화(C의 통합본으로, 라이브 실패 대비), 발표 자료에 실제 동작·평가·한계를 사실대로 반영. 분석 결과(공개 데이터 모델)를 발표의 “AI 분석” 섹션으로 정리.
- A는 데모 PDF 제작과 시연 환경(조명·거리·카메라 설정) 고정을 보조합니다.

### C: 웹사이트·PDF·점수·화면·통합·배포

소유 파일:

- 웹페이지 진입점 index.html, app.js, styles.css.
- 정적 파일 실행 도구와 로컬 실행 안내. (배포 안내는 선택)
- PDF·페이지 상태·점수·서명·기록 모듈.
- 봉인 모듈 `sealExport.js`(1단계). 선택인 2단계의 `verify.html`·`verify.js`.
- 공통 계약, 설정, 자산 준비·로컬 실행 스크립트, 통합 점검.
- 의존성 목록과 공통 결정 기록.

책임:

- 기본 파일 구조와 라이브러리 경로 제공.
- PDF.js 표시, 본문 줄 수 추정과 수동 대조.
- 카메라·사건 모듈 연결.
- 문서·페이지·측정 세션·구간 관리.
- 점수·서명 상태의 유일한 결정 지점.
- 봉인 발급: 서명 완료 상태에서만 발급번호를 만들고 스탬프를 삽입. 봉인 payload와 session.json의 발급번호가 일치해야 함.
- 기록 저장·내보내기.
- 실제 기능과 시험용 데이터를 화면에서 구분.
- 세 담당자의 결과를 연결하고 로컬 실행 가능한 소스 ZIP으로 제공. 발표자 맥북에 설치하고 실행을 확인.
- 정적 호스팅의 게시 폴더·자산 경로·MIME·카메라 권한·배포 버전 점검.
- 공개할 것은 앱 코드·의존 자산·점검용 문서이며 분석 원자료나 사용자 로그를 배포 폴더에 섞지 않음.


### 웹사이트 로컬 실행 방법 — C가 반드시 제공할 내용

초보자가 ‘HTML은 어디에서 실행하나요?’를 다시 질문하지 않아도 되도록 README에 아래 내용을 포함합니다.

1. 다운로드한 소스 ZIP을 압축 해제합니다.
2. 프로젝트 루트에 `web/index.html`과 `tools/serve_local.py`가 있는지 확인합니다.
3. 터미널에서 해당 프로젝트 폴더로 이동하는 방법을 안내합니다. 예를 들어 `cd ` 뒤에 Finder의 폴더를 끌어오는 방법도 설명할 수 있습니다.
4. `python3 --version`으로 Python 3 유무를 확인합니다. Python 코드 파일을 더블클릭하라고 안내하지 않습니다.
5. 루트에서 `python3 tools/serve_local.py`를 실행합니다.
6. Chrome에서 `http://localhost:8000/`에 접속합니다.
7. A의 독립 점검은 같은 서버의 `http://localhost:8000/dev/measurement.html`을 엽니다.
8. 카메라 켜기 버튼을 누르고 권한을 허용합니다. 결과와 오류 확인 방법을 안내합니다.
9. 작업이 끝나면 앱에서 측정을 중지하고, 터미널에서 Ctrl+C로 정적 서버를 종료합니다.

serve_local.py는 직접 작성하여 제공해야 합니다. 이 설명만 있고 파일이 없는 상태를 완성본이라고 전달하지 마십시오. 스크립트의 요구사항:

- 설치 패키지 없는 Python 3 표준 라이브러리로 실행.
- 스크립트 위치를 기준으로 프로젝트의 web 폴더를 찾아 해당 폴더만 제공. analysis·사용자 데이터 폴더까지 웹에 노출하지 않음.
- 기본 바인딩은 `127.0.0.1:8000`, 다중 파일 요청에 대응 가능한 서버 사용.
- `.mjs`와 `.wasm` MIME을 명시적으로 지원.
- 기본 포트가 사용 중이면 원인을 알리고 `--port 8001` 같은 대체 실행을 지원하며, 실제 접속할 주소도 출력.
- 로컬 개발 중 코드를 바꿨을 때 캐시로 옛 파일이 남지 않도록 처리하거나 강력 새로고침 방법을 안내.
- 실행 파일 제공과 실제 팀원 맥북에서의 실행 확인을 구분.

이 로컬 서버는 Python 분석 모델을 실행하는 서버가 아닙니다. 브라우저에 HTML·JS·모델·PDF worker를 제공하는 개발용 도구입니다. 최종 사이트 방문자는 Python을 설치하거나 이 명령을 실행하지 않습니다.

### 실무 보고서·포스터·데모 — 산출물 담당 (2.0.2 추가)

| 산출물 | 제출일 | 주 담당 | 기여 |
|---|---|---|---|
| 실무 보고서 | 11/12 | B | A: 측정 방법·점검 결과 섹션, C: 시스템 구조·점수 정책·화면 캡처. B가 분석 결과와 전체 편집 |
| 포스터 | 11/15 | B | C: 통합 화면·봉인 PDF 캡처, A: 파형 그래프 그림. 보고서 그림을 재사용 |
| 교수님 데모 | 11/18 | A(시연 환경·발표자), C(통합본·로컬 서버), B(대본·슬라이드·영상) | 리허설 5회 이상 |

보고서 초안 마감은 11/10 저녁입니다. 그 시점의 통합본 화면을 캡처해 넣고, 11/11에 한 번 더 고친 뒤 11/12에 제출합니다. 보고서에는 그 시점까지 실제로 동작·측정한 것만 쓰고, 봉인 1단계처럼 이후 완성될 기능은 ‘구현 중’으로 표기합니다.

### HTTPS 배포 — 선택 (2.0.2에서 범위 제외)

아래 절차는 시간이 남아 배포를 시도할 때만 따릅니다. 교수님 데모는 localhost에서 하므로 배포가 없어도 완료입니다. 배포하지 않으면 docs/deployment.md 대신 README의 로컬 실행 절차만 있으면 됩니다.

1. 로컬에서 실제 카메라·PDF·점수·서명이 연결된 web 폴더를 준비합니다.
2. 웹사이트 폴더를 올리면 HTTPS 주소를 제공하는 정적 호스팅을 선택합니다. 특정 유료 서비스·도메인 구매를 필수 조건으로 만들지 않습니다. 이용 가능한 환경과 파일 크기 제한을 먼저 확인합니다.
3. 게시 대상은 `web/` 폴더의 내용입니다. 분석 원자료·로그·서명 이미지·개인 자료를 같은 게시 폴더에 넣지 않습니다.
4. 번들러 없는 구조이므로 별도 빌드 명령을 억지로 추가하지 않습니다. 호스팅이 요구하는 게시 폴더·업로드 방법을 정확히 기록합니다.
5. HTTPS 주소를 Chrome에서 직접 열고, 초기 모델·worker 로드와 카메라 권한을 다시 확인합니다.
6. 본인 컴퓨터의 로컬 파일을 선택해 PDF 열기·페이지 이동·눈 움직임 그래프·로그 다운로드·서명 제어를 검증합니다.
7. 다른 팀원 맥북에서도 같은 주소로 실행합니다. 자신의 캐시 덕분에만 실행되는 상태가 아닌지 새로고침·새 환경에서 확인합니다.
8. 로컬 파일 경로·localhost API 주소·확장프로그램 전용 API가 배포본에 남아 있지 않은지 확인합니다.
9. 코드와 배포본에 appVersion 또는 buildId를 표시하고 기록에도 저장합니다. 세 GPT의 소스와 실제 접속 사이트 버전을 대조할 수 있어야 합니다.
10. 같은 주소를 업데이트하는 절차와 이전 정상본으로 되돌리는 절차를 docs/deployment.md에 씁니다.

배포 안내와 실제 공개 게시 작업은 구분합니다. 공유 GPT는 자신에게 사용 가능한 도구와 사용자의 실제 요청·계정 권한에 따라 게시를 수행합니다. 게시하지 않았는데 작동하는 URL을 만들어 내거나, 링크를 제공했다는 이유만으로 카메라 동작까지 검증되었다고 말하지 마십시오.

docs/deployment.md의 필수 항목:

- 로컬 실행 명령·접속 주소·서버 종료 방법.
- 호스팅 종류·실제 HTTPS 주소·게시 폴더·빌드 명령 유무.
- 자산 경로·모델 파일 용량·MIME 확인 결과.
- 사용 브라우저·macOS 환경·카메라 권한 확인 결과.
- 배포 버전과 대응하는 소스 버전.
- 실제 수행한 점검과 미확인 항목.
- 업데이트·캐시 갱신·되돌리기 방법.

### 기존 기본본이 이미 있다면 — 전환 기준

이 항목은 이전 대화가 없어도 이해할 수 있는 전환 체크리스트입니다. 아직 코드가 없다면 새 web 구조로 바로 시작합니다.

| 이전 구성 | 새 웹사이트 구성 |
|---|---|
| 브라우저에 설치하는 패키지 | URL로 접속하는 정적 사이트 |
| 전용 manifest·아이콘 실행·background.js | 사용하지 않음. index.html이 진입점 |
| 전용 API로 자원 URL 생성 | config.js의 resolveAssetUrls |
| 패키지의 app.html | web/index.html |
| 카메라 허용 | 웹사이트 출처의 브라우저 권한과 macOS 권한 확인 |
| 개발자 모드에서 폴더 불러오기 | localhost 정적 서버 접속 |
| 설치 폴더를 팀원에게 전달 | 소스 ZIP + 로컬 실행법 전달 |

A의 eyeTracker·movementDetector 함수와 B의 분석·모델·로그 규격은 유지합니다. C의 파일 경로·실행·자산 URL·배포가 주로 바뀝니다. 과거에 다른 폴더 구조로 작성한 코드를 그대로 섞지 말고 import 경로부터 확인합니다. C는 전환 내용을 docs/migration_web_v2.md에 기록합니다.

C가 모든 공통 코드를 혼자 먼저 완성할 때까지 A와 B가 기다리지는 않습니다. A는 아래 계약대로 샘플과 사건을 출력하고, B는 아래의 로그·결과 규격을 기준으로 분석을 진행합니다.

## 8. 공통 폴더 구조

```text
GazeGate/
  README.md
  web/
    index.html
    app.js
    styles.css
    modules/
      contracts.js
      config.js
      eyeTracker.js
      movementDetector.js
      pdfManager.js
      pageScoring.js
      sessionStore.js
      signature.js
      logExport.js
      sealExport.js            # 봉인 1단계: 스탬프 삽입·내려받기 (C)
    verify.html                # 봉인 2단계 선택: 검증 페이지. 1단계 완료 전에는 만들지 않음
    verify.js
    dev/
      measurement.html
      measurement.js
      integration.html
      integration.js
      fixtures.json
    vendor/
      mediapipe/
        vision_bundle.mjs
        wasm/
      pdfjs/
        pdf.mjs
        pdf.worker.mjs
        cmaps/
        standard_fonts/
      pdf-lib/
        pdf-lib.esm.min.js     # 1.17.1. 공식 패키지의 실제 파일명을 C가 확인
      fonts/
        NotoSansKR-Regular.ttf # 스탬프에 한글을 쓰려면 pdf-lib에 폰트 임베드 필요. 폰트 없으면 영문 스탬프
    models/
      face_landmarker.task
      reading-model.json       # 검증 후 제공하는 선택 파일. 없으면 불러오지 않음
  analysis/
    README.md
    requirements.txt
    notebooks/
    src/
    data/
      raw/
      processed/
    results/
      figures/
      metrics.json
      feature_dictionary.csv
      transfer_review.md
  docs/
    interface.md
    dependencies.md
    decisions.md
    A_measurement.md
    B_analysis.md
    C_integration.md
    deployment.md
    migration_web_v2.md
  tools/
    setup_assets.py
    serve_local.py
  demo/
    reading-demo.pdf
    reading-demo-ground-truth.json
    demo-script.md               # 3분 시연 대본 (B)
    signature-sample.png         # 발표자 서명 이미지 (업로드 기능 시험용)
```

지정 버전에서 `vision_bundle.mjs` 등 배포 파일 이름이 다르면 C가 공식 패키지 안의 실제 경로를 확인합니다. 공통 로컬 경로에 복사하거나, 변경할 경로를 모두에게 공유합니다. 존재하지 않는 파일을 조용히 참조하지 마십시오.

공유 저장소에 원본 데이터 전체나 대용량 영상부터 올리지 않습니다. 데이터는 다운로드 방법과 사용 파일 목록을 남깁니다. 이미 사용자의 외부 Git 저장소가 있다면 그 저장소를 사용하고, GPT마다 서로 다른 프로젝트 폴더 구조를 만들지 마십시오.

## 9. 공통 상수와 개발 설정

`contracts.js`는 계약 버전과 enum을 내보내고 `config.js`는 초기 설정을 내보냅니다. C가 소유합니다. A·B는 아래 값으로 독립 작업을 할 수 있습니다.

```js
export const CONTRACT_VERSION = 'gazegate-contract/1.1.0';

export const DEFAULT_CONFIG = {
  contractVersion: 'gazegate-contract/1.1.0',
  scorePolicyVersion: 'count-over-lines/0.1.0',
  sealPolicyVersion: 'seal/0.1.0',
  sealIssuerPrefix: 'GG',
  passThreshold: 80,
  minValidMs: 1000,
  minValidRatio: 0.70,
  maxFrameGapMs: 200,
  pageSettleMs: 500,
  maxDisplayScore: 100,
  modelRuntimeEnabled: false,
  validationLevel: 'pilot',
  mediaPipeWasmPath: './vendor/mediapipe/wasm',
  faceModelPath: './models/face_landmarker.task',
  pdfWorkerPath: './vendor/pdfjs/pdf.worker.mjs',
  sealFontPath: './vendor/fonts/NotoSansKR-Regular.ttf'
};
```

깜빡임 관련 설정은 detector와 같은 방식으로 null에서 시작합니다. A가 점검으로 값을 정하기 전까지 깜빡임 횟수는 화면에 ‘미설정’으로 표시합니다.

```js
export const BLINK_CONFIG = {
  blinkVersion: 'ear-blink/0.1.0',
  earClosedThreshold: null,
  minClosedMs: null,
  maxClosedMs: null
};
```

설명:

- 80, 1000ms, 0.70, 200ms, 500ms는 작동 시험을 위한 **초기 개발값**이며 연구로 확정된 값이 아닙니다.
- 최소 유효 시간 1초는 충분한 독서 시간을 뜻하지 않습니다. 초기 연결 시험을 위한 값입니다. 실험에 따라 조정하고 최종 결과에는 사용값을 명시합니다.
- 사건 검출의 크기·기간·반복 방지 임계값은 A가 측정으로 정합니다. 이 문서에 없는 숫자를 이미 검증된 기준처럼 쓰지 마십시오.
- 점수 관련 숫자를 모듈 안에 중복 하드코딩하지 않습니다.
- `modelRuntimeEnabled`는 B의 공개 자료 모델이 생성되었다고 자동으로 true가 되지 않습니다.
- 경로는 `index.html`이 있는 web 루트 기준입니다. 아래 URL 해석 규칙에 따라 C가 실제 브라우저 URL로 변환하여 A에 전달합니다. Chrome 전용 리소스 URL은 사용하지 않습니다.


### 웹사이트의 공통 URL 해석 규칙

DEFAULT_CONFIG 안의 자산 경로 문자열은 web 루트 기준입니다. 페이지가 `dev/measurement.html`이어도 같은 자산을 찾게 해야 합니다. 주소를 사이트 최상위 `/vendor/...`로 하드코딩하면 하위 경로 배포에서 깨질 수 있습니다.

C가 `web/modules/config.js`에 다음 추가 함수를 제공합니다. 기존 createEyeTracker 인자와 Sample·Event 형식은 바꾸지 않습니다.

```js
export function resolveAssetUrls(config = DEFAULT_CONFIG) {
  const webBaseUrl = new URL('../', import.meta.url);
  return {
    wasmBaseUrl: new URL(config.mediaPipeWasmPath, webBaseUrl).href,
    modelAssetUrl: new URL(config.faceModelPath, webBaseUrl).href,
    pdfWorkerUrl: new URL(config.pdfWorkerPath, webBaseUrl).href
  };
}
```

- app.js와 dev 화면은 이 함수를 사용합니다. 각 담당자가 서로 다른 기준으로 URL을 조립하지 않습니다.
- PDF.js의 cMaps·standard_fonts가 필요한 경우에도 같은 webBaseUrl 기준을 사용하고 C가 설정에 추가합니다.
- createEyeTracker의 wasmBaseUrl·modelAssetUrl에는 위에서 반환한 완전한 URL을 전달합니다.
- 같은 소스가 localhost와 HTTPS의 하위 경로에서도 실행되어야 합니다. 로컬 맥북의 절대 파일 경로는 배포 코드에 넣지 않습니다.
- `index.html`과 `dev/*.html`의 모듈 진입점은 각각 올바른 상대 import를 사용합니다. 앱 모듈에서는 `./eyeTracker.js` 등 실제 위치 기준을 지킵니다.

사건 검출 설정은 공통 config 안의 별도 detector 항목으로 관리합니다. C가 아래 형태를 준비하고 A가 점검 결과에 따라 null 값을 채워 전달합니다.

```js
export const DETECTOR_CONFIG = {
  detectorVersion: 'return-sweep/0.1.0',
  directionSign: null,
  maxFrameGapMs: 200,
  minAmplitudeX: null,
  minDurationMs: null,
  maxDurationMs: null,
  refractoryMs: null,
  smoothingWindowMs: 0
};
```

- minAmplitudeX는 최소 상대 이동 크기, min/maxDurationMs는 사건 기간의 범위, refractoryMs는 같은 이동을 반복 검출하지 않기 위한 간격입니다.
- 이 항목은 초기 검출기에 필요한 파라미터 이름을 맞추기 위한 것입니다. 실제 값은 A의 측정 점검으로 결정합니다.
- 필요한 값이 null인 동안 push는 사건을 반환하지 않고 diagnostics에 `configured:false`와 부족한 키를 표시합니다. C는 ‘검출 기준 미설정’으로 표시합니다. 이 상태를 정상적으로 읽기 점수를 측정 중인 상태로 위장하지 않습니다.
- 검출 기준을 시험용으로 임시 설정할 수 있지만, 설정·근거·시험 여부를 함께 기록합니다. 결과 없이 합리적으로 보이는 숫자를 검증값으로 쓰지 않습니다.
- createMovementDetector의 config에는 DETECTOR_CONFIG를 전달합니다. maxFrameGapMs는 DEFAULT_CONFIG와 같은 값으로 유지합니다.
- 필요 파라미터가 더 생기면 공통 변경으로 추가합니다.

## 10. 시간·문서·페이지·구간의 의미

서로 다른 GPT가 가장 쉽게 다르게 구현하는 부분이므로 다음을 고정합니다.

| 항목 | 규칙 |
|---|---|
| `documentId` | PDF를 새로 불러올 때마다 생성하는 고유 문자열. 법적 해시나 증명이 아님 |
| `sessionId` | 해당 문서에 대한 측정·점수 기록 묶음의 고유 문자열 |
| `pageId` | 사용자에게 보이는 1부터 시작하는 페이지 번호 |
| `segmentId` | 한 페이지에서 연속으로 측정한 구간의 고유 문자열 |
| `tMs` | 세션 시작 이후의 경과 시간, 밀리초, 유한한 0 이상의 숫자 |
| `seq` | 같은 세션 내에서 처리한 카메라 프레임의 순번, 0 이상 정수 |
| `eventId` | 세션 내에서 중복되지 않는 사건 ID |

- 하나의 세션 안에서는 카메라를 멈췄다가 다시 시작해도 시간 기준을 다시 0으로 만들지 않습니다.
- C가 `sessionT0 = performance.now()`를 정합니다. A는 촬영 프레임을 추론에 넣는 시점의 `performance.now() - sessionT0`를 기록합니다. 처리 완료 시각으로 대체하지 않습니다.
- Worker를 사용하면 메인 탭에서 정한 프레임 시각을 전달하고 그대로 돌려받습니다. Worker의 다른 시간 원점을 섞지 않습니다.
- `seq`와 사건 번호는 같은 세션의 재시작에서도 이어집니다. 새 세션만 초기화합니다.
- `Date.now()`는 내보내기 파일의 실제 기록 날짜 등에 사용할 수 있지만 분석 경과 시간과 섞지 않습니다.
- 새 PDF를 열면 새 documentId와 sessionId를 만듭니다.
- 페이지 이동·수동 중지·탭 비활성화·창 크기 변경·카메라 재시작 시 측정 구간을 끊고, 재개 시 새 segmentId를 만듭니다.
- 현재 측정 구간이 시작되기 전에 촬영한 늦게 도착한 프레임은 현재 페이지에 귀속하지 않고 버립니다.

## 11. 측정 좌표 규칙

MediaPipe 결과는 **가공 전 카메라 영상 좌표**에서 계산합니다. 화면에 거울 미리보기를 보여주기 위한 CSS 반전은 분석 좌표에 적용하지 않습니다.

- 좌표의 +X는 반전되지 않은 카메라 영상에서 오른쪽, +Y는 아래쪽입니다.
- `left`와 `right`는 사용자의 해부학적 왼쪽 눈·오른쪽 눈입니다. 화면에서 왼쪽에 보이는 눈이라는 뜻이 아닙니다.
- x 상대 위치는 각 눈의 두 끝점 중 영상 x가 작은 위치를 0, 큰 위치를 1로 두어 계산합니다.
- 홍채 중심은 지정된 홍채 랜드마크로 추정합니다. 사용한 번호와 계산식은 A 문서에 기록합니다.
- x값은 대략 0~1 범위지만 잡음 때문에 벗어날 수 있습니다. 무조건 잘라 정상값처럼 쓰지 말고 품질을 확인합니다.
- 큰 눈 왕복에서 x가 어떻게 변하는지 실제 점검합니다. ‘왼쪽 이동’의 부호를 미리보기 좌우와 혼동하지 마십시오.
- 사용자 화면에서 오른쪽을 볼 때 영상 상대좌표가 커지는지 작아지는지 A가 확인하고, detector가 사용하는 화면 방향으로 변환하는 `directionSign`(+1 또는 -1)을 기록합니다.
- detector 설정의 directionSign은 확인 전에는 null입니다. 확인되지 않은 부호로 줄바꿈 후보를 발행하지 않습니다. 영상 상대 x에 directionSign을 곱한 값은 사용자가 화면 오른쪽을 볼수록 증가하도록 정의합니다. 값의 변화량을 사용하므로 상수 오프셋을 더할 필요는 없습니다.
- 눈 폭으로 나누는 정규화는 영상 속 얼굴의 평행 이동 영향을 일부 줄이는 방법입니다. 고개 회전이나 실제 화면 시선 위치까지 완벽히 보정하는 방법이 아닙니다.
- y 상대좌표가 필요하면 영상에서의 눈 높이 기준을 별도로 정의하고 품질을 검토합니다. 불안정하면 null을 허용하며, 첫 사건 검출은 x를 우선 사용합니다.

### EAR(눈 종횡비) 규칙

- EAR = (위·아래 눈꺼풀 랜드마크 사이 세로 거리의 평균) / (눈 양끝 가로 거리). 눈을 감으면 0에 가까워지고 뜨면 커집니다. 사용한 랜드마크 번호와 식은 A 문서에 기록합니다.
- 각 눈마다 계산하여 `leftEar`·`rightEar`로 전달합니다. 두 눈 평균은 C가 계산합니다.
- 값은 대략 0~0.5 범위지만 얼굴 각도·안경에 따라 달라집니다. 사람마다 기준선이 다르므로 절대값으로 ‘감음’을 단정하지 말고, 세션 초반의 값 분포를 참고합니다.
- 깜빡임 횟수는 EAR이 `earClosedThreshold` 아래로 `minClosedMs`~`maxClosedMs` 동안 머문 구간을 한 번으로 셉니다. 값이 null이면 세지 않습니다.
- 눈을 감은 프레임의 홍채 x는 신뢰할 수 없으므로 A는 그 프레임을 `eye_unreliable`로 표시할 수 있습니다. 이때도 EAR 값은 유효 숫자로 전달합니다.
- 첫 버전에서 깜빡임은 통과 판정에 쓰지 않습니다. 화면 표시·로그·B의 분석 입력까지입니다. 판정 조건에 넣으려면 공통 변경 제안이 필요합니다.

### headMotion 초기 규칙

첫 연결 버전에서는 `headMotion`을 null로 허용합니다. 머리 보정을 완성하지 않았는데 0을 넣어 ‘머리가 안정적’이라고 표시하지 마십시오.

계산을 추가할 때는 식·단위·경계값을 `docs/interface.md`에 추가합니다. 예를 들어 눈 간 거리로 정규화한 얼굴 기준점 이동 속도와 각도 변화를 서로 같은 숫자처럼 빼지 마십시오. 회전 영향은 별도의 품질 조건으로 처리할 수 있습니다.

## 12. A가 출력하는 EyeSample 형식

JSON 예시는 형식을 설명하기 위한 가상 숫자입니다. 실제 실험 결과가 아닙니다.

```json
{
  "contractVersion": "gazegate-contract/1.1.0",
  "source": "mediapipe_iris",
  "sessionId": "session-example",
  "seq": 12,
  "tMs": 1250,
  "valid": true,
  "leftIrisX": 0.48,
  "rightIrisX": 0.51,
  "leftIrisY": null,
  "rightIrisY": null,
  "leftEar": 0.31,
  "rightEar": 0.30,
  "headMotion": null,
  "invalidReason": null
}
```

필수 규칙:

- 모든 키는 항상 포함합니다. 측정되지 않은 숫자는 null입니다. undefined, NaN, Infinity는 내보내지 않습니다.
- 양쪽 눈 x가 모두 유효하면 평균을 사용합니다. 한쪽 눈만 유효한 경우 첫 버전에서는 `valid:false`로 처리합니다. 한쪽만 사용하는 대안은 공통 변경 제안으로 다룹니다.
- 무효일 때 두 x와 두 y는 null, invalidReason은 문자열입니다. headMotion과 두 EAR은 별도로 계산되었다면 유효 숫자일 수 있습니다. 얼굴이 없으면 EAR도 null입니다.
- `leftEar`·`rightEar`는 1.1.0에서 추가된 키입니다. 아직 계산하지 않았으면 null로 보내되 키는 항상 포함합니다.
- invalidReason의 초기 값은 `no_face`, `multiple_faces`, `eye_unreliable`, `head_motion`, `timestamp_error` 중 하나입니다.
- 카메라 권한 거부·모델 파일 누락처럼 시작 자체가 실패한 문제는 Sample로 위장하지 않고 onError로 전달합니다.
- 눈이 가려지는 등 검출이 불안정한 프레임은 eye_unreliable로 표시하고 유효 측정에서 제외합니다.
- 프레임마다 동일한 시각을 재전송하지 않습니다. 실제 처리 빈도는 tMs 차이로 계산합니다.
- A는 pageId나 documentId를 추측하여 넣지 않습니다. C가 앱 상태와 연결합니다.

## 13. A의 eyeTracker 공개 함수 계약

`eyeTracker.js`는 다음 이름의 함수를 export합니다.

```js
export async function createEyeTracker({
  videoElement,
  wasmBaseUrl,
  modelAssetUrl,
  onSample,
  onError
}) {
  // Tracker 객체를 반환
}
```

반환 객체:

```js
{
  start: async ({ sessionId, sessionT0 }) => {},
  stop: async () => {},
  destroy: async () => {},
  getDiagnostics: () => ({})
}
```

동작 규칙:

- `createEyeTracker`는 라이브러리·모델을 준비하고 카메라는 아직 켜지 않습니다.
- `start`는 사용자 클릭 이후 호출하며 카메라를 열어 분석을 시작합니다. 성공하면 Promise가 완료됩니다.
- 이미 실행 중인 상태에서 같은 세션으로 start를 다시 불러도 두 번째 분석 루프를 만들지 않습니다.
- 다른 세션으로 바꾸려면 C가 먼저 stop을 호출합니다.
- `stop`은 분석 루프를 중지하고 MediaStream track을 정리합니다. idempotent, 즉 여러 번 호출해도 안전해야 합니다.
- `destroy`는 stop과 모델 자원 정리를 수행합니다. destroy 뒤에는 같은 객체를 재사용하지 않고 새로 만듭니다.
- stop/destroy 이후 진행 중이던 이전 추론의 결과는 콜백으로 내보내지 않습니다. 세대 번호 등으로 늦은 결과를 무시합니다.
- onSample은 EyeSample을 전달하는 함수입니다.
- onError는 `{code, message, recoverable}` 형식을 전달합니다. 시작 Promise도 reject할 수 있지만 오류 UI가 두 번 나타나지 않도록 C가 중복 처리합니다.
- diagnostics에는 실제 videoWidth·videoHeight, 요청한 카메라 설정, 처리한 프레임 수, 처리 빈도 추정, 모델·패키지 버전을 포함합니다. 아직 알 수 없는 값은 null입니다.
- MediaPipe는 VIDEO 모드, 한 얼굴 기준으로 시작합니다. 구체적인 검출 confidence 설정은 기록하며 landmark마다 존재하지 않는 confidence를 있다고 가정하지 않습니다.
- `multiple_faces`는 실제로 복수 얼굴을 확인할 수 있게 구현했을 때만 사용합니다. 최대 한 얼굴만 출력하게 설정한 상태에서 ‘다른 얼굴이 없음까지 확인했다’고 주장하지 않습니다.
- 실제 API 이름과 패키지 내용을 확인해 구현합니다. 문서에 함수 계약이 있다는 이유로 라이브러리에 동일한 함수가 존재한다고 가정하지 마십시오.

## 14. 움직임 검출 모듈 계약

`movementDetector.js`:

```js
export function createMovementDetector({ config }) {
  // Detector 객체를 반환
}
```

반환 객체:

```js
{
  push: ({ sample, pageId, segmentId }) => [],
  reset: () => {},
  getDiagnostics: () => ({})
}
```

- push는 0개 이상의 MovementEvent 배열을 반환합니다. 비동기로 과거 페이지에 사건을 추가하지 않습니다.
- C가 유효한 페이지 측정 구간에서 push를 호출합니다.
- 무효 Sample은 사건을 만들지 않으며 detector의 이어진 움직임 이력을 끊습니다.
- segmentId 변경, 시간 역행, maxFrameGapMs보다 긴 프레임 공백에서도 이력을 끊습니다.
- reset은 이력을 비우되 같은 세션 내 eventId 번호를 재사용하지 않습니다.
- 새 세션에는 detector도 새로 생성합니다.
- 한 큰 이동이 여러 프레임에 이어져도 한 사건으로 묶습니다. 연속 음의 변화 프레임마다 한 사건을 발행하면 안 됩니다.
- detector 입력은 개별 프레임이고, 화면 요약창 갱신 주기와 별개입니다. 그래프가 3초마다 갱신된다고 3초에 한 번만 눈을 측정하지 마십시오.

MovementEvent:

```json
{
  "contractVersion": "gazegate-contract/1.1.0",
  "sessionId": "session-example",
  "eventId": "session-example:event:1",
  "pageId": 1,
  "segmentId": "segment-example",
  "tMs": 2400,
  "type": "return_sweep_candidate",
  "amplitudeX": 0.12,
  "durationMs": 160,
  "detectorVersion": "return-sweep/0.1.0"
}
```

- tMs는 후보 이동이 완료되어 확인된 시각입니다. 사건 시작과 끝 모두 동일 segment 안에 있어야 합니다.
- amplitudeX는 화면 방향으로 변환한 상대 x 변화의 크기이며, 사건의 크기를 양수로 기록합니다. durationMs는 유한한 양수입니다.
- 부가 confidence 확률을 근거 없이 만들어 내지 않습니다.
- 초기 단계에서는 ‘줄바꿈 후보’라는 이름을 유지합니다. 실제로 다음 줄을 읽었다는 정답이 아닙니다.
- 큰 왼쪽 이동만 세는 1차 검출기를 먼저 만들고, 읽기 진행 양상과 사건 전후 패턴 등의 보완은 검출 결과를 본 뒤 추가합니다.
- 지나친 평활화로 빠른 이동이 사라지지 않도록 원시 그래프도 보존합니다.

## 15. C의 페이지 전환과 프레임 귀속 순서

페이지 변경 함수는 다음 순서를 지킵니다.

1. 현재 segment를 닫고 사건 입력을 중지합니다.
2. detector.reset을 호출합니다.
3. PDF의 새 페이지 렌더링과 줄 수 확인을 기다립니다.
4. pageSettleMs 동안 사건을 누적하지 않습니다.
5. 카메라가 준비되고 탭이 보이며 페이지가 지원되는 경우 새 segmentId를 만듭니다.
6. 새 segment 시작 시각 이후의 프레임만 분석에 넣습니다.

이전 페이지 프레임과 새 페이지 프레임을 비교하여 생기는 큰 이동을 줄바꿈 사건으로 세지 않습니다. 페이지 이동 자체, 창 크기 변경, 카메라 재연결을 사건으로 세지 않습니다.

tab visibility가 hidden이 되면 측정을 일시정지하고 해당 구간을 끊습니다. 탭이 다시 보일 때 자동으로 과거 시간이나 사건을 보충하지 않습니다. 첫 구현은 사용자가 재개 버튼을 누르는 방식으로 합니다.

## 16. C의 PDF 모듈 계약

`pdfManager.js`:

```js
export async function createPdfManager({ canvasElement, config }) {
  // PdfManager 반환
}
```

반환 객체:

```js
{
  open: async (file) => ({ pageCount: 3 }),
  renderPage: async (pageId) => ({
    pageId: 1,
    lineCount: 10,
    supported: true,
    unsupportedReason: null
  }),
  close: async () => {}
}
```

- open은 브라우저 File 객체를 받습니다. 반환될 pageCount는 실제 파일에서 읽습니다.
- 문서 식별자는 app에서 생성합니다. 모듈은 전역 currentPage나 점수 상태를 숨겨서 따로 관리하지 않습니다.
- 새 파일을 열 때 이전 렌더 작업을 취소하고 이전 문서를 정리합니다.
- 빠른 연속 페이지 이동으로 늦게 끝난 이전 페이지가 새 페이지를 덮어쓰지 않도록 render 요청 번호를 사용합니다.
- 줄 수는 getTextContent의 items 개수와 같다고 가정하지 않습니다. 텍스트 위치를 이용해 같은 줄의 조각을 묶습니다.
- 첫 버전은 수평 단일 열 본문을 대상으로 하며, 글자 크기·좌표·줄 간격을 고려한 묶기 규칙을 기록합니다.
- 본문 이외 머리말·꼬리말·페이지 번호 제외 기준은 코드와 결과에 명시합니다. 시연 문서는 이런 요소를 최소화하고 사람이 줄 수를 대조합니다.
- `demo/reading-demo-ground-truth.json`은 사람이 확인한 각 페이지의 본문 줄 수를 담습니다. 자동 계산 결과를 그대로 복사하여 정답이라고 하지 마십시오.
- 지원되지 않는 페이지는 supported:false, lineCount:null, 사유를 반환합니다. 최소 사유: no_text, unsupported_layout, line_count_failed.
- 빈 페이지를 0으로 나눈 뒤 100점으로 표시하지 않습니다.
- 암호·손상 파일·텍스트 추출 실패는 사용자에게 설명하고 자동 통과하지 않습니다.

## 17. 점수 정책과 페이지 상태 계약

`pageScoring.js`는 DOM이나 카메라를 직접 사용하지 않는 순수 함수로 구현합니다.

```js
export function evaluatePage(pageState, config) {
  // PageEvaluation 반환
}
```

입력 PageState:

```json
{
  "pageId": 1,
  "lineCount": 10,
  "supported": true,
  "acceptedEventCount": 8,
  "activeMs": 10000,
  "validMs": 8500
}
```

출력 PageEvaluation:

```json
{
  "scorePolicyVersion": "count-over-lines/0.1.0",
  "pageId": 1,
  "rawScore": 80,
  "displayScore": 80,
  "validRatio": 0.85,
  "passed": true,
  "status": "passed",
  "reasonCodes": []
}
```

계산 규칙:

- 먼저 supported와 lineCount를 확인합니다. 지원되지 않는 페이지에서는 나눗셈을 하지 않습니다.
- rawScore = acceptedEventCount / lineCount × 100. 중간에 정수로 반올림하지 않습니다.
- displayScore = min(100, max(0, rawScore)). 화면 표시만 반올림하고 판정에는 반올림 전 값을 사용합니다.
- validRatio = activeMs > 0 ? validMs / activeMs : 0.
- passed는 supported가 true이고 lineCount가 양의 정수이며, rawScore가 passThreshold 이상이고, validMs가 minValidMs 이상이며, validRatio가 minValidRatio 이상일 때만 true입니다.

추가 규칙:

- pageState의 카운트는 고유한 사건 ID 집합에서 계산한 0 이상의 정수입니다. 음수·NaN·비정상 입력은 조용히 보정하지 말고 오류를 반환하거나 호출자에게 알립니다.
- validMs는 0 이상이며 activeMs를 넘을 수 없습니다.
- status는 unsupported → unmeasured → insufficient_quality → passed/not_passed 순으로 평가합니다. unmeasured는 activeMs가 0인 경우입니다.
- reasonCodes는 unsupported_page, insufficient_measurement, insufficient_quality, score_below_threshold, no_reading_events 등을 배열로 반환합니다.
- `no_reading_events`(1.1.0 추가)는 validMs가 minValidMs 이상인데 acceptedEventCount가 0인 경우에 score_below_threshold와 **함께** 붙입니다. 화면에서는 ‘줄바꿈 후보 사건 없음’으로 표시합니다. 시연에서 “스크롤만 넘긴 경우(점수 미달)”와 “화면만 바라본 경우(사건 없음)”를 구분해 보여주기 위한 코드이며, 사용자의 상태를 분류했다는 뜻이 아닙니다. status 값은 그대로 not_passed입니다.
- 지원 불가일 때 rawScore와 displayScore는 null이며 passed:false입니다.
- 지원되는 미측정 페이지는 점수 0, status:unmeasured, passed:false입니다.
- passed는 현재 누적 상태에서 재평가합니다. 한 번 통과했다고 영구 통과로 고정하지 않습니다. 이후 무효 측정이 늘어 품질이 떨어지면 다시 미달할 수 있으며, 앱은 그 이유를 표시합니다.
- acceptedEventCount는 누적 사건 ID로만 갱신합니다. UI가 새로 그려지거나 페이지에 다시 방문했다는 이유로 증가하지 않습니다.
- 같은 페이지의 여러 segment의 시간·사건은 합산합니다. segment 사이 공백은 activeMs에 넣지 않습니다.

### 시간 누적의 구체적 규칙

- 각 segment의 첫 프레임은 시간 증가 0입니다.
- 같은 segment의 연속 두 프레임의 dt가 양수이고 maxFrameGapMs 이하이면 activeMs에 dt를 추가합니다.
- 그 두 프레임이 모두 valid일 때만 validMs에도 dt를 추가합니다.
- dt가 너무 크거나 역행하면 두 시간에 추가하지 않고 이력을 끊습니다.
- 무효 프레임이 정상 간격으로 도착하면 activeMs만 늘어납니다.
- 카메라가 완전히 끊겨 프레임이 없으면 중지 상태로 전환합니다. 정지 시간 전체를 유효 시간으로 계산하지 않습니다.
- 프레임 개수 비율을 시간 비율로 표시하지 않습니다.

### 점수의 한계와 변경

10줄을 한 번 읽을 때 줄 사이 이동은 보통 9번이므로 원안의 분모에는 검토할 부분이 있습니다. 첫 계약에서는 사용자 기획의 count/lineCount를 그대로 유지합니다. 분모를 lineCount-1로 바꾸거나 다른 특성을 추가하려면 정책 버전 변경과 결과 비교를 포함한 공통 변경안을 제출합니다. 단순히 수식만 바꾸고 ‘읽은 줄 비율이 검증됨’이라고 주장하지 않습니다.

## 18. 세션 상태·기록·서명

세션 상태는 C의 `sessionStore.js` 한곳에서 관리합니다.

필수 상태:

- documentId, sessionId, pageCount, contractVersion, configSnapshot.
- sessionT0, 실제 시작 날짜.
- 페이지별 PageState와 PageEvaluation.
- 현재 pageId, 현재 segmentId, 측정 상태.
- 샘플 로그, 사건 로그, 이미 수신한 eventId 집합.
- 페이지별 깜빡임 횟수(설정 전에는 null)와 세션 평균 EAR.
- 동의 체크 상태, 서명 상태, 서명 입력 방식(drawn / uploaded), 서명 이미지의 SHA-256 해시.
- 봉인 발급 상태(미발급 / 발급됨), 발급번호, 발급 일시.

처리 함수의 이름은 다음을 사용합니다. 내부 구현은 자유지만 역할과 반환 의미는 유지합니다.

```js
export function createSessionStore({ documentId, sessionId, pageCount, config }) {
  return {
    registerPage: (pageInfo) => {},
    beginSegment: ({ pageId, segmentId, tMs }) => {},
    endSegment: ({ tMs, reason }) => {},
    acceptSample: ({ sample, pageId, segmentId }) => {},
    acceptEvents: (events) => {},
    getPage: (pageId) => ({}),
    getSnapshot: () => ({}),
    canSign: () => false
  };
}
```

- registerPage는 줄 수와 supported 정보를 등록합니다. 재방문했다는 이유로 기존 사건이나 시간을 초기화하지 않습니다.
- begin/endSegment는 측정 구간의 경계를 만듭니다. 등록되지 않은 페이지는 측정을 시작하지 않습니다.
- acceptSample은 C가 현재 구간의 입력으로 채택한 샘플만 기록하고 시간을 누적합니다. 무효 샘플도 오류와 품질 비율 확인을 위해 기록합니다.
- acceptEvents는 session·page·segment가 현재 측정 문맥과 다른 사건을 거절합니다. 같은 eventId 재전송은 중복 누적하지 않습니다.
- getPage와 getSnapshot은 외부에서 변경해도 내부 상태가 바뀌지 않는 복사본을 반환합니다. JSON으로 저장할 때 브라우저의 File·Map·Set·DOM 자체를 넣지 말고 직렬화 가능한 값으로 변환합니다.
- canSign은 문서의 모든 페이지가 등록되었고 모든 페이지가 passed:true일 때만 true입니다.
- pageCount는 PDF를 실제로 연 결과에서 전달하는 양의 정수입니다. 등록된 페이지 목록의 길이로 전체 페이지 수를 추정하지 않습니다. pageId는 1~pageCount 범위여야 합니다.

서명 규칙:

- 사용자가 ‘동의·서명 진행’ 버튼을 누르면 먼저 측정을 멈추고 모든 페이지 상태를 재평가합니다.
- canSign이 true이면 동의 체크와 서명 캔버스를 활성화합니다.
- 동의 체크와 비어 있지 않은 서명 입력이 모두 있어야 ‘완료’가 됩니다.
- 점수 상태가 더 이상 충족되지 않으면 최종 확정을 거절합니다. 새 문서를 열면 서명·동의 상태를 초기화합니다.
- 앱의 서명 입력을 제3자 전자계약 서비스의 버튼 제어 또는 법적 전자서명 인증으로 설명하지 마십시오.
- 서명 화면과 로그의 문서 식별자가 현재 문서와 일치해야 합니다.
- 서명 입력 방식은 캔버스 그리기가 기본이고, 이미지 업로드는 선택입니다. 업로드를 지원할 때는 PNG/JPG만 받고 2MB 이하로 제한하며, 업로드한 이미지는 서버로 보내지 않고 메모리에서만 다룹니다. 어떤 방식이든 최종 서명 이미지(PNG)의 SHA-256 해시를 세션 상태에 기록합니다.
- 서명이 책임을 귀속시키는 논리는 발표에서 다음과 같이만 설명합니다: “서명은 서명자가 기록에 구속된다는 의사표시이므로 누가 물리적으로 읽었든 서명자가 책임을 진다. GazeGate는 ‘서명했지만 읽기 기록이 없다’는 상황을 없앤다.” 이것을 법적 효력 검증으로 확대하지 않습니다.

### 봉인(Seal) 1단계 계약 — `sealExport.js`

```js
export async function issueSeal({ pdfFile, snapshot, signaturePng, config }) {
  // { sealId, issuedAt, sealedPdfBlob, sealPayload } 반환
}
```

- 호출 조건: `canSign()`이 true이고 동의 체크와 서명이 완료된 상태에서만 C가 호출합니다. 그 외 상태에서 호출되면 오류를 반환하고 PDF를 만들지 않습니다.
- `sealId` 형식: `GG-YYYYMMDD-XXXX`. 날짜는 발급 시점의 로컬 날짜, XXXX는 `crypto.getRandomValues`로 만든 대문자 영숫자 4자. 세션당 한 번만 발급하며 재발급은 새 sealId입니다.
- `issuedAt`: ISO 8601 문자열, 시간대 오프셋 포함(예: `2026-11-15T14:03:21+09:00`).
- 스탬프 삽입: pdf-lib로 원본 PDF를 열어 **마지막 페이지 뒤에 새 페이지 1장을 추가**하고 거기에 스탬프를 그립니다. 원본 페이지의 내용·배치를 수정하지 않습니다. 원본 페이지 위에 겹쳐 찍는 방식은 본문을 가릴 수 있어 첫 버전에서 쓰지 않습니다.
- 스탬프에 쓰는 내용: 제목(`GazeGate Seal`), sealId, issuedAt, 문서 페이지 수, 페이지별 displayScore·passed 표, 서명 이미지(가로 최대 200pt), 앱 버전·점수 정책 버전·계약 버전, 한 줄 고지 “이 봉인은 GazeGate 뷰어에서 읽기 기준 충족 기록에 서명했음을 나타냅니다. 신원 인증이나 법적 효력을 뜻하지 않습니다.”
- 한글 표기는 pdf-lib에 TTF 폰트를 임베드해야 합니다. `sealFontPath`의 폰트를 불러오지 못하면 영문 스탬프로 대체하고 그 사실을 화면에 표시합니다. 폰트 라이선스(OFL 등)를 docs/dependencies.md에 기록합니다.
- PDF 메타데이터: Subject에 `GazeGate Seal <sealId>`, Keywords에 `gazegate-seal/0.1.0`을 씁니다. 사용자의 원래 Title·Author는 보존합니다.
- `sealPayload`는 session.json에 포함되고, 같은 내용을 pdf-lib의 Custom metadata나 Keywords에 넣을 수 있으면 넣습니다. 넣지 못하면 session.json만으로 충분합니다.
- 내려받기 파일명: `<원본이름>.gazegate-<sealId>.pdf`와 `session-<sealId>.json`. 두 파일의 sealId는 같아야 합니다.
- 봉인 발급 후에는 측정을 재개하지 않습니다. 새 문서를 열면 봉인 상태를 초기화합니다.

`sealPayload` 최소 항목:

```json
{
  "schemaVersion": "gazegate-seal/0.1.0",
  "sealId": "GG-20261115-7F3A",
  "issuedAt": "2026-11-15T14:03:21+09:00",
  "documentId": "doc-example",
  "sessionId": "session-example",
  "pageCount": 3,
  "pages": [
    { "pageId": 1, "displayScore": 90, "passed": true },
    { "pageId": 2, "displayScore": 100, "passed": true },
    { "pageId": 3, "displayScore": 83, "passed": true }
  ],
  "signatureMethod": "drawn",
  "signatureImageSha256": "…",
  "appVersion": "…",
  "contractVersion": "gazegate-contract/1.1.0",
  "scorePolicyVersion": "count-over-lines/0.1.0",
  "sealPolicyVersion": "seal/0.1.0",
  "originalPdfSha256": null,
  "sealSignature": null
}
```

`originalPdfSha256`과 `sealSignature`는 2단계용 자리이며 1단계에서는 null입니다. 숫자는 가상 예시입니다.

### 봉인 2단계 (선택) — 시작 조건과 규칙

1단계 스탬프가 localhost에서 동작하고 단계 5가 끝난 뒤에만 시작합니다. 시작하면 다음을 지킵니다.

- `originalPdfSha256`: 사용자가 연 원본 PDF 바이트의 SHA-256(WebCrypto `crypto.subtle.digest`). 봉인된 PDF의 해시가 아닙니다.
- `sealSignature`: `sealSignature`를 null로 둔 payload를 정렬된 JSON 문자열로 만들어 WebCrypto ECDSA P-256(브라우저 지원이 넓음)으로 서명한 base64. Ed25519는 브라우저 지원을 확인한 뒤에만 씁니다.
- 데모용 키 쌍은 C가 한 번 생성해 개인키는 뷰어 코드에, 공개키는 verify.js에 둡니다. 이것이 데모 한정 구성임을 발표에서 밝힙니다(실서비스는 서버 측 서명).
- QR 코드에는 sealId와 payload 해시만 넣습니다. payload 전체를 QR에 넣으면 밀도가 너무 높습니다.
- `verify.html`: 봉인된 PDF와 session-<sealId>.json을 함께 올리면, (1) JSON의 sealSignature를 공개키로 확인, (2) PDF 메타데이터의 sealId가 JSON과 일치하는지 확인, (3) 사용자가 원본 PDF도 올렸다면 해시 일치를 확인. 결과는 ‘확인됨 / 서명 불일치 / 문서 불일치 / 확인 불가’ 중 하나입니다.
- 검증 페이지는 어떤 파일도 서버로 보내지 않습니다.
- 2단계를 완성하지 못했으면 발표에서 1단계까지만 말하고, 2단계는 로드맵에 둡니다.

## 19. 사용자 화면의 필수 표시

왼쪽 또는 중앙: PDF.

옆 측정 패널:

- 카메라 시작·중지, 측정 시작·일시정지·재개.
- 현재 페이지 번호/전체 페이지 수.
- 본문 줄 수.
- 현재 줄바꿈 후보 사건 수.
- 페이지 점수.
- 유효 측정 시간과 상태.
- 페이지 목록의 미측정·미달·기준 충족·지원 불가 표시.
- 눈 움직임 그래프(홍채 x). 같은 패널에 EAR 그래프를 작은 두 번째 줄로 표시.
- 페이지별 깜빡임 횟수(설정 전에는 ‘미설정’).
- 동의·서명 진행 버튼.
- 봉인 발급 버튼(서명 완료 후에만 활성화)과 발급 결과(sealId, 발급 일시, 내려받기 링크).
- 기록 다운로드.
- 측정 중임을 알리는 표시(카메라 아이콘 등)를 항상 보이게 함.

문구 예:

- ‘측정 준비 중’
- ‘눈이 안정적으로 검출되지 않습니다’
- ‘페이지 기준 충족’
- ‘미달 페이지 1개’
- ‘줄바꿈 후보 사건 없음’ (no_reading_events)
- ‘이 페이지는 현재 버전에서 처리할 수 없습니다’
- ‘초기 기준에 따른 시연용 판정’
- ‘봉인 발급됨 · GG-20261115-7F3A’

‘정독 100% 증명’, ‘완벽하게 읽음’, ‘이해 완료’, ‘위조 불가’, ‘법적 효력’ 등 검증되지 않은 표현을 사용하지 않습니다. ‘Skimming detected’처럼 사용자의 행동을 단정하는 문구 대신 측정 사실(사건 수, 점수, 시간)을 표시합니다. 반대로 사용자의 목표를 빼고 단순 그래프만 완제품이라고 보고하지 않습니다.

## 20. WebQAmGaze에 대한 설명과 B의 시작 작업

WebQAmGaze는 사람들에게 글을 읽게 한 후 웹캠 기반 WebGazer로 추정한 시선 위치를 기록한 공개 자료입니다. 설치하면 우리 정독 판별이 완성되는 소프트웨어나 완성된 AI 모델이 아닙니다. 원시 기록, 일부 정리된 자료와 코드·관련 분석이 있습니다.

공식 저장소:

https://github.com/tfnribeiro/WebQAmGaze

처음 확인할 곳:

- `scripts/pre_processed_data/`
- `scripts/experiment_data/README.md`
- `scripts/Loading Eye-Tracking Data + Word Boundaries.ipynb`

README 설명과 실제 경로가 다른 경우 저장소 트리에서 실재 파일을 확인합니다. 위 경로도 버전 변경 가능성이 있으므로 사용 커밋을 기록합니다.

기존 조사에서 실제 JSON 샘플에 다음 키가 있음을 확인했습니다.

- worker_id, set_name, set_trials.
- screen_x, screen_y.
- webgazer_raw_data, webgazer_filtered_data.
- webgazer_sample_rate.
- trial_0_condition 등의 과제별 항목.

조사한 샘플의 condition 값은 nr와 is였으며, raw_data는 JSON 문자열 안에 과제별 점 배열이 들어가는 형태였습니다. ‘이미 JSON으로 열었으니 내부도 바로 배열’이라고 가정하지 말고 실제 타입을 확인합니다. 관찰한 점 배열은 x, y, 시간 형태로 해석 가능한 3개 값이었지만 단위와 의미는 수집 코드·예제와 대조한 뒤 확정합니다.

과제 의미:

- nr: 글을 먼저 읽고 이후 질문에 답하는 과제.
- is: 질문을 먼저 보고 글에서 답을 찾는 과제.

처음에는 영어 자료 소수 참가자만 사용합니다. 동일 참가자에게 어떤 과제가 있는지 표로 확인한 후 범위를 늘립니다. 본문 읽기와 질문·응답 구간을 구분하며, 질문 화면 시선을 본문 데이터로 섞지 않습니다.

웹캠 자료라고 30Hz 고정 간격으로 가정하지 않습니다. 실제 t값과 프레임 공백을 사용합니다. 한 샘플에서 약 17Hz를 관찰했으나 전체 자료의 고정 사양으로 주장하지 않습니다.

자료마다 화면 크기·글 배치·텍스트 길이·측정 품질이 다릅니다. 과제 차이가 아닌 글 길이·출처·화면 크기만으로 분류되는지 점검합니다. 가능하면 문서 길이를 맞추거나 영향 분석을 함께 수행합니다.

## 21. OneStop에 대한 설명과 사용 순서

OneStop Eye Movements는 전문 시선추적기로 수집한 영어 읽기 자료입니다. 일반 읽기와 정보 탐색 외에도 반복 읽기 등이 포함되어 있습니다. 첫 분석에서는 최초 읽기 두 조건만 사용합니다.

공식 설명:

- https://lacclab.github.io/OneStop-Eye-Movements/
- https://lacclab.github.io/OneStop-Eye-Movements/variables

처음에는 본문 구간의 `fixations_Paragraph.csv`를 검토합니다. 공식 변수 설명에서 question_preview와 참가자 ID, 글 ID, 반복 여부를 확인하여 두 조건을 구분합니다. 값이 다른 파일에 있으면 식별자로 조인하고, 행 순서만으로 합치지 않습니다.

공식 문서에는 단어·시선 고정 단위의 보고서와 원자료 안내가 있으나, 실제로 내려받을 수 있는 파일은 시작 시 확인합니다. 원자료가 없거나 접근할 수 없으면 없는 데이터를 있다고 가정하지 마십시오.

전문 장비의 fixation을 1ms 간격 영상 프레임으로 취급하면 안 됩니다. 고정 사건 테이블의 두 행 사이 차이는 매 프레임 시선 속도와 다릅니다.

사용 순서:

1. WebQAmGaze 불러오기와 특징 계산 흐름 완성.
2. OneStop의 실제 열 이름·단위와 사용 가능 파일 확인.
3. 동일 의미로 계산할 수 있는 특징만 비교.
4. 장비별로 따로 결과 제시.
5. 시선 고정 시간처럼 전문 장비에서만 신뢰할 수 있는 특징은 별도 분석으로 구분.

기획서에 있는 참가자 수·성능·‘유일한 자료’ 같은 표현을 그대로 복사하지 마십시오. 필요한 수치는 실제 사용한 공개 버전과 출처로 확인합니다.

## 22. B의 공통 분석 결과 규격

처음에는 ‘한 참가자가 한 본문을 읽은 기록’ 하나를 분석 단위로 합니다. 처음부터 3초 창으로 잘라 모든 창에 전체 과제 라벨을 정밀 정답처럼 붙이지 않습니다.

첫 분석 특징 후보:

| 특징 | 정의 방향 |
|---|---|
| elapsed_ms | 본문 과제의 경과 시간 |
| valid_ratio | 실제 시간 기준의 유효 자료 비율 |
| horizontal_travel_per_s | 유효한 연속점의 가로 이동량 합 / 유효 시간 |
| vertical_travel_per_s | 유효한 연속점의 세로 이동량 합 / 유효 시간 |
| direction_changes_per_s | 작은 잡음을 제외한 가로 방향 전환 횟수 / 유효 시간 |
| leftward_candidates_per_s | 데이터 소스에 맞게 정의한 큰 왼쪽 이동 후보 횟수 / 유효 시간 |
| stable_interval_summary | 정해진 범위 안에 머문 구간 길이의 요약. 전문 fixation과 구분 |

이 후보 목록은 모든 자료에 똑같이 계산된다고 확정한 것이 아닙니다. 사용할 수 없는 특징은 null 또는 분석 제외 사유로 기록합니다. 측정되지 않은 값을 0으로 메우지 마십시오.

공개 gaze는 화면 또는 텍스트 영역 너비로 정규화할 수 있고, iris는 눈 폭으로 정규화합니다. 둘 다 0~1이라고 동일한 물리량이 되는 것은 아닙니다. 각 특징은 원본 좌표, 정규화 기준, 식, 단위, 임계값, 결측 처리, 적용 자료를 사전에 정의합니다.

`feature_dictionary.csv` 열:

`feature_name,description,formula,unit,source,normalization,missing_policy,parameters,implementation_version`

정리된 분석 테이블의 공통 메타데이터 열:

`dataset,participant_id,text_id,trial_id,task_label,coordinate_source,feature_version`

task_label은 `normal_reading`, `information_seeking`을 사용합니다. stare·unread 라벨을 공개 자료에서 임의 생성하지 않습니다. 고유한 원래 label 값은 별도 열로 보존합니다.

## 23. AI 모델과 평가의 구체적 기준

### 첫 모델

로지스틱 회귀는 여러 입력 숫자의 가중합을 이용하여 두 과제를 분류하는 가벼운 모델입니다. scikit-learn의 StandardScaler와 LogisticRegression을 Pipeline으로 연결하여 시작합니다. 데이터 크기에 맞는 반복 횟수·정규화 설정을 기록합니다.

전처리의 평균·표준편차·결측값 대체값은 학습 데이터에서만 계산합니다. 전체 데이터로 전처리를 맞춘 뒤 학습/평가를 나누지 마십시오.

비교 모델은 RandomForestClassifier를 사용할 수 있습니다. 로지스틱 회귀를 먼저 완성하고, 랜덤 포레스트의 복잡한 튜닝부터 시작하지 않습니다.

### 평가

- 참가자 단위로 학습·검증·최종 평가를 나눕니다. 자료가 적으면 참가자 단위 교차검증을 사용하고 그 한계를 명시합니다.
- 가능하면 글 ID도 기준으로 새로운 글에 대한 일반화를 추가 평가합니다. 참가자만 분리한 평가와 구분합니다.
- 같은 기록을 여러 시간 창으로 잘랐어도 그 창이 서로 다른 분할로 흩어지지 않게 합니다.
- 모델 선택·임계값 조정을 최종 평가 자료에서 반복하지 않습니다.
- 모든 분할에 두 과제가 실제로 존재하는지 확인합니다.
- seed를 고정하고 사용한 참가자·글 ID 목록을 저장합니다.
- 다수 클래스만 예측하는 기준, 경과 시간만 사용하는 모델, 눈 움직임을 추가한 모델을 비교합니다. 시간 특징을 사용한 결과와 사용하지 않은 결과도 구분하면 좋습니다.
- accuracy, balanced accuracy, macro F1, confusion matrix, 각 클래스 건수를 기록합니다. 두 클래스의 순서를 명시합니다.
- 전체 과제 라벨로 훈련한 짧은 창 분류라면 약한 라벨이라는 점을 명시합니다. 초 단위 실제 읽기 상태 정답이라고 주장하지 않습니다.
- 높은 정확도가 나왔을 때는 누출과 글 길이·자료 수집 조건 차이부터 확인합니다.

### metrics.json

JSON의 schemaVersion은 `gazegate-analysis/1.0.0`으로 합니다. 최소 항목:

- dataset/version 또는 commit.
- 사용 파일과 분석 범위.
- 참가자·기록·클래스별 건수.
- 제외 기준과 제외된 기록 수.
- split 방식과 seed, 분할 목록 파일.
- model 이름과 하이퍼파라미터.
- featureVersion과 featureNames 순서.
- classes 순서.
- 평가 지표와 confusion matrix.
- 실행한 Python·패키지 버전.
- 실제 실행 여부.

훈련을 실행하지 못했다면 지표를 0이나 예상 수치로 채우지 말고 null과 미실행 이유를 기록합니다.

## 24. 공개 모델의 웹캠 적용과 모델 파일 계약

**기본값은 실시간 모델 적용 OFF입니다.** 공개 데이터 모델과 웹캠 페이지 점수 모듈은 먼저 각자 구현합니다.

모델 적용을 검토하려면 B가 `analysis/results/transfer_review.md`에 다음을 씁니다.

1. 학습 입력의 좌표 소스와 특징 정의.
2. 웹캠에서 실제로 얻을 수 있는 대응 입력.
3. 단위·정규화·측정 간격·머리 움직임의 차이.
4. 공유 가능한 특징과 공유할 수 없는 특징.
5. 웹캠 점검 기록에서 확인한 결과와 수량.
6. 실시간 적용 권고 여부와 근거.

웹캠으로 목표 위치를 보게 하여 화면 좌표를 추정하는 보정을 도입하거나 WebGazer로 바꿀 수는 있습니다. 이때 source와 전처리·특징 버전을 바꾸고 공통 변경으로 공유합니다. ‘몇 개 가우시안 잡음을 더하고 30Hz로 낮추면 완전 호환’이라고 가정하지 않습니다.

실시간 적용이 타당하지 않으면 제품은 명시적으로 규칙 기반 페이지 판정을 사용하고, AI 분석은 공개 데이터 실험으로 별도 제시합니다. 이 상태를 ‘공개 모델이 실시간 정독 판별을 수행한다’고 발표하지 마십시오. 과목에서 실시간 AI 분류가 필수라면 이 공백을 팀에 알리고 입력·모델 설계를 다시 정합니다.

선택적 모델 JSON을 전달할 때의 필수 항목:

- schemaVersion: `gazegate-model/1.0.0`.
- modelType: `logistic_regression`.
- coordinateSource, featureVersion, featureNames의 고정 순서.
- classes: 정확히 2개이고 순서 명시.
- scalerMean, scalerScale: featureNames와 같은 길이의 배열. scale은 양수.
- coefficients: 위 순서와 같은 길이의 1차원 배열.
- intercept: 유한한 숫자.
- missingPolicy: 첫 버전은 `reject`.
- runtimeEligible: boolean, 기본 false.
- 학습 데이터·모델 버전·검증 보고서 경로.

해석은 StandardScaler 뒤의 이진 LogisticRegression에 한정합니다. z = intercept + sum(coefficients[i] * ((x[i]-mean[i])/scale[i])). sigmoid(z)는 classes[1]의 확률입니다. classes 순서를 뒤집지 마십시오. 다중 클래스나 다른 전처리를 이 형식에 억지로 넣지 않습니다.

랜덤 포레스트의 Python pickle을 그대로 JavaScript에서 실행할 수 있다고 전달하지 마십시오. 첫 버전에서는 비교 분석에 한정합니다.

모델 JSON은 생성 전에는 파일이 없을 수 있습니다. C는 미생성·비활성 모델을 필수 fetch하여 앱을 실패시키지 않습니다. 모델이 활성화되더라도 그 분류 확률을 페이지 점수와 결합하는 정책은 별도의 합의가 있어야 합니다.

## 25. 내보내기 로그의 고정 규격

C는 최소한 다음을 다운로드하게 합니다. PDF 원문과 얼굴 영상 저장은 필수로 하지 않습니다.

### samples.csv

열 순서:

`contractVersion,source,documentId,sessionId,pageId,segmentId,seq,tMs,valid,leftIrisX,rightIrisX,leftIrisY,rightIrisY,leftEar,rightEar,headMotion,invalidReason`

`leftEar`·`rightEar`는 1.1.0에서 추가된 열입니다. B의 loader는 두 열이 없는 1.0.0 파일도 읽을 수 있어야 하며, 없으면 null로 채웁니다.

### events.csv

열 순서:

`contractVersion,documentId,sessionId,eventId,pageId,segmentId,tMs,type,amplitudeX,durationMs,detectorVersion`

### session.json

- documentId, sessionId.
- 작성 시각, 앱·계약·검출기·점수정책 버전.
- 실행 대상 `web`, 실제 origin, appVersion/buildId. 사용자 PDF 파일 내용이나 얼굴 프레임은 넣지 않음.
- actual camera diagnostics.
- configSnapshot, detector 설정.
- 페이지별 lineCount, supported, acceptedEventCount, activeMs, validMs, rawScore, displayScore, validRatio, passed, status, reasonCodes, blinkCount(설정 전 null).
- 측정 구간 시작·종료 시각과 종료 이유.
- 규칙 판정인지 모델 판정이 포함되었는지.
- validationLevel, 실제 시험 조건의 구분(있으면).
- signatureMethod, signatureImageSha256(서명 완료 시), 봉인 발급 시 `seal` 항목에 sealPayload 전체.
- 봉인 발급 시 파일명은 `session-<sealId>.json`, 미발급 시 `session-<sessionId>.json`.

CSV는 UTF-8, 소수점은 점, true/false는 소문자 문자열, null 숫자는 빈 칸으로 저장합니다. 쉼표·줄바꿈이 있는 문자열은 표준 CSV 인용을 적용합니다. JSON에서는 null을 그대로 사용합니다.

로그는 첫 버전에서 메모리에 유지하고 사용자가 다운로드합니다. 앱을 닫아도 자동 복구되는 장기 저장은 초기 필수 기능이 아닙니다. ‘페이지 재방문 시 유지’와 ‘브라우저를 껐다 켜도 유지’를 혼동하지 마십시오.

B는 해당 로그를 Python에서 바로 읽을 수 있도록 loader를 만듭니다. 열 이름을 편의상 임의 변경하면 안 됩니다.

## 26. 전체 작업 단계와 담당별 시작점

각 단계에 목표 날짜를 붙였습니다. 완료 조건이 우선이며, 날짜는 늦어지는 것을 빨리 알아차리기 위한 기준입니다. 단계 2가 11월 5일까지 안 끝나면 팀 전체가 모여 범위를 줄입니다. 제출 일정(보고서 11/12, 포스터 11/15, 데모 11/18)에 맞춰 단계 4를 11/10까지 끝내는 것이 가장 중요합니다.

| 단계 | 목표 날짜 | 핵심 | 제출물 연결 |
|---|---|---|---|
| 0 | 11/2 (일) | 기본 실행·공통 파일 | — |
| 1 | 11/4 (화) | 실제 측정·데이터 한 건·PDF 한 장 | — |
| 2 | 11/5 (수) | 측정 가능성 판단 (Go/No-Go) | 보고서의 ‘측정 점검’ 섹션 재료 |
| 3 | 11/8 (토) | 검출기·첫 모델 | 보고서의 ‘분석·평가’ 섹션 재료 |
| 4 | 11/10 (월) | 전체 흐름 연결 (측정→점수→서명) | **보고서 초안 11/10, 제출 11/12** |
| 5 | 11/13 (목) | 봉인 1단계·기준 조정·고정 평가 | **포스터 제작 11/13~14, 제출 11/15** |
| 6 | 11/17 (월) | 리허설·시연 영상·발표 슬라이드 | **교수님 데모 11/18** |

### 단계 0: 기본 실행과 공통 파일 — 목표 11/2

- C: index.html 진입 페이지, 공통 설정·계약 파일, 의존 자산 준비 방법, 로컬 정적 서버, README.
- A: contracts·config 파일을 기다리지 않아도 이 문서의 형식대로 측정 모듈과 점검 화면을 준비.
- B: 웹사이트 실행과 별개로 자료 구조를 확인하는 notebook 준비.

완료: localhost에서 C 기본 페이지가 열리고, A·B가 사용할 입출력·경로가 일치합니다.

### 단계 1: 실제 측정과 데이터 한 건 — 목표 11/4

- A: 카메라 시작, 홍채 추적, EAR 계산, 실제 그래프와 CSV.
- B: 한 참가자의 두 과제 구분과 시선 그래프. 원본 파일·필드·단위 확인.
- C: PDF 하나를 표시하고 실제 pageCount·pageId 반환.

완료: 빈 화면이나 가상 수치가 아니라 실제 카메라·실제 공개 자료·실제 PDF가 각각 동작합니다.

### 단계 2: 측정 가능성과 분석 특징 — 목표 11/5 (Go/No-Go)

- A: 큰 좌우 보기, 자연스럽게 읽기, 빠르게 훑기, 응시, 눈 왕복, 머리 움직임을 짧게 반복 비교. 자연스럽게 읽을 때 줄바꿈 스윕이 그래프에서 눈으로 구분되는지가 핵심 질문입니다.
- B: 소수 참가자의 특징 표·결측·측정 간격·과제 건수 정리.
- C: 줄 수 계산을 사람의 카운트와 대조하고, 시험 사건으로 점수·서명 제어 점검.

완료: 실제 읽기에서 쓸 만한 변화가 있는지 판단하고 사용 가능한 특징과 오류를 기록합니다.

**No-Go일 때의 대안**: 30fps에서 줄바꿈 스윕이 잡음과 구분되지 않으면, 사건 검출을 포기하지 말고 (1) 큰 스윕만 세는 임계값을 올려 재현율보다 정밀도를 택하고, (2) 페이지 체류 시간·유효 비율·EAR 안정성을 보조 조건으로 강화합니다. 그래도 안 되면 점수 정책을 ‘체류 시간 + 유효 비율’ 기반으로 바꾸는 공통 변경 제안을 냅니다. 이 결정은 11/5까지 내립니다.

### 단계 3: 검출기와 첫 모델 — 목표 11/8

- A: 사건 시각을 그래프에 표시하고 중복·머리·무효 구간 오검출 확인.
- B: 참가자 분리 로지스틱 회귀, 기준 모델, 필요하면 랜덤 포레스트 비교.
- C: 로그·페이지 이동·재방문·새 문서 초기화 처리.

완료: 각 모듈이 계약에 맞는 실제 결과를 생성합니다.

### 단계 4: 실제 전체 흐름 연결 — 목표 11/10, 보고서 제출 11/12

- A+C: 실제 Sample→사건→현재 페이지→점수→서명 흐름 연결.
- B: 앱 로그 불러오기, 특징 소스 차이 검토, OneStop 비교 가능한 부분 분석. **보고서 초안 편집**(11/9~10).
- 11/10 저녁: 통합본 화면·그래프·봉인 전 상태를 캡처해 보고서에 넣음. 11/11 전원 검토, 11/12 제출.

완료: 세 페이지 문서를 실제 눈 움직임으로 측정하고 미달/통과에 따라 앱 서명창이 제어됩니다. 측정이 실패하는데 시험값으로 대체해 통합 완료라고 하지 않습니다. 보고서에는 이 시점에 실제 동작한 것만 씁니다.

### 단계 5: 봉인 1단계, 기준 조정과 고정 평가 — 목표 11/13, 포스터 제출 11/15

- C: `sealExport.js` 구현. 서명 완료 → 봉인 발급 → 봉인된 PDF와 session-<sealId>.json 내려받기. 한글 폰트 임베드 확인. 서명 이미지 업로드는 여유가 있을 때.
- A+C: 조정에 사용한 자료와 나중 평가 자료를 구분. 반복 읽기·눈 왕복·단순 응시·빠른 넘김·고개 움직임·자리 비움 확인. 점수와 시간·품질 기준을 조정한 뒤 고정하고 다른 기록에 평가. 시연 환경(조명·거리 50~60cm·센터 스테이지 OFF)을 발표 장소와 같게 맞춰 임계값 고정.
- B: 공개 모델 결과와 실제 웹캠 시연 결과를 따로 정리. 시연 대본 확정. **포스터 제작**(11/13~14, 보고서 그림 재사용 + 봉인 PDF 캡처), 11/15 제출.

완료: 잘되는 경우·실패하는 경우·사용한 설정을 설명할 수 있고, 봉인된 PDF를 다른 PDF 뷰어(미리보기, Chrome)에서 열어 스탬프 페이지가 보입니다. 포스터에 들어갈 화면 캡처가 11/13 안에 나옵니다.

### 단계 6: 리허설·최종 전달 — 목표 11/17, 교수님 데모 11/18

- C: 통합본 최종 ZIP, 발표자 맥북에 설치·로컬 서버 실행 확인, 다른 팀원 맥북에서도 같은 ZIP으로 실행 확인.
- A: 시연 환경 고정(발표 장소 조명·거리 50~60cm·센터 스테이지 OFF·자동 노출), 발표자 기준 임계값 최종 확정, 데모 PDF 인쇄본.
- B: 발표 슬라이드, 3분 시연 리허설 5회 이상(11/16~17), 시연 영상 녹화(같은 순서로). 라이브 실패 시 영상으로 전환하는 신호를 정해 둠.
- 여유가 있을 때만 봉인 2단계(검증 페이지)나 HTTPS 배포를 C가 시도. 11/16까지 안 되면 로드맵으로 둠.

전달물:

- 웹사이트 소스 폴더/ZIP, 로컬 실행 안내. (배포했다면 HTTPS 주소와 docs/deployment.md)
- 분석 코드와 정확한 환경·실행 순서.
- 특징 사전, 결과표·그래프, 분할 목록, 설정.
- 시연 PDF와 수동 줄 수 정답, 시연 대본, 발표자 서명 이미지, 봉인된 PDF 샘플.
- 시연 영상과 발표에 쓸 동작·평가·한계 설명.

### 3분 시연 순서 (B가 `demo/demo-script.md`로 확정)

| 장면 | 발표자 행동 | 화면에 보이는 것 | 시간 |
|---|---|---|---|
| 0 | PDF 열기, 카메라 허용, 측정 시작 | 측정 준비 완료, 페이지 1/3, 본문 줄 수 | 15초 |
| 1 | 1페이지를 실제로 읽음 | 그래프에 줄바꿈 후보 사건이 줄마다 찍히고 점수가 올라 ‘기준 충족’ | 35초 |
| 2 | 2페이지를 바로 다음으로 넘기려 함 | ‘미달 페이지 1개’, 다음 페이지 이동 가능하지만 서명 버튼 잠김 | 20초 |
| 3 | 3페이지를 응시만 함 | 유효 시간은 늘지만 사건 0, ‘줄바꿈 후보 사건 없음’ | 20초 |
| 4 | 2·3페이지를 돌아가 읽음 | 모든 페이지 충족, 서명 버튼 활성화 | 30초 |
| 5 | 동의 체크, 서명 그리기, 봉인 발급 | sealId·발급 일시, PDF 내려받기, 미리보기로 열어 스탬프 페이지 보여주기 | 30초 |
| 6 | (2단계 완성 시) 검증 페이지에 올리기 | ‘확인됨’ → 수정한 JSON으로 ‘서명 불일치’ | 20초 |

장면 2·3의 설명은 “스크롤만 넘기면 점수가 안 오르고, 화면만 봐도 사건이 안 찍힌다”까지입니다. “훑어보기를 감지했다”, “멍때리기를 감지했다”라고 말하지 않습니다.

## 27. 반드시 필요한 통합 점검 예시

다음은 소프트웨어가 계약대로 연결되는지 확인하는 인공 fixture입니다. 사람의 독서 성능 실험이 아닙니다. 개발 화면에 시험 모드라고 표시하고 실제 mode와 구분합니다.

1. 10줄 페이지에 서로 다른 사건 8개, activeMs=10000, validMs=8500이면 초기 설정에서 rawScore=80, passed=true.
2. 같은 사건 ID를 다시 전달해도 사건 수와 점수는 그대로.
3. 사건이 충분해도 validMs=500이면 passed=false.
4. 사건과 시간이 충분해도 validRatio가 0.70 미만이면 passed=false.
5. 두 페이지 중 하나가 미달이면 canSign=false.
6. 전체 페이지가 아직 등록되지 않았다면 일부가 모두 통과해도 canSign=false.
7. lineCount가 null 또는 0인 지원 불가 페이지는 통과하지 않음.
8. 페이지를 바꾼 직후 이전 segment의 사건은 거절.
9. 새 PDF를 열면 이전 점수와 서명 초기화.
10. 카메라 stop을 두 번 호출해도 오류나 중복 루프가 생기지 않음.
11. start/stop 반복에서 seq·eventId가 같은 세션 안에서 중복되지 않음.
12. 누락된 필수 얼굴 모델·카메라 권한 거부·텍스트 없는 PDF에 이해할 수 있는 오류가 표시됨. 비활성 선택 모델 JSON의 부재는 필수 모델 오류와 구분.
13. 발표자 맥북과 다른 팀원 맥북의 localhost에서 같은 ZIP으로 PDF·카메라·서명·봉인 흐름이 동작함. (배포했다면 HTTPS에서도)
14. (배포 시에만) 호스팅의 하위 경로에서 모듈·모델·WASM·worker를 올바르게 불러옴.
15. 카메라 권한을 거절한 뒤 다시 허용하거나 카메라를 끊었을 때 안내·재시작이 작동함.
16. 새로고침하면 세션이 초기화되고 완료·서명 상태가 남아 있지 않음. 새로고침 뒤에도 남는 가짜 진행 상태를 만들지 않음.
17. 코드와 브라우저 네트워크 기록에서 PDF·얼굴 프레임을 서버로 전송하는 요청이 없는지 확인. 의도하지 않은 업로드가 있으면 수정.
18. `file://` 실행이나 일반 HTTP 원격 접속으로 카메라가 차단되면 환경 안내를 표시하며 정상 측정으로 위장하지 않음.
19. 10줄 페이지에 사건 0개, validMs=5000이면 reasonCodes에 score_below_threshold와 no_reading_events가 함께 있고, 사건 3개면 no_reading_events는 없음.
20. canSign이 false인 상태에서 issueSeal을 호출하면 오류를 반환하고 PDF를 만들지 않음.
21. 봉인 발급 후 원본 PDF의 페이지 수 + 1 = 봉인된 PDF의 페이지 수이고, 원본 페이지들의 텍스트는 그대로임.
22. 봉인된 PDF의 메타데이터 Subject와 session-<sealId>.json의 sealId가 일치함.
23. 봉인 발급을 두 번 시도하면 두 번째는 거절되거나 새 sealId로 명시적 재발급임. 같은 sealId가 두 파일에 붙지 않음.
24. 한글 폰트가 없는 환경에서도 영문 스탬프로 발급되며 화면에 그 사실이 표시됨.
25. Sample의 leftEar·rightEar가 null일 때 앱이 죽지 않고 깜빡임 표시가 ‘미설정’ 또는 ‘—’로 나옴.

실제 측정 점검에서는 별도로 다음을 기록합니다.

- 누가, 어떤 장비·거리·조명·글로, 어떤 지시 행동을 몇 번 수행했는지.
- 자연 읽기에서의 사건 그래프와 단순 응시·눈 왕복·머리 움직임 비교.
- 검출 누락·중복·읽지 않았는데 통과한 사례와 정상 읽기 미달 사례.
- 팀원 소수의 결과를 전체 사용자의 일반 성능으로 확대하지 않음.
- 실험에서 지시한 읽기 행동과 실제 내용 이해 여부를 구분.

## 28. 코드 전달과 독립 작업 규칙

- 자신이 소유하지 않은 파일을 통째로 재작성하지 마십시오. 필요한 변경은 패치 또는 명확한 제안으로 전달합니다.
- 모든 공개 함수명, 필수 키, 단위, pageId의 1-based 규칙을 그대로 사용합니다.
- 내부 구현은 담당자가 선택하되 공개 계약을 바꾸지 않습니다.
- 다른 모듈의 export를 실제로 확인하지 못했으면 내부 함수를 있다고 가정하여 import하지 않습니다.
- 외부 모듈이 아직 없을 때는 dev 안의 명확한 mock으로 독립 시험합니다. 그 mock을 제품 실제 기능으로 내보내지 않습니다.
- C가 기본본을 공유하면 각 담당자는 같은 기본본 위에서 자신의 파일만 교체합니다.
- 개발 중 조각 코드만 주고 저장할 파일명이나 위치를 생략하지 않습니다.
- 사용자가 초보자라면 새 폴더 생성, 파일 저장 위치, 실행 화면, 버튼과 오류 확인 순서를 함께 안내합니다.
- 텍스트로 제시한 코드와 실제 생성한 파일을 구분합니다. 존재하지 않는 다운로드 링크를 만들지 않습니다.
- 실행하지 않은 코드는 실행 확인 완료라고 하지 않습니다. 카메라를 사용할 수 없는 GPT 환경에서는 브라우저 실제 측정 여부를 사용자에게 확인받습니다.
- 프레임 수·정확도·처리 속도·실행 성공을 추측하여 보고하지 않습니다.

### Git을 사용할 수 있는 경우

- C가 main의 공통 기본본을 준비하고 A·B가 같은 버전에서 작업합니다.
- 브랜치는 예를 들어 a-measurement, b-analysis, c-integration으로 나눕니다.
- 통합은 C가 전달된 버전과 변경 목록을 확인한 후 진행합니다.

### Git을 사용하지 않는 경우

- C가 공통 기본본 ZIP과 버전 번호를 공유합니다.
- A·B는 자신이 수정한 파일 목록과 파일만 전달합니다.
- 예전 전체 ZIP으로 최신 app이나 config를 덮어쓰지 않습니다.
- C가 통합본 버전을 올려 다시 공유합니다.

## 29. 기준 변경 절차

공개 데이터 형식, 함수명·반환값, 파일 경로, 시간·좌표 정의, 점수 정책, 라이브러리 버전을 바꾸려면 다음을 작성합니다.

```text
[공통 변경 제안]
현재 계약 버전:
변경 대상:
변경 전:
변경 후:
변경 이유:
영향받는 역할과 파일:
기존 코드/로그/모델을 어떻게 바꿀지:
확인 방법:
```

C가 공통 결정을 취합하고 팀원들에게 공유합니다. A·B가 C에게 지휘권을 영구 위임한다는 의미가 아니라, 문서·버전이 서로 달라지는 것을 막기 위한 통합 창구입니다.

사용자가 자기 GPT에만 ‘바꾸자’고 말한 경우에도, 다른 담당자와 연결되는 부분이면 변경안을 함께 출력하여 공유하게 합니다. 다른 두 GPT가 자동으로 새 내용을 안다고 가정하지 않습니다.

하위 호환이 깨지는 계약 변경에는 계약 버전을 올립니다. detector·score·feature 버전도 따로 기록합니다. 코드·모델·로그가 다른 버전이면 경고하고 조용히 섞지 않습니다.

## 30. GPT가 처음 응답할 때 할 일

### 역할이 지정되지 않은 경우

프로젝트 목표와 세 역할을 짧게 확인한 뒤 ‘A·B·C 중 어느 역할을 맡으셨나요?’라고 한 번만 질문합니다. 이전 기획서나 대화 내용을 다시 요구하지 않습니다.

### A 담당으로 지정된 경우

1. 자신의 입출력과 소유 파일을 짧게 확인.
2. 첫 목표를 ‘측정 시작·중지, 양쪽 눈 상대 x 그래프, EAR 값 표시, 실제 샘플 저장’으로 설정.
3. 모델·WASM 경로를 공통 기준과 맞추고 C에게 필요한 자산 목록 전달.
4. eyeTracker.js의 계약을 지키는 코드와 독립 측정 화면부터 제공.
5. 맥북에서 실행할 구체적 방법과 정상/오류 화면 확인 순서 안내.
6. 측정 결과를 본 뒤 사건 검출로 진행. 처음부터 완성 정확도를 약속하지 않음.

### B 담당으로 지정된 경우

1. 공개 데이터 분석과 제품 판정이 다른 작업임을 확인.
2. 사용할 Python 환경을 설명. 로컬 설치가 부담되면 Colab으로 시작 가능.
3. WebQAmGaze의 공식 출처와 실제 파일 한 건을 확인하는 코드부터 제공.
4. 파일 목록·열 이름·타입·과제별 건수·샘플 그래프 출력.
5. 아직 훈련하지 않고 자료가 올바르게 해석되는지 먼저 확인.
6. 참가자 분리 평가와 특징 사전을 만드는 다음 단계 제시.
7. 단계 4 이후에는 발표·데모 담당으로서 시연 대본·슬라이드·시연 영상 작업을 병행함을 확인. 분석 결과는 발표의 한 섹션으로 들어가며, 공개 모델이 실시간 판정을 한다고 쓰지 않음.

### C 담당으로 지정된 경우

1. 하나의 정적 웹페이지 구조와 소유 파일, web 루트 확인.
2. common config·contracts·README·의존성 목록·자산 준비 방법·로컬 실행법을 먼저 제공.
3. localhost 주소에서 index.html이 열리고 PDF를 선택해 표시하는 기본본 제공.
4. A 모듈이 없을 때 import 오류로 앱 전체가 죽지 않도록 별도 시험용 mock 또는 기능 비활성 기본본 제공. mock 여부는 표시.
5. A에게 전달할 경로와 sample/event 사용법, B에게 전달할 로그 형식 공유.
6. 실제 사건 연결 전에는 개발용 fixture로 점수·서명을 점검.
7. 단계 4가 끝난 뒤 `sealExport.js`(봉인 1단계)를 구현. pdf-lib 자산과 한글 폰트를 vendor에 준비하고 실제 파일명을 확인.
8. 통합본 ZIP을 발표자 맥북과 다른 팀원 맥북에서 실행해 같은 결과가 나오는지 확인. HTTPS 배포는 하지 않음(선택).
9. 봉인 2단계(검증 페이지)는 1단계가 끝난 뒤에만, 그리고 11/16 전에만 시작.

모든 역할은 한 번에 전체 프로젝트를 독자 완성하려 하지 말고, 실행 가능한 첫 단계를 먼저 제공합니다. 사용자가 ‘전체 코드를 한꺼번에 달라’고 명시하면 범위에 맞춰 제공하되 미검증 부분을 구분합니다.

## 31. 매 작업 단계가 끝날 때의 공유 양식

아래를 작성하고, 필요하면 다른 두 GPT에 전달하도록 안내합니다. 사람의 승인 없이 다른 팀원에게 직접 메시지를 보내지 않습니다.

```text
[GazeGate 작업 전달]
담당: A / B / C
기준 계약 버전:
기준 통합본 버전 또는 Git commit:

1. 실제 완료한 내용
-

2. 생성/수정한 파일
- 경로:
- 역할:

3. 다른 담당자가 사용하는 방법
- import 경로와 공개 함수:
- 입력/출력:
- 자산/버전/설정:

4. 실행 및 확인 결과
- 실제 실행한 환경:
- 실행 방법:
- 확인한 동작:
- 실행하지 못한 항목:

5. 남은 문제
-

6. 공통 변경 제안
- 없음 / 별도 변경안 첨부

7. 다음 담당자가 할 일
-
```

다른 GPT의 전달문을 받으면 계약 버전과 공개 함수를 먼저 대조합니다. 다른 점이 있으면 차이와 필요한 조치를 구체적으로 알린 뒤 연결합니다. 이유 없이 프로젝트 전체를 다시 설계하지 마십시오.

## 32. 전체 완료 기준

### 프로그램

- 실제 맥북 Chrome에서 localhost 실행을 발표자 맥북과 다른 팀원 맥북 모두에서 확인. (HTTPS 배포는 선택)
- 사용자에게 별도 설치나 회원가입을 요구하지 않고 PDF·카메라를 사용할 수 있음.
- 시연 PDF 표시와 실제 페이지 관리.
- 실제 카메라 측정과 그래프.
- 후보 사건 검출과 페이지별 기록.
- 지원되지 않는 문서·측정 불가·페이지 전환의 적절한 처리.
- 모든 페이지의 기준 충족 여부에 따른 동의·서명 제어.
- 서명 완료 후 봉인 1단계 발급: 스탬프 페이지가 추가된 PDF와 session-<sealId>.json 내려받기.
- 실제 로그 다운로드 및 B의 Python loader로 읽기.
- 시험용 값과 실제 측정 결과가 구분됨.
- (선택) 봉인 2단계 검증 페이지. 미완성이면 로드맵으로 표기.

### 분석

- 공개 자료의 사용 범위와 과제 정의가 명시됨.
- 실제 실행한 특징 계산 및 참가자 분리 평가.
- 기준 모델과 눈 움직임 모델 비교.
- 공개 모델의 웹캠 적용 여부와 근거를 명시.
- 실제 측정 점검의 인원·조건·횟수·실패 사례를 명시.
- 좋은 시연 장면만으로 일반적인 정독 정확도를 주장하지 않음.

### 전달

- 웹사이트 소스 폴더/ZIP, 로컬 실행 안내, 정확한 버전. (배포했다면 HTTPS 주소)
- web/index.html·자산·serve_local.py가 실제로 존재하고 안내된 명령과 일치함.
- docs/deployment.md와 다른 팀원 환경에서의 접속·카메라 점검 기록.
- 분석 코드·환경·결과·설정.
- 시연 PDF와 수동 줄 수 정답, 시연 대본, 시연 영상, 봉인된 PDF 샘플.
- 공통 계약과 변경 기록, A/B/C 전달문.
- 발표·시연에 필요한 동작 설명과 검증의 한계.

카메라가 되지 않거나 모델이 아직 학습되지 않았다면 그 부분을 완료로 표시하지 않습니다. 단순히 파일이 존재하는 것과 작동·평가를 통과한 것을 구분합니다.

## 32-1. 발표에서 말할 수 있는 것과 없는 것

발표 자료와 화면 문구는 구현된 범위를 넘지 않습니다. 기획서 단계의 표현을 그대로 옮기지 마십시오.

| 말할 수 있음 | 말하지 않음 |
|---|---|
| 웹캠 하나로 홍채 수평 이동과 눈 깜빡임(2채널)을 실시간 측정한다 | 3채널 생체신호, 동공 직경, rPPG |
| 줄 단위 안구 리듬(줄바꿈 후보 사건)으로 페이지별 읽기 점수를 계산한다 | 단어 단위 도약 검출, 정독·훑기·응시 자동 분류 |
| 페이지 기준 미충족 시 서명이 잠긴다 | “무지성 승인을 막는다”를 증명했다 |
| 읽기 기록과 서명을 봉인으로 PDF에 남긴다 | 위조 불가, 법적 효력, 신원 인증 |
| (2단계 완성 시) 검증 페이지에서 봉인 내용의 변조 여부를 확인할 수 있다 | 타임스탬프 기관 수준의 증명 |
| 공개 데이터(WebQAmGaze 등)로 읽기 방식 분류 모델을 학습·평가했다 | 그 모델이 실시간 판정에 쓰인다(modelRuntimeEnabled가 true가 아닌 한) |
| 팀원 N명, 조건 M가지, 시도 K회의 결과와 실패 사례 | 일반 사용자 정확도 90% |
| 한계: 이해가 아닌 읽기, 속임수 가능, 환경 의존, 접근성 제약 | — |

확장 로드맵으로 언급할 수 있는 것: 동공 직경 채널, 건너뛴 구간 AI 요약, 로그인·얼굴 대조 기반 본인 확인, 서버 측 서명·TSA 연동, 크롬 확장·임베드 SDK, GitHub PR 검수 모드. 전부 “하지 않았다”를 전제로 말합니다.

## 33. 설명 방식

- 한국어 존댓말, 기술 중심의 명확한 설명.
- 처음 쓰는 전문 용어는 쉬운 뜻을 함께 설명.
- 설치할 소프트웨어, 작성할 언어, 사용하는 라이브러리, 분석할 데이터를 구분.
- ‘그냥 실행하면 됩니다’로 끝내지 말고 파일·경로·명령·버튼·확인할 결과를 구체적으로 안내.
- 사용자에게 모든 언어와 AI 이론을 먼저 공부하고 오라고 하지 않음. 필요한 코드를 제공하고 실행 결과를 함께 확인.
- 오류가 발생하면 마지막으로 성공한 단계와 실제 오류부터 조사. 무작정 모든 도구 재설치 금지.
- 날짜별 계획을 다시 강제하지 않음. 역할·단계·완료 조건을 사용.

## 34. 공식 참고 자료

이 문서만으로 설계와 첫 작업을 시작할 수 있습니다. 아래 자료는 실제 API·데이터를 확인할 때 사용합니다. 이전 대화나 별도 기획서를 읽어야 하는 것은 아닙니다.

- MediaPipe Face Landmarker Web:
  https://developers.google.com/mediapipe/solutions/vision/face_landmarker/web_js
- MediaPipe 공식 얼굴 모델:
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- PDF.js 예제:
  https://mozilla.github.io/pdf.js/examples/
- 카메라 getUserMedia와 보안 컨텍스트:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- 로컬 정적 서버 실행:
  https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Tools_and_setup/set_up_a_local_testing_server
- 웹페이지 Worker:
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- WebQAmGaze:
  https://github.com/tfnribeiro/WebQAmGaze
- OneStop 설명:
  https://lacclab.github.io/OneStop-Eye-Movements/
- OneStop 변수:
  https://lacclab.github.io/OneStop-Eye-Movements/variables
- scikit-learn 로지스틱 회귀:
  https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression
- scikit-learn 랜덤 포레스트:
  https://scikit-learn.org/stable/modules/ensemble.html#forests-of-randomized-trees

참고 문서의 API와 이 계약 사이에 충돌이 있으면, 내부 어댑터로 해결 가능한지 먼저 확인합니다. 라이브러리에 맞춘다는 이유로 공개 함수 계약을 자동 변경하지 않습니다. 불가능하면 변경 제안을 작성합니다.

---

## 마지막 시작 지시

이 문서 전체를 읽고 다음을 따르십시오.

1. 역할이 있으면 해당 역할로 바로 시작합니다. 없으면 A/B/C 중 하나만 확인합니다.
2. 프로젝트 목표·자신의 담당·첫 산출물을 짧게 요약합니다.
3. 첫 작업에 꼭 필요한 환경 정보만 질문하거나 실제로 확인합니다. 이미 이 문서에 있는 내용을 다시 질문하지 않습니다.
4. 실행 가능한 첫 단계의 코드·파일·실행 방법을 준비합니다.
5. 미검증 항목은 구분하고, 공통 계약은 유지합니다.
6. 구현 대상은 웹사이트입니다. 사용자가 다시 바꾸라고 하지 않는 한 브라우저 확장 개발이나 독립 앱 설치 방식으로 되돌리지 않습니다.

사용자는 이어서 `나는 A 담당입니다`, `나는 B 담당입니다`, `나는 C 담당입니다` 중 하나를 입력합니다.
