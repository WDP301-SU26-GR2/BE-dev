<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

---

## Dành cho FE devs — Chạy bằng Docker

> Không cần cài Node, pnpm hay MongoDB lên máy. Chỉ cần Docker Desktop.
> MongoDB và NestJS chạy **trong cùng 1 container**, 1 lệnh duy nhất.

### Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- 1 cổng còn trống (mặc định `3000`, đổi được qua `.env`)

### Các bước

```bash
# 1. Clone về
git clone <repo-url>
cd BE-dev

# 2. Tạo file .env từ template, điền các giá trị thật
cp .env.example .env        # macOS / Linux
# copy .env.example .env   # Windows PowerShell

# 3. Build image và khởi động (lần đầu ~5-7 phút do cài MongoDB)
docker compose up --build

# Các lần sau (image đã build rồi, không cần --build)
docker compose up
```

Khi thấy log `Nest application successfully started`, API đã sẵn sàng.

### Endpoints

> Thay `3000` bằng `PORT` bạn đặt trong `.env` nếu đã đổi.

| Địa chỉ | Mô tả |
| --- | --- |
| <http://localhost:3000> | API base URL |
| <http://localhost:3000/api> | Swagger UI — danh sách toàn bộ API |

### Điền .env như thế nào

Mở file `.env` vừa tạo, điền các giá trị:

```env
# Đổi PORT nếu bị xung đột với FE dev server (vd: 3001, 4000, 8080)
PORT=3000
SALT_OR_ROUNDS=10

# DATABASE_URL không cần đúng — docker-compose.yml tự override
DATABASE_URL=MONGODB_URL_example

ACCESS_TOKEN_SECRET=<chuỗi bất kỳ, vd: my_secret_123>
REFRESH_TOKEN_SECRET=<chuỗi bất kỳ, vd: my_refresh_456>
ACCESS_TOKEN_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d

API_KEY=<chuỗi bất kỳ>
AUTH_TYPE_KEY=authType

ADMIN_NAME=Admin
ADMIN_PASSWORD=admin@123
ADMIN_EMAIL=admin@example.com
ADMIN_PHONE=0900000000

OTP_EXPIRES_IN=5m
```

### Lệnh hữu ích khác

```bash
# Xem log realtime
docker compose logs -f app

# Dừng (giữ DB)
docker compose down

# Dừng và xoá toàn bộ data DB
docker compose down -v

# Pull code mới + restart (watch mode tự reload file thay đổi)
git pull
docker compose restart app

# Rebuild image (khi thêm package mới vào package.json)
docker compose up --build
```

### Connect MongoDB bằng Compass (tuỳ chọn)

Mặc định `docker-compose.yml` **không expose** cổng MongoDB ra host. Nếu muốn dùng Compass, thêm port mapping sau vào service `app`:

    ports:
      - "27017:27017"

Sau đó dùng connection string:

    mongodb://localhost:27017/?replicaSet=rs0&directConnection=true

### Troubleshooting

**BE crash — log báo "Lỗi cấu hình env"**
→ Thiếu hoặc sai kiểu trong `.env`. `PORT` và `SALT_OR_ROUNDS` phải là số nguyên.

**`MongoServerSelectionError`**
→ MongoDB trong container chưa lên kịp. Đợi vài giây rồi `docker compose restart app`.

**Port bị chiếm (address already in use)**
→ Đổi `PORT` trong `.env` sang số khác (vd: `4000`), sau đó `docker compose up --build`.

---

## Dành cho BE devs — Chạy trực tiếp

### Yêu cầu (BE devs)

- Node.js 22+, pnpm 10+
- MongoDB đang chạy (local hoặc Atlas)

### Project setup

```bash
pnpm install
pnpm prisma generate   # bắt buộc sau khi clone hoặc mỗi khi schema.prisma thay đổi
```

> Bỏ qua `prisma generate` → TypeScript báo lỗi `Module '@prisma/client' has no exported member 'PrismaClient'`.

### Compile and run the project

```bash
# development
$ pnpm start

# watch mode
$ pnpm start:dev

# production mode
$ pnpm start:prod
```

### Swagger

Sau khi server chạy, mở trình duyệt vào <http://localhost:3000/api>

### Prisma commands hay dùng

```bash
pnpm prisma generate      # tái tạo Prisma Client sau khi sửa schema
pnpm prisma db push       # áp dụng schema mới lên DB (tạo/cập nhật index)
pnpm prisma studio        # GUI quản lý data
```

### Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

---

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
