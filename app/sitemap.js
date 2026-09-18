const BASE_URL = "https://vceljusenicnedogaja.si";

export default function sitemap() {
  const now = new Date();

  return [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE_URL}/viri`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/en`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/en/viri`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/de`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/de/viri`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/it`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/it/viri`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
  ];
}
