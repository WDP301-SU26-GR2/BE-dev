# Production demo seed — runbook cho 6 flow đầu

Tài liệu này là runbook duy nhất để nạp, kiểm tra và trình diễn bộ dữ liệu demo. Bộ seed chỉ sở hữu user có email `@demo.mangaka.local` và các record liên kết với các user đó; không được đổi domain này nếu chưa cập nhật đồng thời logic reset và verifier.

## 1. Bộ dữ liệu có gì

- 16 tài khoản: 3 Mangaka, 6 Assistant, 2 Editor và 5 Board Member.
- 11 ảnh thật có giấy phép mở, được tải từ Wikimedia Commons/The Met rồi mirror vào private R2 theo prefix `demo-seed/v1/`.
- 10 hồ sơ Flow 1 có thể chạy từ đầu và 4 hồ sơ showcase ở các checkpoint review.
- 1 series production `Neon Ronin: Echoes of Edo`: 8 chương đã xuất bản, 10 chapter Name chờ review, 10 trang workshop và 30 task thật.
- 10 AI job `SUCCEEDED`, vùng AI + vùng chỉnh tay, task version, annotation và revision request.
- 10 series ranking đã ký hợp đồng, mỗi series có 8 chương đã xuất bản; thêm hero thành 11 series đủ điều kiện bình chọn.
- 14 kỳ ranking `REFLECTED`, 10 kỳ `CLOSED` có cả phiếu online và số liệu offline, 1 kỳ `OPEN`.
- 10 Board decision `PENDING`, mỗi decision có defense report và attachment.
- 10 series Flow 6 có hợp đồng `DRAFT`; hợp đồng đã ký của production series có điều kiện và payment record để demo tiếp.

Mọi bộ “10 lần” dùng hậu tố `01` đến `10`. Khi một run đã bị thao tác qua checkpoint mong muốn, chuyển sang số kế tiếp. Sau 10 lần có thể reset riêng demo seed và bắt đầu lại; 14 kỳ ranking đủ để trình diễn lịch sử liên tục trong hai tuần.

## 2. Tài khoản demo

Mật khẩu chung: `MangaDemo!2026`

| Vai trò   | Email                               | Tên hiển thị   |
| --------- | ----------------------------------- | -------------- |
| Mangaka   | `mangaka.akari@demo.mangaka.local`  | Akari Mori     |
| Mangaka   | `mangaka.ren@demo.mangaka.local`    | Ren Takahashi  |
| Mangaka   | `mangaka.sora@demo.mangaka.local`   | Sora Nguyen    |
| Assistant | `assistant.yuki@demo.mangaka.local` | Yuki Sato      |
| Assistant | `assistant.hana@demo.mangaka.local` | Hana Ito       |
| Assistant | `assistant.minh@demo.mangaka.local` | Minh Tran      |
| Assistant | `assistant.emi@demo.mangaka.local`  | Emi Kato       |
| Assistant | `assistant.kei@demo.mangaka.local`  | Kei Watanabe   |
| Assistant | `assistant.linh@demo.mangaka.local` | Linh Pham      |
| Editor    | `editor.naomi@demo.mangaka.local`   | Naomi Fujita   |
| Editor    | `editor.duc@demo.mangaka.local`     | Duc Le         |
| Board     | `board.aya@demo.mangaka.local`      | Aya Nakamura   |
| Board     | `board.kenji@demo.mangaka.local`    | Kenji Hayashi  |
| Board     | `board.mai@demo.mangaka.local`      | Mai Shimizu    |
| Board     | `board.taro@demo.mangaka.local`     | Taro Kobayashi |
| Board     | `board.an@demo.mangaka.local`       | An Hoang       |

Các user đều `ACTIVE`, đã verify email và không bị buộc đổi mật khẩu. Đây là tài khoản trình diễn có quyền thật: chỉ bật trong cửa sổ demo, không dùng làm tài khoản vận hành. Sau đợt demo phải xóa hoặc vô hiệu hóa toàn bộ domain demo.

## 3. Nạp lên production

### 3.1 Preflight bắt buộc

1. Chụp backup MongoDB ngay trước khi seed, ghi lại tên database và thời điểm backup.
2. Xác nhận đúng `DATABASE_URL`, Redis và bộ biến R2: `R2_ENDPOINT`, `R2_REGION`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
3. R2 credential phải có quyền `HeadObject` và `PutObject` trên prefix `demo-seed/v1/`.
4. Máy chạy seed cần truy cập HTTPS đến `commons.wikimedia.org` để tải file gốc.
5. Build đúng commit sẽ deploy; không chạy seed từ source khác commit production.

Ví dụ backup bằng MongoDB Database Tools, không in connection string ra log:

```powershell
mongodump --uri="$env:DATABASE_URL" --out ".backup/demo-seed-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

### 3.2 Lần nạp đầu

Các biến production phải được inject bởi secret manager/deployment environment. Không commit `.env` chứa secret.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd prisma:generate
pnpm.cmd build
$env:NODE_ENV = 'production'
$env:DEMO_SEED_ALLOW_PRODUCTION = 'YES'
pnpm.cmd seed:demo
pnpm.cmd seed:demo:verify
```

Seed bị khóa trên production nếu thiếu `DEMO_SEED_ALLOW_PRODUCTION=YES`. Nếu đã tồn tại tài khoản demo, lệnh sẽ dừng thay vì ghi chồng.

### 3.3 Reset riêng dữ liệu demo

Chỉ reset sau khi đã backup và xác nhận không có buổi demo đang diễn ra. Reset tìm đúng 16 user theo domain demo, thu thập các ID liên quan rồi xóa child-first; không dùng `deleteMany({})` toàn database.

```powershell
$env:NODE_ENV = 'production'
$env:DEMO_SEED_ALLOW_PRODUCTION = 'YES'
$env:DEMO_SEED_ALLOW_RESET = 'YES'
pnpm.cmd seed:demo -- --reset
pnpm.cmd seed:demo:verify
```

Object R2 được dùng lại nếu đã tồn tại; database Asset được tạo lại. Không dùng `--skip-media-upload` hoặc `--skip-media-check` trên production. Hai cờ này chỉ dành cho kiểm thử cấu trúc khi môi trường local không có R2.

### 3.4 Tiêu chí pass

`seed:demo:verify` phải kết thúc bằng `All demo seed invariants passed`. Verifier kiểm tra account, asset, task theo từng trạng thái, AI job thành công, survey/ranking, Board decision, hợp đồng, payment và `HeadObject` đủ 11 file trên R2. Nếu seed dừng giữa chừng, không chạy lại chồng; dùng quy trình reset rồi seed lại.

## 4. Kịch bản demo chuẩn

API local mặc định là `http://localhost:4000`. Đăng nhập qua `POST /auth/login`; dùng access token được trả về làm Bearer token. Trên UI, tìm record theo prefix trong cột tên/title để không chọn nhầm dữ liệu vận hành.

### Flow 1 — Proposal, Name và pitch Board

1. Login Mangaka Akari/Ren/Sora; chọn `[DEMO F1-01]` (lần sau tăng đến `10`). Hồ sơ có synopsis, rough draft và line art thật.
2. Cập nhật nếu cần rồi submit qua `POST /series/:id/submit`.
3. Login Editor Naomi; mở queue qua `GET /series`, claim bằng `POST /series/:id/claim`.
4. Demo request revision/resubmit/approve proposal và Name qua các route `/series/:id/proposal/*` và `/series/:id/names/:nameId/*`.
5. Pitch series bằng `POST /series/:id/pitch`; chuyển sang tài khoản Board để trình bày vote.
6. Muốn bỏ qua thao tác trung gian, dùng bốn record `[DEMO F1-SHOWCASE-*]`: chờ claim, proposal cần sửa, Name cần sửa vòng 3, sẵn sàng pitch.

### Flow 2 — Chapter, Name gate, manuscript review và publish

1. Login Editor Naomi, mở `[DEMO F2-F3] Neon Ronin: Echoes of Edo`.
2. Chọn chapter `[DEMO F2-01] Name review run` đến `10`; Name đang `SUBMITTED`, manuscript còn `DRAFT` để chứng minh Name gate.
3. Review Name qua `/chapters/:id/names/:nameId/request-revision`, `/resubmit`, `/approve`.
4. Các checkpoint dựng sẵn: chapter 51 chờ Editor, 52 đã trả sửa và có annotation, 53 `READY_FOR_PRINT`.
5. Demo approve/publish bằng `/chapters/:id/manuscript/approve` và `/chapters/:id/publish`. Tám chapter 1–8 là lịch sử xuất bản hợp lệ.

### Flow 3 — AI segmentation, vùng thủ công và phân việc studio

1. Login Mangaka Akari, mở chapter 50 `Workshop — 10 trang phân việc song song`.
2. Mỗi trang dùng một trang manga thật; xem AI job qua `GET /pages/:id/ai-jobs`, regions qua `GET /pages/:id/regions`.
3. Bộ seed có cả vùng AI và vùng do người dùng chỉnh tay. Có thể gọi `POST /pages/:id/segment` trên một trang chưa dùng khi AI service sẵn sàng.
4. Mỗi trang có ba task với hướng dẫn nghề nghiệp cụ thể: `ASSIGNED`, `SUBMITTED`, `REVISION_REQUESTED`. Login đúng Assistant để start/submit; Mangaka dùng approve/request-revision.
5. Task đã submit/revision có file kết quả thật, version history, reference assets và annotation tọa độ. Chọn trang 01 đến 10 cho mỗi lần demo.

### Flow 4 — Vote online/offline và ranking

1. Không login, mở context public qua `GET /vote/context`; kỳ hiện tại là issue 400 ở trạng thái `OPEN`.
2. Demo OTP + vote qua `POST /vote/otp` và `POST /vote`. Config cho tối đa 3 series mỗi phiếu.
3. Login Editor Duc để xem 10 kỳ `CLOSED`, mỗi kỳ có offline SurveyData và online ReaderVote, gồm cả một phiếu bị flag/giảm trọng số.
4. Xem 14 kỳ đã reflect qua `GET /rankings` hoặc `GET /rankings/board`. Ba series cuối có chuỗi at-risk tăng dần đến `SEVERE`.
5. Dùng issue 300–309 cho 10 lần demo xử lý kỳ; lịch sử issue 200–213 dành cho biểu đồ hai tuần.

### Flow 5 — Board lifecycle

1. Login Board Aya; mở session `[DEMO F5] Hội đồng xử lý 10 series nguy cơ`, đang `ACTIVE/VOTING`.
2. Chọn decision 01–10. Mỗi decision target một `[DEMO RANK-*]`, có ranking 14 kỳ, defense report và attachment thật.
3. Dùng năm tài khoản Board để vote qua `POST /board/decisions/:id/vote`; config quorum là 3/5 và majority > 50%.
4. Kết luận session bằng `/board/sessions/:id/conclude`, kiểm tra side effect trạng thái series theo decision.
5. Không tiêu thụ cả 10 decision trong một buổi nếu cần demo nhiều ngày; dành một decision cho mỗi lượt.

### Flow 6 — Soạn, duyệt, ký hợp đồng và payment

1. Login Editor Duc, chọn `[DEMO F6-01]` đến `10`. Mỗi series đã `SERIALIZED` nhưng chưa có chapter xuất bản và có đúng một contract `DRAFT` — không vi phạm publish gate.
2. Cập nhật/submit/request changes qua `PATCH /contracts/:id`, `PATCH /contracts/:id/status`, `POST /contracts/:id/request-changes`.
3. Login Board để approve/sign; login Mangaka Ren/Sora để ký phía tác giả. Kiểm tra state qua `GET /contracts/:id/status`.
4. Sau `FULLY_EXECUTED`, thêm payment condition qua `POST /contracts/:id/payment-conditions` rồi thao tác payment qua `/payments`.
5. Muốn chỉ trình diễn payment đã có lịch sử, dùng hợp đồng của Neon Ronin: đã có recurring chapter condition, ranking condition, một payment `PAID` và một payment `APPROVED`.

## 5. Lịch demo hai tuần

| Ngày  | Dataset chính         | Dataset dự phòng                           |
| ----- | --------------------- | ------------------------------------------ |
| 1–5   | Suffix `01`–`05`      | Showcase/checkpoint dựng sẵn               |
| 6–10  | Suffix `06`–`10`      | Neon Ronin chapter 51–53                   |
| 11–14 | Ranking issue 200–213 | Reset demo seed nếu cần chạy lại full flow |

Trước mỗi buổi chạy `pnpm.cmd seed:demo:verify`. Sau buổi ghi lại suffix/decision/issue đã dùng. Không tự sửa trực tiếp MongoDB để “đưa trạng thái về”; dùng suffix tiếp theo hoặc reset toàn bộ demo seed.

## 6. Nguồn ảnh và attribution

Seed lưu attribution trong manifest code và tên Asset. Khi trình chiếu công khai, giữ credit ở màn hình asset/credits.

| Slug                        | Tác phẩm / tác giả                               | License       | Nguồn                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mangaka-live-drawing`      | Acky Bright live drawing / Yasumanta             | CC0 1.0       | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Meta_Its_your_world_live_drawing_001_s.jpg)                                                                                                                                                                                                                |
| `rough-drafting`            | Rough drafting / らいみぃ                        | CC BY 3.0     | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Drafting_of_anime_illustrations.webp)                                                                                                                                                                                                                      |
| `finished-line-art`         | Finished line drawing / らいみぃ                 | CC BY 3.0     | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Line_drawing_of_an_anime_illustration.webp)                                                                                                                                                                                                                |
| `manga-page-1..4`           | Go Go! Encyclopedia Girls / Kasuga               | CC BY-SA 3.0  | [Page 1](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1.jpg), [Page 2](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page2.jpg), [Page 3](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page3.jpg), [Page 4](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page4.jpg) |
| `cleaned-lettering-page`    | Cleaned manga page / Kasuga, Opencooper          | CC BY-SA 3.0  | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1_-_waifu2x_-_cleaned.png)                                                                                                                                                                                                            |
| `scanlated-page`            | English-lettered manga page / Kasuga, Opencooper | CC BY-SA 3.0  | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1_-_waifu2x_-_scanlated_English.png)                                                                                                                                                                                                  |
| `three-production-versions` | Original/cleaned/translated panel / Okitan       | CC BY-SA 4.0  | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Three_versions.png)                                                                                                                                                                                                                                        |
| `hokusai-sketchbook`        | Hokusai Manga / Katsushika Hokusai, The Met      | Public Domain | [The Metropolitan Museum of Art](https://www.metmuseum.org/art/collection/search/78791)                                                                                                                                                                                                                                |

Không thay bằng URL hotlink trong record nghiệp vụ. Seed luôn mirror file gốc vào R2 để demo ổn định, còn URL nguồn chỉ dùng cho attribution và audit license.

## 7. Xử lý sự cố

- `Found ... demo accounts`: dữ liệu đã tồn tại; verify trước, hoặc backup rồi dùng reset có khóa.
- `Production seed is locked`: thiếu xác nhận `DEMO_SEED_ALLOW_PRODUCTION=YES`.
- `Missing R2 media objects`: kiểm tra bucket/prefix/quyền và outbound HTTPS; không bỏ qua trên production.
- Download trả sai MIME/kích thước: seed chủ động dừng. Kiểm tra source page và cập nhật manifest có attribution, không chèn placeholder.
- Seed lỗi giữa chừng: lưu log, backup nếu cần điều tra, rồi reset demo-owned records và seed lại.
- Verify DB pass nhưng UI không thấy: kiểm tra access token/role/filter; title luôn bắt đầu bằng `[DEMO ...]`.
