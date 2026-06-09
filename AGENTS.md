# 출고 소요일 분석 앱 안내

물류 출고 소요일과 진척 현황을 분석하는 Electron 데스크톱 앱입니다. Google Sheets의 주차별 데이터를 읽어 대시보드/진척 화면을 보여주고, 상태를 다시 시트에 반영합니다.

## 기술 구성과 실행

- Electron + Node 메인 프로세스.
- 렌더러는 대형 vanilla HTML/JS 파일인 `index.html`입니다.
- Google Sheets API는 `googleapis`와 서비스 계정으로 연동합니다.
- 실행: `npm start`.
- Windows 빌드: `npm run build`.
- 현재 테스트/린트 스크립트는 없습니다.

## 배포/실행 방식

- Electron 기반 Windows 데스크톱 앱입니다. 개발자는 `npm start`로 Electron 창을 띄웁니다.
- 배포 빌드는 `npm run build`가 `electron-builder --win --x64`를 실행하며, `package.json` 기준 NSIS 설치본과 zip 배포를 전제로 합니다.
- 비개발자는 설치된 EXE 또는 `출고소요일분석 실행.bat` 같은 실행 보조 파일로 앱을 실행하는 형태입니다.
- `service-account.json`, Google Spreadsheet ID/범위, CDN 의존성, localStorage 상태가 배포 동작에 영향을 줍니다. 서비스 계정 파일과 배포 산출물은 소스와 분리합니다.

## 주요 파일

- `main.js` — Electron 시작, Google 인증/읽기/쓰기/업데이트 확인 IPC.
- `preload.js` — `window.electronAPI` IPC 브리지.
- `index.html` — UI와 대부분의 비즈니스 로직.
- `출고소요일분석 실행.bat` — 패키징된 EXE 실행 보조 파일.
- `update-app.bat` — `app.asar` 수동 업데이트 보조 파일.

## 외부 연동

- Google Spreadsheet ID와 시트 범위가 코드에 고정되어 있습니다.
- `service-account.json`은 로컬/패키징 리소스로 필요하며 커밋하지 않습니다.
- 진척/스케줄 상태 일부는 localStorage에 저장됩니다.
- 렌더러 일부 라이브러리는 CDN에서 로드됩니다.

## 작업 규칙

- `service-account.json`, `.env`, 기타 비밀 값을 커밋하지 않습니다.
- `main.js`, `preload.js`, `index.html` 사이의 IPC 계약을 보존합니다.
- 시트 로직 변경 시 탭 이름, 헤더, 범위, 완료 상태 색상 반영을 확인합니다.
- `index.html`은 큰 단일 파일이므로 프레임워크 전환 없이 작은 범위로 수정합니다.
- Windows/Electron 패키징 전제를 유지합니다.
