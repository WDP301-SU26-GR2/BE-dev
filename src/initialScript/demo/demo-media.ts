export type DemoMediaPurpose =
  | 'MANGAKA_REFERENCE'
  | 'ROUGH_DRAFT'
  | 'LINE_ART'
  | 'MANGA_PAGE'
  | 'TASK_RESULT'
  | 'BACKGROUND_REFERENCE'
  | 'COVER'

export interface DemoMediaSource {
  slug: string
  fileName: string
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
  purpose: DemoMediaPurpose
  title: string
  author: string
  license: string
  licenseUrl: string
  sourcePage: string
  downloadUrl?: string
}

export const DEMO_MEDIA_PREFIX = 'demo-seed/v1'

// All files are real works hosted by Wikimedia Commons. The seed downloads the
// original file and mirrors it into the configured private R2 bucket. Keep the
// attribution fields in sync with docs/DEMO-SEED-GUIDE.md.
export const DEMO_MEDIA: readonly DemoMediaSource[] = [
  {
    slug: 'mangaka-live-drawing',
    fileName: 'Meta_Its_your_world_live_drawing_001_s.jpg',
    contentType: 'image/jpeg',
    purpose: 'MANGAKA_REFERENCE',
    title: 'Acky Bright performing a live manga drawing',
    author: 'Yasumanta',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Meta_Its_your_world_live_drawing_001_s.jpg'
  },
  {
    slug: 'rough-drafting',
    fileName: 'Drafting_of_anime_illustrations.webp',
    contentType: 'image/webp',
    purpose: 'ROUGH_DRAFT',
    title: 'Rough drafting stage of an anime-style illustration',
    author: 'らいみぃ',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Drafting_of_anime_illustrations.webp'
  },
  {
    slug: 'finished-line-art',
    fileName: 'Line_drawing_of_an_anime_illustration.webp',
    contentType: 'image/webp',
    purpose: 'LINE_ART',
    title: 'Finished line drawing of the same anime-style illustration',
    author: 'らいみぃ',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Line_drawing_of_an_anime_illustration.webp'
  },
  {
    slug: 'manga-page-1',
    fileName: 'Wikipe-tan_manga_page1.jpg',
    contentType: 'image/jpeg',
    purpose: 'MANGA_PAGE',
    title: 'Go Go! Encyclopedia Girls — page 1',
    author: 'Kasuga',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1.jpg'
  },
  {
    slug: 'manga-page-2',
    fileName: 'Wikipe-tan_manga_page2.jpg',
    contentType: 'image/jpeg',
    purpose: 'MANGA_PAGE',
    title: 'Go Go! Encyclopedia Girls — page 2',
    author: 'Kasuga',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page2.jpg'
  },
  {
    slug: 'manga-page-3',
    fileName: 'Wikipe-tan_manga_page3.jpg',
    contentType: 'image/jpeg',
    purpose: 'MANGA_PAGE',
    title: 'Go Go! Encyclopedia Girls — page 3',
    author: 'Kasuga',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page3.jpg'
  },
  {
    slug: 'manga-page-4',
    fileName: 'Wikipe-tan_manga_page4.jpg',
    contentType: 'image/jpeg',
    purpose: 'MANGA_PAGE',
    title: 'Go Go! Encyclopedia Girls — page 4',
    author: 'Kasuga',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page4.jpg'
  },
  {
    slug: 'cleaned-lettering-page',
    fileName: 'Wikipe-tan_manga_page1_-_waifu2x_-_cleaned.png',
    contentType: 'image/png',
    purpose: 'TASK_RESULT',
    title: 'Cleaned manga page with text removed for lettering work',
    author: 'Kasuga; cleaned by Opencooper',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1_-_waifu2x_-_cleaned.png'
  },
  {
    slug: 'scanlated-page',
    fileName: 'Wikipe-tan_manga_page1_-_waifu2x_-_scanlated_English.png',
    contentType: 'image/png',
    purpose: 'TASK_RESULT',
    title: 'English-lettered manga page',
    author: 'Kasuga; scanlation by Opencooper',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Wikipe-tan_manga_page1_-_waifu2x_-_scanlated_English.png'
  },
  {
    slug: 'three-production-versions',
    fileName: 'Three_versions.png',
    contentType: 'image/png',
    purpose: 'TASK_RESULT',
    title: 'Original, cleaned, and translated versions of one manga panel',
    author: 'Okitan',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Three_versions.png'
  },
  {
    slug: 'hokusai-sketchbook',
    fileName: 'MET_2013_720_a_s_a_01.jpg',
    contentType: 'image/jpeg',
    purpose: 'BACKGROUND_REFERENCE',
    title: 'Hokusai Manga sketchbooks, volume set detail',
    author: 'Katsushika Hokusai; Metropolitan Museum of Art',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourcePage: 'https://www.metmuseum.org/art/collection/search/78791',
    downloadUrl: 'https://collectionapi.metmuseum.org/api/collection/v1/iiif/78791/1398828/main-image'
  }
] as const

export const demoMediaKey = (source: DemoMediaSource) => `${DEMO_MEDIA_PREFIX}/${source.slug}.${extension(source)}`

export const demoMediaDownloadUrl = (source: DemoMediaSource) => source.downloadUrl ?? directCommonsUrl(source.fileName)

const directCommonsUrl = (fileName: string) => {
  const normalized = fileName.replaceAll(' ', '_')
  const digest = createHash('md5').update(normalized).digest('hex')
  return `https://upload.wikimedia.org/wikipedia/commons/${digest[0]}/${digest.slice(0, 2)}/${encodeURIComponent(normalized)}`
}

const extension = (source: DemoMediaSource) => {
  if (source.contentType === 'image/png') return 'png'
  if (source.contentType === 'image/webp') return 'webp'
  return 'jpg'
}
import { createHash } from 'crypto'
