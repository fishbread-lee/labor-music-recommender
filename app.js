
const INTENSITY_LABELS = { 1: '낮음', 2: '보통', 3: '높음' };

const QUERY_MAP = {
  1: '#플리 #플레이리스트 #노래추천',          // 낮음: 제한 없음
  2: '노동요 #플리 #플레이리스트 #노래추천',   // 보통: 살짝 노동요 방향
  3: '노동요 집중 #플리 #플레이리스트 #노래추천', // 높음: 집중 힌트만
};

const GENRE_KEYWORDS = {
  lofi:      'lofi chill',
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
  const hashtags = '#플리 #플레이리스트 #노래추천';
  const memoPart = (memo ?? '').trim().slice(0, 30);
  const exclude = '-shorts -"1 hour loop" -"2 hour loop"';
  if (genre) {
    return [genrePart, hashtags, memoPart, exclude].filter(s => s.length > 0).join(' ');
  }
  return [base, memoPart, exclude].filter(s => s.length > 0).join(' ');
}

/**
 * YouTube Data API v3 search.list 호출.
 * @param {string} query
 * @returns {Promise<object[]>} snippet 포함 items 배열
 */
async function fetchRecommendations(query) {
  const orders = ['rating', 'viewCount'];
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
 * 전광판 두 트랙의 텍스트를 동일하게 업데이트한다.
 */
function updateMarquee() {
  const text = marqueeMessages.length > 0
    ? marqueeMessages.join('  ✦  ')
    : '🎵 DJ BOARD — 메시지를 남겨보세요';
  const t1 = document.getElementById('marquee-track-1');
  const t2 = document.getElementById('marquee-track-2');
  if (t1) t1.textContent = text;
  if (t2) t2.textContent = text;
}

/**
 * Supabase에서 최근 메시지 50개를 가져와 전광판을 초기화한다.
 */
async function loadMessages() {
  const { data, error } = await supabaseClient
    .from('messages')
    .select('content')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { console.error('loadMessages error:', error); return; }
  marqueeMessages = (data || []).map(m => m.content).reverse();
  updateMarquee();
}

/**
 * Supabase Realtime INSERT 이벤트를 구독해 전광판을 실시간 업데이트한다.
 */
function subscribeMessages() {
  supabaseClient
    .channel('public:messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      payload => {
        marqueeMessages.push(payload.new.content);
        if (marqueeMessages.length > 50) marqueeMessages.shift();
        updateMarquee();
      }
    )
    .subscribe();
}

/**
 * /api/config에서 Supabase 크리덴셜을 가져와 클라이언트를 초기화한다.
 */
async function initSupabase() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) {
      disableDjInput();
      return;
    }
    const { supabaseUrl, supabaseAnonKey } = await res.json();
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    await loadMessages();
    subscribeMessages();
  } catch (err) {
    console.error('Supabase init failed:', err);
    disableDjInput();
  }
}

function disableDjInput() {
  const btn = document.getElementById('dj-send-btn');
  const input = document.getElementById('dj-input');
  if (btn) { btn.disabled = true; btn.textContent = '연결 안됨'; }
  if (input) { input.disabled = true; input.placeholder = '전광판을 사용할 수 없어요'; }
}

/**
 * 메시지를 Supabase messages 테이블에 저장한다.
 * @param {string} content
 */
async function sendMessage(content) {
  if (!supabaseClient || !content.trim()) return;
  const { error } = await supabaseClient
    .from('messages')
    .insert({ content: content.trim() });
  if (error) console.error('sendMessage error:', error);
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
 * @returns {{ intensity: number, genre: string | null } | null}
 */
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Supabase ──
let supabaseClient = null;
let marqueeMessages = [];

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

  // DJ 전광판 메시지 전송
  const djInput = document.getElementById('dj-input');
  const djSendBtn = document.getElementById('dj-send-btn');

  if (djSendBtn) {
    djSendBtn.addEventListener('click', async () => {
      const content = djInput.value.trim();
      if (!content) return;
      djSendBtn.disabled = true;
      await sendMessage(content);
      djInput.value = '';
      djSendBtn.disabled = false;
      djInput.focus();
    });

    djInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') djSendBtn.click();
    });
  }

  // Supabase 초기화 (전광판 활성화)
  initSupabase();
});
