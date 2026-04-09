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
  const safeVideoId = String(videoId).replace(/[^a-zA-Z0-9_-]/g, '');
  const href = `https://www.youtube.com/watch?v=${safeVideoId}`;

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

const PREFS_KEY = 'ndr_prefs';

/**
 * 취향을 localStorage에 저장한다.
 * @param {{ intensity: number, workType: string, genres: string[] }} prefs
 */
function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/**
 * localStorage에서 취향을 복원한다.
 * @returns {{ intensity: number, workType: string, genres: string[] } | null}
 */
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── 상태 ──
let selectedWorkType = 'focus';
let selectedGenres = [];

// ── 초기화 ──
document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('intensity');
  const intensityLabel = document.getElementById('intensity-label');
  const workTypeGroup = document.getElementById('work-type');
  const genreGrid = document.getElementById('genres');
  const recommendBtn = document.getElementById('recommend-btn');
  const resultsSection = document.getElementById('results-section');
  const loadingMsg = document.getElementById('loading-msg');
  const errorMsg = document.getElementById('error-msg');

  // 슬라이더: 강도 레이블 업데이트
  slider.addEventListener('input', () => {
    intensityLabel.textContent = INTENSITY_LABELS[slider.value];
  });

  // 업무 종류 토글
  workTypeGroup.addEventListener('click', e => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    workTypeGroup.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedWorkType = btn.dataset.value;
  });

  // 장르 뱃지 멀티 선택
  genreGrid.addEventListener('click', e => {
    const badge = e.target.closest('.genre-badge');
    if (!badge) return;
    badge.classList.toggle('active');
    const genre = badge.dataset.genre;
    if (selectedGenres.includes(genre)) {
      selectedGenres = selectedGenres.filter(g => g !== genre);
    } else {
      selectedGenres.push(genre);
    }
  });

  // 추천받기 버튼
  recommendBtn.addEventListener('click', async () => {
    if (YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE') {
      showError('API 키가 설정되지 않았어요. app.js의 YOUTUBE_API_KEY를 입력해주세요.');
      resultsSection.classList.remove('hidden');
      return;
    }
    const intensity = parseInt(slider.value, 10);
    const memo = document.getElementById('memo').value;

    savePrefs({ intensity, workType: selectedWorkType, genres: selectedGenres });

    const query = buildQuery(intensity, selectedWorkType, selectedGenres, memo);

    // UI 초기화
    resultsSection.classList.remove('hidden');
    loadingMsg.hidden = false;
    errorMsg.hidden = true;
    document.getElementById('results-grid').innerHTML = '';
    recommendBtn.disabled = true;

    try {
      const items = await fetchRecommendations(query);
      renderResults(items);
    } catch (err) {
      showError('API 오류가 발생했어요. API 키와 인터넷 연결을 확인해주세요.');
      console.error(err);
    } finally {
      loadingMsg.hidden = true;
      recommendBtn.disabled = false;
      resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // 취향 복원
  const prefs = loadPrefs();
  if (prefs) {
    if (prefs.intensity) {
      slider.value = prefs.intensity;
      intensityLabel.textContent = INTENSITY_LABELS[prefs.intensity];
    }
    if (prefs.workType) {
      workTypeGroup.querySelectorAll('.toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === prefs.workType);
      });
      selectedWorkType = prefs.workType;
    }
    if (Array.isArray(prefs.genres)) {
      prefs.genres.forEach(g => {
        const badge = genreGrid.querySelector(`.genre-badge[data-genre="${g}"]`);
        if (badge) badge.classList.add('active');
      });
      selectedGenres = prefs.genres;
    }
  }
});
