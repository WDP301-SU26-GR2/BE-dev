import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getOverview() {
    return {
      name: 'Manga Composition & Publishing API',
      stack: ['NestJS', 'Prisma', 'MongoDB'],
      docs: '/docs',
    };
  }
}
