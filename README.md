# 소중한 내몸

수술 전, 공공데이터로 먼저 확인하고 인증된 후기로 한 번 더 확인하는 안과·치과 병원 정보 서비스.

## 구조
- `web/` 웹 프론트엔드 (현재 `prototype.html`은 MVP 프로토타입)
- `supabase/migrations/` DB 스키마·보안정책(RLS)
- `data/` 수집 데이터 스냅샷 (국민연금 2026.09, 심평원 2026.10, 네이버 외부 글 2026.10.27)
- `scripts/` 수집 스크립트 (키는 환경변수로만 주입)

## 환경변수
| 이름 | 용도 |
|---|---|
| HIRA_SERVICE_KEY | 공공데이터포털 심평원 API |
| NAVER_HUB_CLIENT_ID / NAVER_HUB_CLIENT_SECRET | NAVER API HUB 검색 |
| NAVER_LOGIN_CLIENT_ID / NAVER_LOGIN_CLIENT_SECRET | 네이버 로그인 (Edge Function 비밀값) |

키는 절대 커밋하지 않습니다.

## 데이터 출처
국민연금공단 가입 사업장 내역, 건강보험심사평가원 병원정보·의료기관별상세정보·비급여진료비정보 (공공누리 제1유형, 출처표시).
