# Manga Composition & Publishing Backend (NestJS)

Backend API for a **Manga Composition and Publishing Workflow Management System**.

## Stack
- **NestJS**
- **Prisma ORM**
- **MongoDB**
- **Swagger** for API docs
- Optional **OpenAI** integration for storyline idea generation

## Setup
```bash
npm install
cp .env.example .env # or create .env manually
```

Set `DATABASE_URL` for MongoDB in `.env`.

## Prisma
```bash
npx prisma generate
```

## Run
```bash
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger Docs: `http://localhost:3000/docs`

## Environment variables
Create `.env` with:
```env
DATABASE_URL="mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority"
OPENAI_API_KEY="" # optional
```
