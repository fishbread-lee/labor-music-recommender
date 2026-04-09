export default async function handler(req, res) {
  // GET 요청만 허용
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q, order = 'relevance' } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }

  const VALID_ORDERS = ['relevance', 'rating', 'viewCount', 'date'];
  const safeOrder = VALID_ORDERS.includes(order) ? order : 'relevance';

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('order', safeOrder);
  url.searchParams.set('relevanceLanguage', 'ko');
  url.searchParams.set('q', q);
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY);

  let ytRes, data;
  try {
    ytRes = await fetch(url.toString());
    data = await ytRes.json();
  } catch {
    return res.status(502).json({ error: 'YouTube API unreachable' });
  }

  if (!ytRes.ok) {
    return res.status(ytRes.status).json({ error: data?.error?.message || 'YouTube API error' });
  }

  res.status(200).json(data);
}
