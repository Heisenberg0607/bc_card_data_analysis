# BC 외국인 상권 demo — Qwen 백엔드

## 로컬 실행

Node.js 22 이상이 필요합니다. `demo/.env.local`의 `DASHSCOPE_API_KEY`에 본인 키를 입력하세요. 파일이 없으면 `.env.example`을 `.env.local`로 복사합니다. 기존 `.env` 또는 `.env.local`은 자동 생성이나 수정으로 덮어쓰지 않습니다. 두 파일이 있으면 `.env.local`을 나중에 로드합니다. 배포 환경변수는 로컬 파일이 덮어쓰지 않습니다.

```dotenv
DASHSCOPE_API_KEY=본인키
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.8-max
```

프로젝트 최상위 터미널에서:

```powershell
cd demo
npm start
```

http://localhost:3000 에 접속하고 Qwen API → Action 생성을 선택합니다. 추가 npm 패키지 설치는 필요 없습니다. 설정을 바꾼 뒤에는 Ctrl+C로 종료하고 다시 실행하세요. Python 정적 서버로는 Qwen 백엔드가 작동하지 않습니다. 규칙 기반 기능은 유지됩니다.

## Vercel

Root Directory는 `demo`, Framework는 Other, Build Command는 비워두고 Output Directory는 `.`로 설정합니다. Node.js 22를 사용합니다. Settings → Environment Variables에 위 세 변수를 등록한 뒤 새로 배포합니다. `api/qwen.mjs`가 서버 함수이고 `vercel.json`이 공통 엔진 파일을 함수에 포함합니다. `.env.local`은 Git 및 배포에서 제외합니다. 브라우저에는 키가 전달되지 않습니다.

키는 서버에서만 읽고 브라우저는 지역 ID와 언어만 전송합니다. 서버가 같은 데이터·규칙 엔진으로 진단과 근거를 다시 구성합니다. 요청에서 모델·주소·프롬프트를 임의 지정할 수 없습니다. API는 로그인 기능이 없는 공개 엔드포인트이므로 공개 배포 시 방문자 호출 비용도 소유자에게 청구됩니다. 사용자별 인증 및 영구 호출량 제한은 추가하지 않았습니다.

`npm test`는 실제 API 키나 유료 호출 없이 분석·언어·서버 보안·모의 응답을 검증합니다. 실제 인증·모델 제공 여부·응답 품질은 본인 키 설정 후 확인해야 합니다. 최종 분석과 추가 데이터 정의는 IMPLEMENTATION.md를 참고하세요.
