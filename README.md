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
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
$ pnpm prisma generate   # sinh Prisma Client từ schema.prisma — bắt buộc chạy ít nhất 1 lần sau khi clone, hoặc mỗi khi schema thay đổi
```

> Nếu bỏ qua `prisma generate`, TypeScript sẽ báo `Module '@prisma/client' has no exported member 'PrismaClient'` và các method `$connect`/`$disconnect` không tồn tại.

## Compile and run the project

```bash
# development
$ pnpm start

# watch mode
$ pnpm start:dev

# production mode
$ pnpm start:prod
```

## Chạy bằng Docker (khuyến nghị khi setup ở máy local mới)

Cách này sẽ bật cả **BE (NestJS)** lẫn **MongoDB** chỉ với một lệnh — không cần cài Node, pnpm hay Mongo lên máy.

### Yêu cầu

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (đã bao gồm `docker compose`).
- Cổng `3000` (API) và `27017` (Mongo) còn trống trên máy.

### Các bước

1. Clone repo và vào thư mục project:

   ```bash
   git clone <repo-url>
   cd BE-dev
   ```

2. Tạo file `.env` từ template rồi điền secret thật:

   ```bash
   # Windows (PowerShell)
   copy .env.example .env

   # macOS / Linux
   cp .env.example .env
   ```

   Mở `.env` lên và điền các giá trị thật cho:
   - `PORT` (vd: `3000`)
   - `SALT_OR_ROUNDS` (vd: `10`)
   - `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`
   - `API_KEY`, `AUTH_TYPE_KEY`
   - `ADMIN_NAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PHONE`

   > `DATABASE_URL` trong `.env` **không cần đụng đến** — `docker-compose.yml` đã override sẵn để trỏ vào service `mongo` trong network của compose.

3. Build & chạy stack:

   ```bash
   docker compose up -d --build
   ```

   - BE sẽ chạy tại: <http://localhost:3000>
   - MongoDB lắng nghe ở: `localhost:27017`

4. Xem log nếu cần debug:

   ```bash
   docker compose logs -f api    # log của BE
   docker compose logs -f mongo  # log của Mongo
   ```

5. Dừng stack:

   ```bash
   docker compose down           # giữ lại dữ liệu trong volume `mongo-data`
   docker compose down -v        # xoá luôn dữ liệu Mongo (reset DB)
   ```

### Các tác vụ Prisma trong container

```bash
# Push schema lên Mongo
docker compose exec api pnpm prisma db push

# Mở Prisma Studio (cần map thêm port nếu muốn truy cập từ host)
docker compose exec api pnpm prisma studio
```

### Connect Mongo từ máy host (vd: bằng Compass)

Connection string:

```text
mongodb://localhost:27017/?replicaSet=rs0&directConnection=true
```

> Prisma + MongoDB yêu cầu **replica set** — `docker-compose.yml` đã cấu hình replica set 1 node (`rs0`) và auto khởi tạo qua healthcheck, không cần làm tay.

### Troubleshooting

- **BE exit ngay khi start**: thường do thiếu biến trong `.env`. Check `docker compose logs api` xem Zod báo field nào.
- **`Server selection timeout`**: đợi vài giây cho Mongo healthcheck init xong replica set rồi BE sẽ tự retry connect, hoặc `docker compose restart api`.
- **Sửa code mà container không cập nhật**: image đang build production. Để dev mode (hot reload) thì chạy `pnpm start:dev` ở host và chỉ dùng compose để bật Mongo: `docker compose up -d mongo`, rồi đổi `DATABASE_URL` trong `.env` thành `mongodb://localhost:27017/Mangaka?replicaSet=rs0&directConnection=true`.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

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
