# 광수 Online 교무실 2세대 (MVP)

Google Sites(https://sites.google.com/kwangsu.ms.kr/work)를 대체하는 검색 가능 + 모바일 대응 포털.
설계 배경과 로드맵은 `C:\Users\user\.claude\plans\shiny-sprouting-beaver.md` 참고.

공유 유틸리티(`norm`, `findSheet`, `getSS_` 등)는 `../gwangsu-shared-lib/`에서 가져왔다 — 함수를 수정하려면 거기서 먼저 고치고 이 프로젝트로 다시 복붙할 것.

## 1. 시트 3종 준비

### 색인 (검색용)
새 스프레드시트(또는 기존 시트의 새 탭)에 `색인` 탭을 만들고 헤더를 입력:

```
제목 | 카테고리 | 링크 | 키워드 | 설명 | 담당자 | 노출순서
```

기존 Google Sites의 메뉴/버튼 15~30개를 한 번에 옮겨 적는다. 카테고리는 학사일정/회의록/부서별자료/정보기기/전학공/창체자유학기/학생자치회/3학년부 등 기존 사이트 메뉴명을 그대로 써도 된다.

### 학사일정 (Google Form)
새 Google Form 생성, 질문: 행사명(단답), 시작일(날짜), 종료일(날짜, 선택), 대상(단답/선택), 비고(단답, 선택). 응답을 새 스프레드시트로 연결.

### 회의록 (Google Form)
새 Google Form 생성, 질문: 회의명(단답), 일시(날짜), 작성자(단답), 회의록 링크(단답 — Doc/Drive URL), 요약(장문).

## 2. Apps Script 프로젝트 설정

1. 색인 시트(또는 그 컨테이너)에서 확장 프로그램 → Apps Script
2. 이 폴더의 `Code.gs` 내용을 기본 `Code.gs`에 붙여넣기
3. 새 파일(`SharedLib.gs`) 추가 → `../gwangsu-shared-lib/SharedLib.gs` 내용 붙여넣기
4. `index.html`, `schedule.html`, `minutes.html` 각각 새 HTML 파일로 추가 (파일명에서 `.html` 확장자는 Apps Script가 자동으로 처리하므로 `index`, `schedule`, `minutes`로 등록)
5. `Code.gs` 상단의 `SS_INDEX`, `SS_SCHEDULE`, `SS_MINUTES`를 실제 스프레드시트 ID로 교체 (URL의 `/d/`와 `/edit` 사이 문자열)
6. 배포 → 새 배포 → 웹 앱 → 실행 사용자: 나, 액세스 권한: 전체 공개(또는 학교 도메인) → 배포
7. 배포된 `/exec` URL을 `index.html`, `schedule.html`, `minutes.html`의 `APPS_SCRIPT_URL`에 채워 넣기 (GitHub Pages에서 호출할 때 사용)

## 3. GitHub Pages 배포 (선택)

이 폴더를 GitHub 저장소로 만들고 Pages를 켜면, Apps Script `/exec` URL과 별개로 더 깔끔한 URL로 같은 화면을 외부에 공개할 수 있다. Apps Script 자체 URL로도 충분히 동작하므로 필수는 아님.

## 4. 검증 체크리스트
계획 문서 7번 섹션(검증 계획) 그대로 — 배포 직후 `?action=getIndex` 직접 호출 → 색인 10~15행 시딩 후 검색 동작 확인 → 모바일 뷰포트 확인 → 학사일정/회의록 폼 제출 후 즉시 반영 확인 → 카카오톡 인앱 브라우저 배너 확인 → 공유 라이브러리를 기존 프로젝트(chemical_view)에 재적용해 회귀 없는지 확인.
