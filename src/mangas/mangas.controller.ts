import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MangasService } from './mangas.service';
import { CreateMangaDto } from './dto/create-manga.dto';
import { UpdateMangaDto } from './dto/update-manga.dto';

@ApiTags('mangas')
@Controller('mangas')
export class MangasController {
  constructor(private readonly mangasService: MangasService) {}

  @Post()
  @ApiOperation({ summary: 'Create a manga workflow record' })
  @ApiCreatedResponse({ description: 'Manga record created successfully' })
  create(@Body() createMangaDto: CreateMangaDto) {
    return this.mangasService.create(createMangaDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all manga workflow records' })
  findAll() {
    return this.mangasService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a manga workflow record by id' })
  findOne(@Param('id') id: string) {
    return this.mangasService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a manga workflow record' })
  update(@Param('id') id: string, @Body() updateMangaDto: UpdateMangaDto) {
    return this.mangasService.update(id, updateMangaDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a manga workflow record' })
  remove(@Param('id') id: string) {
    return this.mangasService.remove(id);
  }
}
