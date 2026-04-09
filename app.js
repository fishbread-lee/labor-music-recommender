
const INTENSITY_LABELS = { 1: '낮음', 2: '보통', 3: '높음' };

const QUERY_MAP = {
  1: '신나는 노래 가사 빠른 비트',   // 낮음: 신나고 가사 있는 노래
  2: '인기 노래 감성',               // 보통: 평범한 일반 노래
  3: '가사없는 집중 음악 instrumental', // 높음: 가사 없는 집중 음악
};

const GENRE_KEYWORDS = {
  lofi:      'lofi 감성',
  jazz:      '재즈 보사노바',
  classical: '클래식 음악',
  synth:     '신스팝 일렉트로닉',
  game:      '게임 OST 애니 OST',
  kindic:    '한국 인디 음악',
  citypop:   '시티팝',
  hiphop:    '힙합 R&B',
  kpop:      '케이팝 kpop',
  jpop:      '제이팝 jpop',
  rock:      '밴드 락 rock',
};

/** 오늘 날짜를 숫자 시드로 반환 (매일 다른 셔플) */
function getDaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** 시드 기반 결정적 셔플 (같은 날 = 같은 순서) */
function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 업무 입력을 YouTube 검색 쿼리 문자열로 변환한다.
 * @param {number} intensity  1|2|3
 * @param {string|null} genre GENRE_KEYWORDS 키
 * @param {string} memo       자유 텍스트 (선택)
 * @returns {string}
 */
function buildQuery(intensity, genre, memo) {
  const base = QUERY_MAP[intensity];
  if (!base) throw new RangeError(`Invalid intensity "${intensity}"`);
  const genrePart = genre ? (GENRE_KEYWORDS[genre] ?? '') : '';
  const memoPart = (memo ?? '').trim().slice(0, 30);
  const exclude = '-playlist -compilation -"1 hour" -"2 hour"';
  return [genrePart, base, memoPart, exclude].filter(s => s.length > 0).join(' ');
}

/**
 * YouTube Data API v3 search.list 호출.
 * @param {string} query
 * @returns {Promise<object[]>} snippet 포함 items 배열
 */
async function fetchRecommendations(query) {
  const orders = ['relevance', 'rating', 'viewCount'];
  const order = orders[Math.floor(Math.random() * orders.length)];

  const url = new URL('/api/search', location.origin);
  url.searchParams.set('q', query);
  url.searchParams.set('order', order);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
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
let selectedGenre = null;
let cachedItems = [];

// ── 초기화 ──
document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('intensity');
  const intensityLabel = document.getElementById('intensity-label');
  const genreGrid = document.getElementById('genres');
  const recommendBtn = document.getElementById('recommend-btn');
  const resultsSection = document.getElementById('results-section');
  const loadingMsg = document.getElementById('loading-msg');
  const errorMsg = document.getElementById('error-msg');
  const shuffleBtn = document.getElementById('shuffle-btn');

  // 슬라이더: 강도 레이블 업데이트
  slider.addEventListener('input', () => {
    intensityLabel.textContent = INTENSITY_LABELS[slider.value];
  });

  // 장르 뱃지 단일 선택
  genreGrid.addEventListener('click', e => {
    const badge = e.target.closest('.genre-badge');
    if (!badge) return;
    const genre = badge.dataset.genre;
    if (selectedGenre === genre) {
      // 같은 장르 다시 클릭 → 선택 해제
      badge.classList.remove('active');
      selectedGenre = null;
    } else {
      genreGrid.querySelectorAll('.genre-badge').forEach(b => b.classList.remove('active'));
      badge.classList.add('active');
      selectedGenre = genre;
    }
  });

  // 추천받기 버튼
  recommendBtn.addEventListener('click', async () => {
const intensity = parseInt(slider.value, 10);
    const memo = document.getElementById('memo').value;

    savePrefs({ intensity, genre: selectedGenre });

    const query = buildQuery(intensity, selectedGenre, memo);

    // UI 초기화
    resultsSection.classList.remove('hidden');
    loadingMsg.hidden = false;
    errorMsg.hidden = true;
    document.getElementById('results-grid').innerHTML = '';
    recommendBtn.disabled = true;

    try {
      cachedItems = await fetchRecommendations(query);
      renderResults(seededShuffle(cachedItems, getDaySeed()).slice(0, 5));
    } catch (err) {
      showError('API 오류가 발생했어요. API 키와 인터넷 연결을 확인해주세요.');
      console.error(err);
    } finally {
      loadingMsg.hidden = true;
      recommendBtn.disabled = false;
      resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // 새로고침 버튼 — 캐시된 풀에서 다시 셔플
  shuffleBtn.addEventListener('click', () => {
    if (cachedItems.length === 0) return;
    errorMsg.hidden = true;
    renderResults([...cachedItems].sort(() => Math.random() - 0.5).slice(0, 5));
  });

  // 취향 복원
  const prefs = loadPrefs();
  if (prefs) {
    if (prefs.intensity) {
      slider.value = prefs.intensity;
      intensityLabel.textContent = INTENSITY_LABELS[prefs.intensity];
    }
    if (prefs.genre) {
      const badge = genreGrid.querySelector(`.genre-badge[data-genre="${prefs.genre}"]`);
      if (badge) badge.classList.add('active');
      selectedGenre = prefs.genre;
    }
  }
});
