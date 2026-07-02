# Mangaka Backend (BE)

Backend cho **Hệ thống Quản lý Sáng tác & Xuất bản Manga** — NestJS 11 + Prisma 6 (MongoDB) + Redis/BullMQ +
Cloudflare R2 + AI segmentation service (Python, tùy chọn).

> **Trước khi code**, đọc [`ARCHITECTURE.md`](./ARCHITECTURE.md) (kiến trúc, data flow) và [`AGENTS.md`](./AGENTS.md)
> (rule, layer, error handling, checklist). Đây là single source of truth cho quy ước dự án.

---

## 1. Yêu cầu môi trường

| Thành phần | Version | Ghi chú |
|-----------|---------|---------|
| Node.js | 22+ | LTS |
| pnpm | 10+ | `npm i -g pnpm` |
| MongoDB | 7+ | **Bắt buộc replica set** (`rs0`) cho Prisma transactions/change streams — hoặc dùng MongoDB Atlas |
| Redis | 7+ | Hạ tầng **bắt buộc lúc boot** (rate-limit, BullMQ queue, cron lock). Thiếu Redis → app fail-fast exit |
| Python 3.11 | *(tùy chọn)* | Chỉ khi chạy **AI service** — xem [`ai-service/README.md`](./ai-service/README.md) |

> **Local Docker cho FE đã bị gỡ bỏ.** BE giờ chạy trực tiếp bằng Node/pnpm với MongoDB + Redis cài/host riêng.
> Docker chỉ còn dùng cho **CI + deploy VPS** (xem §6).

---

## 2. Cài đặt

```bash
pnpm install
pnpm prisma generate
```

Tạo `.env` từ template rồi điền giá trị thật (database, Redis, JWT, email/Resend, R2, admin seed, [AI]):

```bash
cp .env.example .env
```

> `.env.example` liệt kê **đầy đủ biến bắt buộc**. `src/core/config/envConfig.ts` validate lúc boot (Zod, fail-fast):
> thiếu/sai bất kỳ biến bắt buộc nào → `process.exit(1)`. Bảng biến đầy đủ ở `ARCHITECTURE.md` §5.

Seed Role + Super Admin (đọc `ADMIN_*` trong `.env`):

```bash
pnpm seed
```

---

## 3. Chạy BE

```bash
pnpm start:dev      # watch mode, hot reload
```

Swagger UI: **http://localhost:3000/api** (mọi response thật bọc envelope `{success,message,data}` → FE đọc `res.data`).

Các lệnh hay dùng:

```bash
pnpm prisma generate     # sau khi sửa prisma/schema.prisma
pnpm prisma db push      # đẩy schema lên Mongo (schemaless — không cần migration file)
pnpm prisma studio       # UI xem DB
pnpm start:dev           # dev
pnpm start:prod          # node dist/main (sau khi build)
pnpm build               # nest build → dist/
pnpm test                # unit test (jest)
pnpm lint                # eslint --fix
```

---

## 4. AI Segmentation Service (tùy chọn)

Service Python riêng (`ai-service/`) phân vùng trang truyện cho Epic A4 (Spec 2). BE gọi qua HTTP.
**Không bật vẫn chạy bình thường** — luồng segment tự fallback về manual.

**Bật AI (tóm tắt — chi tiết ở [`ai-service/README.md`](./ai-service/README.md)):**

1. Chạy AI service (local venv hoặc Docker) tại vd `http://localhost:8000`.
2. Trong `.env` của BE, set 2 biến (phải khớp `API_KEY` của AI service):

   ```bash
   AI_SERVICE_URL=http://localhost:8000
   AI_SERVICE_API_KEY=<khớp API_KEY của ai-service>
   # AI_HTTP_TIMEOUT_MS=120000   # optional
   ```

> ⚠️ Ràng buộc boot: nếu set `AI_SERVICE_URL` mà quên `AI_SERVICE_API_KEY` → BE fail-fast. Để **rỗng cả hai** = AI tắt.

---

## 5. Cấu trúc thư mục (rút gọn)

```
BE-dev/
├── src/                  # NestJS (feature modules + core + infrastructure) — xem ARCHITECTURE.md §2
├── prisma/schema.prisma  # DB schema (MongoDB)
├── ai-service/           # Python FastAPI AI service (tùy chọn, profile `ai`)
├── scripts/              # smoke/dev script local (gitignored — KHÔNG commit, KHÔNG build)
├── test/                 # e2e
├── Dockerfile            # Production build (multi-stage)
├── docker-compose.prod.yml
└── .github/workflows/    # ci.yml + deploy.yml
```

---

## 6. Build & Production (Docker)

Local Docker (Mongo + BE all-in-one cho FE) **đã gỡ**. Production dùng:

- **`Dockerfile`** — multi-stage build (base → build → prod-deps → runtime), chạy `node dist/main.js` bằng user non-root.
- **`docker-compose.prod.yml`** — stack VPS: `redis` + `api` + `caddy` (+ `ai-service` sau profile `ai`).
- **`.github/workflows/ci.yml`** — verify build Docker image mỗi push/PR.
- **`.github/workflows/deploy.yml`** — deploy lên VPS.

```bash
# Chạy stack prod (không AI)
docker compose -f docker-compose.prod.yml up -d

# Bật kèm AI service (nặng RAM — chỉ khi cần)
docker compose -f docker-compose.prod.yml --profile ai up -d
```

> `api` không expose port ra ngoài — đi qua `caddy` (reverse proxy TLS). `PORT`/secrets nạp từ `.env` gốc + biến compose.

---

## 7. Quy ước quan trọng (nhắc nhanh — đầy đủ ở AGENTS.md)

- **Không auto-commit** — mỗi commit = 1 logical change, build xanh. Người dùng tự commit.
- Response envelope `{success,message,data}`; lỗi validation = **422**; message tùy biến phải nằm trong DTO (`MessageResDto`).
- State machine single-writer; message text tập trung ở `<module>.messages.ts`; exception const-instance ở `errors/`.
- Gotchas Mongo/Prisma/Redis/R2 → **đọc AGENTS.md §10** trước khi đụng repo/query.
