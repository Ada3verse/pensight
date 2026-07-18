<div align="center">
  <img src="src/assets/hero.png" width="120" alt="PenSight logo" />

  # PenSight

  **손글씨를 텍스트로, 텍스트를 통찰로.**
  손글씨 문서를 OCR로 텍스트화하고 AI로 요약해주는 교사용 웹 서비스

  [배포 바로가기](https://amazing-axolotl-ee7258.netlify.app) · [GitHub](https://github.com/Ada3verse/pensight)

  ![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
  ![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase&logoColor=black)
  ![Claude](https://img.shields.io/badge/Claude-Sonnet-D97757?logo=anthropic&logoColor=white)
</div>

---

## 목차

1. [서비스 소개](#서비스-소개)
2. [주요 기능](#주요-기능)
3. [기술 스택](#기술-스택)
4. [서비스 구조](#서비스-구조)
5. [보안 설계](#보안-설계)
6. [배포 / 스크린샷](#배포--스크린샷)
7. [로컬 실행 방법](#로컬-실행-방법)

---

## 서비스 소개

**PenSight는 손으로 쓴 문서(상담 기록, 수행평가지 등)를 촬영해 올리면 텍스트로 변환하고, AI가 핵심 내용을 요약해주는 웹 서비스입니다.**

학교 현장에서 교사는 진로 상담 기록, 수행평가 답안, 학교폭력 진술서 등 손글씨 문서를 매일 다루지만, 이를 다시 찾아보거나 핵심만 파악하려면 원문을 처음부터 다시 읽어야 하는 번거로움이 있습니다. PenSight는 이런 문서를 빠르게 디지털화하고 요약해, 교사가 문서 내용을 확인하는 시간을 줄이는 것을 목표로 만들었습니다. 현재는 동신중학교 교사를 대상으로 배포되어 있습니다.

## 주요 기능

| 기능 | 설명 |
|---|---|
| **손글씨/인쇄물 OCR** | Google Cloud Vision API로 JPG, PNG, PDF(다중 페이지 포함) 문서를 텍스트로 변환 |
| **AI 요약·분석** | Claude API로 핵심 요약과 키워드를 추출. AI 분석 모드에서는 문서 유형(진로 상담 / 학교폭력 진술 / 수행평가 / 기타)까지 자동 분류 |
| **닉네임 + PIN 기반 보관함** | 회원가입 없이 닉네임과 4자리 PIN만으로 본인 문서만 조회·관리 |
| **결과 편집·복사** | OCR로 추출된 텍스트를 직접 수정하거나 전체 복사 |
| **문서 저장 및 재분석** | 추출한 텍스트를 저장해두고, 보관함에서 언제든 AI 분석을 다시 실행 |
| **관리자 페이지** (`/#/admin`) | 전체 업로드 현황 통계, 전체 문서 목록 조회, 닉네임별 PIN 초기화 및 삭제 |

## 기술 스택

**Frontend**
- React 19, Vite 8
- 별도 상태관리 라이브러리 없이 컴포넌트 상태로 구현

**데이터/인프라**
- Firebase Firestore (문서·닉네임 데이터 저장, 클라이언트 SDK로 직접 연동)
- Netlify (정적 호스팅 및 배포)

**OCR**
- Google Cloud Vision API (`DOCUMENT_TEXT_DETECTION`)
- pdf.js — PDF를 페이지별 이미지로 변환 후 OCR 요청

**AI**
- Anthropic Claude API (`@anthropic-ai/sdk`, `claude-sonnet-4-6`)

## 서비스 구조

**일반 사용자 흐름**

```mermaid
flowchart LR
    A[랜딩 페이지<br/>닉네임 + 모드 선택] --> B[PIN 인증<br/>신규: 설정 / 기존: 검증]
    B --> C[파일 업로드<br/>JPG · PNG · PDF]
    C --> D[OCR 처리]
    D --> E[AI 요약·분석]
    E --> F[텍스트 복사 / 수정 / 저장]
    B -.닉네임으로 재방문.-> G[내 보관함<br/>저장 문서 조회·재분석·삭제]
```

- **빠른 OCR 모드**: 텍스트 추출까지만 진행하고, 필요할 때 버튼을 눌러 AI 분석을 추가로 실행합니다.
- **AI 분석 모드**: OCR이 끝나면 AI 요약이 자동으로 이어서 실행됩니다.

**관리자 흐름**

`/#/admin` 경로로 접속 → 관리자 전용 PIN 인증 → 전체 통계 확인, 문서 열람, 닉네임별 PIN 초기화/삭제

## 보안 설계

- **PIN 인증**: 닉네임마다 4자리 PIN을 설정합니다. PIN은 평문으로 저장하지 않고 SHA-256으로 해시하여 Firestore에 저장하며, 검증도 해시값 비교로 처리합니다. 5회 연속 오류 시 잠기며, 이후에는 관리자 페이지에서 PIN을 초기화해야 재사용할 수 있습니다. 관리자 페이지 자체도 별도의 관리자 PIN으로 보호됩니다.
- **익명화**: 이름, 이메일 등 개인 식별 정보를 요구하지 않고 닉네임만으로 서비스를 이용합니다. 별도 회원가입 절차가 없으며, 문서 조회 역시 입력한 닉네임 기준으로만 필터링됩니다.
- **마스킹 안내**: 업로드 화면에 "업로드 전 민감 정보를 직접 가려달라"는 안내 문구를 표시해, 사용자가 개인정보가 포함된 부분을 인지하고 업로드하도록 유도합니다. 이미지·텍스트에서 개인정보를 자동으로 탐지해 가리는 기능은 아직 구현되어 있지 않습니다.

## 배포 / 스크린샷

- **배포 URL**: https://amazing-axolotl-ee7258.netlify.app
- 실제 화면은 위 링크에서 확인할 수 있습니다. 랜딩 → PIN 인증 → 업로드 → 결과 → 보관함 순서로 살펴보는 것을 권장합니다.
- 스크린샷을 저장소에 포함하려면 `docs/screenshots/` 폴더를 만들어 이미지를 추가하고, 이 섹션에 아래와 같이 링크를 연결해주세요.

  ```markdown
  ![랜딩 페이지](docs/screenshots/landing.png)
  ![업로드 페이지](docs/screenshots/upload.png)
  ![결과 페이지](docs/screenshots/result.png)
  ![보관함](docs/screenshots/vault.png)
  ```

## 로컬 실행 방법

**사전 준비물**
- Node.js 20 이상
- Firebase 프로젝트 (Firestore 사용 설정)
- Google Cloud Vision API 키
- Anthropic API 키

**설치 및 실행**

```bash
git clone https://github.com/Ada3verse/pensight.git
cd pensight
npm install
```

루트에 `.env` 파일을 만들고 아래 값을 채워주세요.

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_VISION_API_KEY=
VITE_ANTHROPIC_API_KEY=
VITE_ADMIN_PIN=
```

```bash
npm run dev       # 개발 서버 실행
npm run build      # 프로덕션 빌드
npm run preview    # 빌드 결과 미리보기
```
