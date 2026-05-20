import { Injectable, NotFoundException } from '@nestjs/common';
import { Manga } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMangaDto } from './dto/create-manga.dto';
import { UpdateMangaDto } from './dto/update-manga.dto';

@Injectable()
export class MangasService {
  constructor(private readonly prisma: PrismaService) {}

  create(createMangaDto: CreateMangaDto): Promise<Manga> {
    return this.prisma.manga.create({
      data: {
        ...createMangaDto,
        tags: createMangaDto.tags ?? [],
      },
    });
  }

  findAll(): Promise<Manga[]> {
    return this.prisma.manga.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Manga> {
    this.assertObjectId(id);

    const manga = await this.prisma.manga.findUnique({ where: { id } });
    if (!manga) {
      throw new NotFoundException(`Manga with id '${id}' was not found`);
    }

    return manga;
  }

  async update(id: string, updateMangaDto: UpdateMangaDto): Promise<Manga> {
    await this.findOne(id);

    return this.prisma.manga.update({
      where: { id },
      data: updateMangaDto,
    });
  }

  async remove(id: string): Promise<Manga> {
    await this.findOne(id);
    return this.prisma.manga.delete({ where: { id } });
  }

  private assertObjectId(id: string): void {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      throw new NotFoundException(`Manga with id '${id}' was not found`);
    }
  }
}
