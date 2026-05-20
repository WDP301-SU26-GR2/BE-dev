import { NotFoundException } from '@nestjs/common';
import { MangasService } from './mangas.service';

describe('MangasService', () => {
  const prismaMock = {
    manga: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const service = new MangasService(prismaMock as never);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws not found for invalid mongo id format', async () => {
    await expect(service.findOne('bad-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('applies default empty tags on create', async () => {
    prismaMock.manga.create.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
    });

    await service.create({ title: 'X', authorName: 'Y' });

    expect(prismaMock.manga.create).toHaveBeenCalledWith({
      data: {
        title: 'X',
        authorName: 'Y',
        tags: [],
      },
    });
  });
});
