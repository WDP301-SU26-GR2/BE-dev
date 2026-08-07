# Production demo seed v2 — runbook cho Flow 1–6

Đây là runbook duy nhất để nạp, kiểm tra và demo bộ dữ liệu theo `Docs/Requiment-SRS/Requiment.md` bản mới. Seed v2 bám flow stage-based `INKING → DETAILING → LETTERING → FINAL_CHECK`, SurveyPeriod có cohort, Board roster/decision và Contract có căn cứ serialization.

## 1. Phạm vi và tính trung thực của dữ liệu

- 17 tài khoản nội bộ, 44 Series, 191 Chapter, 234 Page, 84 ProductionStage, 206 ProductionStagePage, 30 Task và 10 AI job.
- 12 file ảnh thật có nguồn/license rõ ràng được mirror vào R2 prefix `demo-seed/v2/`: ảnh mangaka vẽ trực tiếp, rough draft, line art, manga pages, cleaned/lettered output và tài liệu Hokusai.
- 234 là số **Page record nghiệp vụ**, không phải 234 binary ảnh độc nhất. Các record tái sử dụng có chủ đích 12 file thật để demo ổn định; không có placeholder/base64/URL ảnh giả.
- `Go Go! Encyclopedia Girls` và `Hokusai Manga` là tác phẩm/nguồn thật. Tên proposal khác, ranking, số tiền và điều khoản là dữ liệu nghiệp vụ mô phỏng hợp lý; không được trình bày như hợp đồng/doanh số có thật.
- Mỗi Flow 1, 2, 3, 5 và 6 có 10 run độc lập (`01`–`10`). Flow 4 có đủ hai cohort: WEEKLY và MONTHLY, mỗi cohort có 14 kỳ lịch sử, 10 kỳ chờ finalize và 1 kỳ đang mở.

## 2. Tài khoản demo

Mật khẩu chung: `MangaDemo!2026`

| Vai trò     | Alias            | Email                               |
| ----------- | ---------------- | ----------------------------------- |
| Super Admin | `admin.hikari`   | `admin.hikari@demo.mangaka.local`   |
| Mangaka     | `mangaka.akari`  | `mangaka.akari@demo.mangaka.local`  |
| Mangaka     | `mangaka.ren`    | `mangaka.ren@demo.mangaka.local`    |
| Mangaka     | `mangaka.sora`   | `mangaka.sora@demo.mangaka.local`   |
| Assistant   | `assistant.yuki` | `assistant.yuki@demo.mangaka.local` |
| Assistant   | `assistant.hana` | `assistant.hana@demo.mangaka.local` |
| Assistant   | `assistant.minh` | `assistant.minh@demo.mangaka.local` |
| Assistant   | `assistant.emi`  | `assistant.emi@demo.mangaka.local`  |
| Assistant   | `assistant.kei`  | `assistant.kei@demo.mangaka.local`  |
| Assistant   | `assistant.linh` | `assistant.linh@demo.mangaka.local` |
| Editor      | `editor.naomi`   | `editor.naomi@demo.mangaka.local`   |
| Editor      | `editor.duc`     | `editor.duc@demo.mangaka.local`     |
| Board       | `board.aya`      | `board.aya@demo.mangaka.local`      |
| Board       | `board.kenji`    | `board.kenji@demo.mangaka.local`    |
| Board       | `board.mai`      | `board.mai@demo.mangaka.local`      |
| Board       | `board.taro`     | `board.taro@demo.mangaka.local`     |
| Board       | `board.an`       | `board.an@demo.mangaka.local`       |

Tất cả account là `ACTIVE`, đã verify email. Chỉ bật trong cửa sổ demo; sau hai tuần phải khóa hoặc reset/xóa toàn bộ domain demo.

## 3. Seed local trước khi lên production

Xác nhận URL DB mà không in credential:

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$uri = [Uri]$line.Substring('DATABASE_URL='.Length).Trim('"')
"host=$($uri.Host) port=$($uri.Port) database=$($uri.AbsolutePath.Trim('/'))"
```

Chạy full seed local; nếu đã có seed cũ thì bắt buộc reset:

```powershell
pnpm.cmd prisma:generate
pnpm.cmd build
$env:DEMO_SEED_ALLOW_RESET = 'YES'
pnpm.cmd seed:demo -- --reset
pnpm.cmd seed:demo:verify
```

Không dùng `--skip-media-upload` hoặc `--skip-media-check` cho lần nghiệm thu. Hai cờ chỉ dành cho debug DB khi outbound/R2 tạm lỗi.

Kết quả pass hiện tại phải có tối thiểu:

- `accounts=17`, `mediaAssets=12`, `series=44`, `chapters=191`, `pages=234`;
- `productionStages=84`, `productionStagePages=206`, `activeInkingStages=10`;
- `tasks=30`, chia đều `ASSIGNED/SUBMITTED/REVISION_REQUESTED`, toàn bộ task có stage/type/description hợp lệ;
- `successfulAiJobs=10`, cả 10 chưa apply và gắn đúng stage input snapshot;
- `scopedSurveyPeriods=50`, `rankingRecords=294`; trong đó mỗi WEEKLY/MONTHLY có `14 REFLECTED`, `10 CLOSED`, `1 OPEN`;
- `pendingBoardDecisions=10`, `draftContracts=10` (mỗi contract liên kết quyết định SERIALIZATION), `fullyExecutedContracts=21`;
- `contractVersions=31`, `linkedContracts=31`, `paymentConditions=42`, `paymentRecords=42`;
- cuối log: `All demo seed invariants passed` hoặc `Verification complete` mà không có failure.

## 4. Nạp production an toàn

### 4.1 Preflight bắt buộc

1. Checkout đúng commit đang deploy; `pnpm.cmd install --frozen-lockfile`, generate Prisma và build pass.
2. Xác nhận `DATABASE_URL` thật sự là production, ghi lại database name/host; xác nhận Redis và R2 secrets.
3. Backup Mongo ngay trước seed. Ví dụ:

```powershell
mongodump --uri="$env:DATABASE_URL" --out ".backup/demo-v2-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

4. R2 credential cần `HeadObject`, `PutObject`, `CopyObject` trên `demo-seed/v1/` và `demo-seed/v2/`. Seed tái sử dụng object v1 nếu có để tránh tải lại/HTTP 429.
5. Không chạy khi đang có người dùng demo hoặc job deploy khác.

### 4.2 Thay bộ seed cũ bằng v2

Production đã có dataset cũ phải dùng `--reset`; reset chỉ tìm user `@demo.mangaka.local`, thu thập ID liên kết và xóa child-first. Không có `deleteMany({})` toàn DB.

```powershell
$env:NODE_ENV = 'production'
$env:DEMO_SEED_ALLOW_PRODUCTION = 'YES'
$env:DEMO_SEED_ALLOW_RESET = 'YES'
pnpm.cmd seed:demo -- --reset
pnpm.cmd seed:demo:verify
```

Khi chạy, terminal phải tiến qua `Media 1/12...12/12` và `Phase 1/8...8/8`. Một ảnh nguồn Wikimedia có thể im lặng tối đa khoảng 80 giây khi bị rate-limit: seed pace 3 giây giữa các lần mirror, thử tối đa 5 lần, tôn trọng `Retry-After` đến 60 giây, rồi báo đúng slug lỗi. Không để tiến trình chạy hàng giờ; nếu không đổi log sau 3 phút hoặc terminal báo lỗi, giữ log và xử lý nguyên nhân trước khi chạy lại `--reset`.

Nếu seed fail giữa chừng: sửa nguyên nhân, giữ backup, rồi chạy lại đúng lệnh reset; không chạy seed chồng khi thiếu `--reset`.

## 5. OTP ký hợp đồng cho tài khoản demo

API ký vẫn xác thực OTP thật. Vì email `@demo.mangaka.local` không nhận mail, operator cấp một OTP ngẫu nhiên có hạn 5 phút, hash bằng bcrypt và chỉ cho Mangaka/Board demo:

```powershell
# local
pnpm.cmd seed:demo:otp -- mangaka.ren

# production — chỉ trong cửa sổ demo đã duyệt
$env:NODE_ENV = 'production'
$env:DEMO_SEED_ALLOW_PRODUCTION = 'YES'
pnpm.cmd seed:demo:otp -- board.aya
```

CLI in OTP một lần ra terminal. Dùng ngay cho endpoint ký; OTP được service consume như OTP gửi email bình thường. Mỗi chữ ký/lần thử mới phải issue OTP mới. Không chụp/lưu OTP vào tài liệu hay source control.

## 6. Kịch bản demo chuẩn

API local mặc định `http://localhost:4000`. Login `POST /auth/login`, gửi access token dạng Bearer. Tìm record theo prefix `[DEMO ...]`.

### Flow 1 — Proposal → queue → claim/release → consolidated review → pitch

1. Mangaka chọn `[DEMO F1-01]` đến `10`; mỗi record `DRAFT`, `editorId=null`, có synopsis, character design và các trang phác thảo nhúng trong proposal.
2. Submit `POST /series/:id/submit`; Editor Naomi xem queue rồi `POST /series/:id/claim`.
3. Trước review có thể demo `POST /series/:id/release`; claim lại rồi request revision/approve proposal.
4. Editor approve proposal bằng `POST /series/:id/proposal/approve`; proposal thành `PROPOSAL_APPROVED` và series thành `READY_TO_PITCH` ngay trong cùng action.
5. `POST /series/:id/pitch`, tạo session/decision serialization và vote theo roster lẻ 5 người.
6. Dùng `[DEMO F1-SHOWCASE-1..3]` để nhảy thẳng tới `PROPOSAL_REVIEW`, `PROPOSAL_REVISION` hoặc
   `READY_TO_PITCH`; cả ba proposal đều có `storyboardPages` từ object key media thật.

### Flow 2 — Chapter-first, Storyboard gate, stage production, manuscript

1. Mở `[DEMO F2-F3] Go Go! Encyclopedia Girls — licensed production study`.
2. Chapter 101–110 là 10 run Storyboard `SUBMITTED`, Manuscript `DRAFT`, chưa có page/stage; page upload phải bị chặn.
3. Editor request revision/approve qua `/chapters/:id/storyboards/:storyboardId/*`. Khi Storyboard được duyệt, backend seed đúng bốn stage; INKING là stage duy nhất ACTIVE.
4. Mangaka upload pencil pages; backend tạo StagePage input từ `Page.originalFile`.
5. Checkpoint dựng sẵn: chapter 70 `EDITOR_REVIEW`, 71 `EDITOR_REVISION` có RevisionRequest/annotation, 72 `READY_FOR_PRINT`.
6. Approve/publish qua `/chapters/:id/manuscript/approve` và `/chapters/:id/publish`. Các chapter 1–8 có lịch sử PUBLISHED và stage đã hoàn tất.

### Flow 3 — AI → Region → Task → stage output

1. Chọn chapter `[DEMO F3-01]` đến `10`. Mỗi run có 3 trang input thật và bốn stage; chỉ INKING ACTIVE.
2. `GET /chapters/:id/stages`, `GET /chapters/:id/stages/:stageId/pages` để thấy snapshot input bất biến.
3. Mỗi run có một AI job `SUCCEEDED` chưa apply, source trùng stage input. Xem `GET /pages/:id/ai-jobs`, apply `POST /ai-jobs/:id/apply`, hoặc khoanh Region thủ công.
4. Ba task INKING trong run lần lượt `ASSIGNED`, `SUBMITTED`, `REVISION_REQUESTED`. Assistant Yuki/Kei start/submit; Mangaka approve hoặc request revision. Task có description, deadline, version file thật và annotation đúng Page/task.
5. Khi mọi task non-cancelled đã approved, Mangaka confirm **đủ cả 3 page output** bằng `PUT /chapters/:id/stages/:stageId/outputs` (`fileKey` mới hoặc `reuseInput=true`).
6. `POST /chapters/:id/stages/:stageId/complete` mở DETAILING. Lặp với task type cho phép; LETTERING xong sẽ mở FINAL_CHECK. Submit manuscript đóng FINAL_CHECK.

### Flow 4 — Survey scoped, vote online/offline và ranking

1. Public `GET /vote/context`: issue 400 OPEN cho `Manga Nexus Weekly/WEEKLY`; issue 700 OPEN cho `Manga Nexus Monthly/MONTHLY`. Cả hai cohort có danh sách eligible series và lịch sử tách biệt.
2. Chỉ Super Admin Hikari vận hành kỳ: mở/đổi trạng thái/import offline/finalize qua `/survey-periods` và `/survey-data/import`; Editor chỉ đọc ranking để chuẩn bị report Board.
3. Demo OTP/vote bằng `POST /vote/otp`, `POST /vote`; mỗi identity chỉ một phiếu trong kỳ/type, tối đa ba series. WEEKLY issue 300–309 và MONTHLY issue 600–609 là 10 kỳ CLOSED có cả ReaderVote weighted và SurveyData offline để Hikari finalize.
4. WEEKLY issue 200–213 là 14 kỳ REFLECTED cho chart hai tuần; MONTHLY issue 500–513 là 14 kỳ REFLECTED theo nhịp 28 ngày. Tổng 294 RankingRecord có normalized score, previous rank/change và ba series mỗi cohort đi đến `SEVERE`.
5. Xem live/public/internal qua `/vote/live`, `/vote/results`, `/rankings`, `/rankings/board`, `/rankings/aggregate`.

### Flow 5 — Board lifecycle decision

1. Mở session `[DEMO F5] Hội đồng xử lý 10 series nguy cơ`, ACTIVE/VOTING, roster 5 Board Member.
2. Decision 01–10 trỏ đến `[DEMO RANK-*]`, có 14 kỳ trend, defense report và attachment thật.
3. Năm tài khoản Board vote `POST /board/decisions/:id/vote`. Quorum là `ceil(2/3 × 5)=4`; approve cần trên 50% toàn roster, tức tối thiểu 3 approve.
4. Run `01/04/07/10` dùng CANCELLATION với ending allowance 3; `02/05/08` dùng FORMAT_CHANGE với `details.publicationType=MONTHLY`; `03/06/09` dùng COMPLETION. Muốn demo “giữ series”, Board vote REJECT một CANCELLATION; không có decision type CONTINUE.

### Flow 6 — Contract → Board representative → Mangaka accept/reject → payment

1. Editor Duc chọn `[DEMO F6-01]` đến `10`. Series đã có Board SERIALIZATION decision APPROVED; Contract `DRAFT` liên kết đúng `boardDecisionId`, có ContractVersion 1.
2. Khi Contract còn `DRAFT|BOARD_REVIEW`, Editor tạo/sửa PaymentCondition. Dùng config đúng API: recurring `{ "every": 4 }`, chapter milestone `{ "chapter": 10 }`, ranking `{ "topRank": 3 }`, time-bound `{ "deadline": "YYYY-MM-DD" }`.
3. Editor gửi review nội bộ qua `POST /contracts/:id/submit-review` → `BOARD_REVIEW`; Board trong roster comment bằng `POST /contracts/:id/comments`; Editor sửa điều khoản vẫn giữ `BOARD_REVIEW` và sinh ContractVersion mới.
4. Một Board member đúng roster `POST /contracts/:id/claim` để thành `representativeId`; đại diện issue OTP và `POST /contracts/:id/sign-representative` → `AWAITING_MANGAKA`.
5. Mangaka issue OTP và `POST /contracts/:id/sign-mangaka` để accept → `FULLY_EXECUTED`, hoặc `POST /contracts/:id/reject` kèm lý do → `REJECTED_BY_MANGAKA`; Editor có thể `POST /contracts/:id/redraft`.
6. Hợp đồng production/ranking dựng sẵn có Contract FULLY_EXECUTED, đủ version/representative signature, condition và payment record để demo lịch sử.

## 7. Lịch demo hai tuần

| Ngày  | Run chính                 | Dự phòng                        |
| ----- | ------------------------- | ------------------------------- |
| 1–5   | suffix `01`–`05`          | F1 showcase, chapter 70–72      |
| 6–10  | suffix `06`–`10`          | lịch sử published/payment       |
| 11–14 | ranking issue `200`–`213` | backup rồi reset toàn seed demo |

Trước mỗi buổi chạy `pnpm.cmd seed:demo:verify`. Ghi lại suffix/decision/issue đã dùng. Không sửa Mongo trực tiếp để quay state.

## 8. Nguồn ảnh và attribution

| Slug                        | Tác phẩm/tác giả                              | License           | Nguồn                                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mangaka-live-drawing`      | Acky Bright live drawing / Yasumanta          | CC0 1.0           | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Meta_Its_your_world_live_drawing_001_s.jpg)                                                                                                                                                                                                |
| `rough-drafting`            | Rough drafting / らいみぃ                     | CC BY 3.0         | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Drafting_of_anime_illustrations.webp)                                                                                                                                                                                                      |
| `finished-line-art`         | Finished line drawing / らいみぃ              | CC BY 3.0         | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Line_drawing_of_an_anime_illustration.webp)                                                                                                                                                                                                |
| `manga-page-1..4`           | _Go Go! Encyclopedia Girls_ / Kasuga          | CC BY-SA 3.0      | [P1](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1.jpg), [P2](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page2.jpg), [P3](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page3.jpg), [P4](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page4.jpg) |
| `manga-page-cc0`            | Manga page / Public Domain Q                  | CC0 1.0           | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Manga_page_publicdomainq.png)                                                                                                                                                                                                              |
| `cleaned-lettering-page`    | cleaned page / Kasuga, Opencooper             | CC BY-SA 3.0      | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1_-_waifu2x_-_cleaned.png)                                                                                                                                                                                            |
| `scanlated-page`            | English-lettered page / Kasuga, Opencooper    | CC BY-SA 3.0      | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1_-_waifu2x_-_scanlated_English.png)                                                                                                                                                                                  |
| `three-production-versions` | original/cleaned/translated panel / Okitan    | CC BY-SA 4.0      | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Three_versions.png)                                                                                                                                                                                                                        |
| `hokusai-sketchbook`        | _Hokusai Manga_ / Katsushika Hokusai, The Met | Public domain/CC0 | [The Met](https://www.metmuseum.org/art/collection/search/78791)                                                                                                                                                                                                                                       |

Giữ credit khi trình chiếu. DB chỉ lưu object key; không hotlink source. R2 v1 không bị xóa tự động sau upgrade; chỉ cleanup thủ công sau khi v2 đã verify và không còn deployment cũ tham chiếu.

## 9. Xử lý sự cố

- `Found ... demo accounts`: dùng verify nếu muốn giữ dữ liệu; nếu thay bộ cũ, backup và dùng `--reset`.
- `Production seed is locked`: thiếu `DEMO_SEED_ALLOW_PRODUCTION=YES`.
- `Missing R2 media objects`: xem đúng slug, kiểm tra Head/Put/Copy permission và prefix v2; không bỏ qua ở production.
- `HTTP 429`: seed tự pace/retry tối đa 5 lần. Chờ rate limit rồi chạy lại đúng lệnh `--reset`; các object đã mirror vào R2 sẽ được tái sử dụng, không tải lại. Không để tiến trình chạy hàng giờ.
- `Demo verification failed`: không demo. Giữ log, reset đúng phạm vi và seed lại sau khi sửa.
- UI không thấy record nhưng verifier pass: kiểm tra token/role/scoping; tìm title theo prefix `[DEMO ...]`.
