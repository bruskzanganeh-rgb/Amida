import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://amida.babalisk.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: 'https://amida.babalisk.com/signup', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://amida.babalisk.com/login', lastModified: new Date(), changeFrequency: 'yearly', priority: 0.5 },
    { url: 'https://amida.babalisk.com/privacy', lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://amida.babalisk.com/terms', lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://amida.babalisk.com/blog', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    {
      url: 'https://amida.babalisk.com/blog/freelance-musician-invoice-template',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]
}
