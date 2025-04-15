# Discourse 무한 스크롤 페이지네이션 스크립트

Discourse 포럼에서 무한 스크롤을 페이지네이션으로 바꾸는 Tampermonkey 스크립트입니다.  
주로 https://discuss.eroscripts.com/c/ 경로의 글 목록에서 작동합니다.

## 설치 및 사용법

1. [Tampermonkey](https://www.tampermonkey.net/) 혹은 [Violentmonkey](https://violentmonkey.github.io/) 브라우저 확장 설치  
2. `src/eroscript-pagination.js` 파일 내용을 복사하거나 Raw URL을 이용해 스크립트를 등록하세요.  
3. 사이트 접속 시 자동으로 페이지네이션 UI가 작동합니다.

## 주요 기능

- 초기 자동 로드를 페이지별로 제한하여 서버 과부하 방지  
- 미디어 관련 DOM 변화 무시, 무한루프 방지  
- 서버 429 Too Many Requests 대응 로직 포함  
- 편리한 페이지네이션 UI 제공

## 문서 및 지원

- 자세한 FAQ 및 문제해결 가이드는 [docs/faq.md](docs/faq.md)를 참고하세요.  
- 이슈나 개선 요청은 GitHub 이슈 트래커에 남겨주세요.

## 라이센스

MIT License
