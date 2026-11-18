# 병원 댓글·대댓글 배포 방법 (2026-11-19)

DB(Supabase)는 이미 적용 완료. 남은 작업은 사이트 파일 2곳뿐입니다.

1. `comments.js`를 사이트 루트(app.js, extra.js와 같은 위치)에 추가
2. `index.html`에서 기존 스크립트 줄 맨 끝(kakao.js 다음)에 한 줄 추가

```html
<script src="/kakao.js?v=202611160823"></script>
<script src="/comments.js?v=202611190001"></script>   ← 이 줄 추가 (index.html 2136행 바로 아래)
```

※ 반드시 auth.js·extra.js보다 뒤에 와야 합니다.

3. `npx wrangler pages deploy . --project-name naemom` (기존 배포 방식 그대로)

## 적용된 DB 변경 (마이그레이션 hospital_comments, hospital_comments_no_links)
- 테이블 `hospital_comments` (병원별 댓글, parent_id로 대댓글 1단계)
- 작성: 약관 동의 완료 일반 회원 + 운영자 / 병원 관계자 계정 불가 / 비로그인 불가
- 공개 응답에 user_id 미노출(열 권한), 닉네임은 작성 시점 스냅숏
- 링크·전화번호·오픈채팅 주소 차단, 10분 10건 제한, 1시간 내 동일 문구 차단, 300자
- 삭제: 본인·운영자(RPC delete_hospital_comment), 답글 있으면 '삭제된 댓글입니다'로 남김
- 신고: reports.target_type='comment' 추가, 서로 다른 3명 신고 시 자동 숨김
- 운영자: 병원 페이지에서 숨김/복구, #moderate 화면 하단에 '병원 댓글 신고·숨김' 카드
- 댓글은 주의 신호 지수·후기 수에 반영되지 않음
