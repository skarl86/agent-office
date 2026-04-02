# Agent Office

OpenClaw 멀티에이전트 시스템의 시각적 모니터링/관리 대시보드.

## 기능

- 🏢 **가상 오피스** — 에이전트 실시간 상태 시각화
- 💬 **채팅** — 에이전트와 실시간 대화
- 📊 **대시보드** — 시스템 통계 및 모니터링
- 🤖 **에이전트 관리** — 생성/삭제/설정
- 📡 **채널 관리** — Telegram, Discord 등
- 🧩 **스킬 관리** — 스킬 마켓플레이스
- ⏰ **크론 작업** — 정기 작업 스케줄
- ⚙️ **설정** — Provider, 외관, Gateway

## 기술 스택

React 19 / TypeScript / Vite 6 / Zustand 5 / Tailwind CSS 4 / i18next

## 시작하기

```bash
pnpm install
pnpm dev      # http://localhost:5180
```

## 환경 변수

`.env.local` 파일 생성:

```
VITE_GATEWAY_URL=ws://localhost:18789
VITE_GATEWAY_TOKEN=your-token
VITE_MOCK=true  # Mock 모드 (Gateway 없이 개발)
```

## 빌드

```bash
pnpm build
pnpm preview
```

## 프로젝트 구조

```
src/
├── components/
│   ├── chat/          # 채팅 컴포넌트
│   ├── console/       # 콘솔 페이지 컴포넌트
│   ├── layout/        # 레이아웃 (AppShell, Sidebar, TopBar)
│   ├── office-2d/     # 2D 오피스 뷰 컴포넌트
│   ├── pages/         # 페이지 컴포넌트
│   ├── panels/        # 사이드 패널 (AgentDetailPanel, EventTimeline)
│   └── shared/        # 공용 컴포넌트
├── gateway/           # Gateway WebSocket 어댑터 및 타입
├── hooks/             # React 훅
├── i18n/              # 다국어 (ko/en)
├── lib/               # 유틸리티
└── store/             # Zustand 스토어
```
