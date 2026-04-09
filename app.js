const YOUTUBE_API_KEY = 'YOUR_API_KEY_HERE'; // 여기에 실제 키 입력

const INTENSITY_LABELS = { 1: '낮음', 2: '보통', 3: '높음' };

const QUERY_MAP = {
  1: {
    focus: 'calm focus music',
    repeat: 'light background music',
    creative: 'chill creative music',
  },
  2: {
    focus: 'focus work music',
    repeat: 'steady background music',
    creative: 'creative flow music',
  },
  3: {
    focus: 'deep focus concentration music',
    repeat: 'energetic upbeat work music',
    creative: 'inspiring intense music',
  },
};

const GENRE_KEYWORDS = {
  lofi:      'lofi',
  jazz:      'jazz bossa nova',
  classical: 'classical',
  synth:     'synthpop electronic',
  game:      'game ost anime soundtrack',
  kindic:    'korean indie',
  citypop:   'city pop',
  hiphop:    'hip hop r&b',
  kpop:      'kpop',
  jpop:      'jpop',
  rock:      'band rock music',
};

/**
 * 업무 입력을 YouTube 검색 쿼리 문자열로 변환한다.
 * @param {number} intensity  1|2|3
 * @param {string} workType   'focus'|'repeat'|'creative'
 * @param {string[]} genres   GENRE_KEYWORDS 키 배열
 * @param {string} memo       자유 텍스트 (선택)
 * @returns {string}
 */
function buildQuery(intensity, workType, genres, memo) {
  const base = QUERY_MAP[intensity]?.[workType];
  if (!base) throw new RangeError(`Invalid intensity "${intensity}" or workType "${workType}"`);
  const genrePart = genres.map(g => GENRE_KEYWORDS[g]).filter(Boolean).join(' ');
  const memoPart = (memo ?? '').trim().slice(0, 30);
  return [base, genrePart, memoPart, 'playlist'].filter(s => s.length > 0).join(' ');
}

/**
 * YouTube Data API v3 search.list 호출.
 * @param {string} query
 * @returns {Promise<object[]>} snippet 포함 items 배열
 */
async function fetchRecommendations(query) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoCategoryId', '10');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('q', query);
  url.searchParams.set('key', YOUTUBE_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.items ?? [];
}

/**
 * HTML 특수문자를 이스케이프한다.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 검색 결과 items로 결과 그리드를 렌더링한다.
 * @param {object[]} items  YouTube API items
 */
function renderResults(items) {
  const grid = document.getElementById('results-grid');
  grid.innerHTML = '';

  if (!items || items.length === 0) {
    showError('추천 결과가 없어요. 장르를 바꿔보세요!');
    return;
  }

  const [first, ...rest] = items;
  grid.appendChild(createCard(first, true));

  const subGrid = document.createElement('div');
  subGrid.className = 'sub-grid';
  rest.forEach(item => subGrid.appendChild(createCard(item, false)));
  grid.appendChild(subGrid);
}

/**
 * 단일 영상 카드 DOM 요소를 생성한다.
 * @param {object} item       YouTube API item
 * @param {boolean} featured  true면 1위 피처드 카드
 * @returns {HTMLElement}
 */
function createCard(item, featured) {
  const videoId = item.id.videoId;
  const title = item.snippet.title ?? '';
  const thumbnails = item.snippet.thumbnails ?? {};
  const thumb = featured
    ? (thumbnails.high?.url ?? thumbnails.medium?.url ?? '')
    : (thumbnails.medium?.url ?? '');
  const href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  const card = document.createElement('div');
  card.className = featured ? 'result-card result-card--featured' : 'result-card';
  card.innerHTML = `
    <img class="card-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}" loading="lazy">
    <div class="card-body">
      <p class="card-title">${escapeHtml(title)}</p>
      <a class="card-btn" target="_blank" rel="noopener noreferrer">▶ 열기</a>
    </div>
  `;
  card.querySelector('.card-btn').setAttribute('href', href);
  return card;
}

/**
 * 에러 메시지를 표시한다.
 * @param {string} msg
 */
function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.hidden = false;
}
