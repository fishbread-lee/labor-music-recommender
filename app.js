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
  const base = QUERY_MAP[intensity][workType];
  const genrePart = genres.map(g => GENRE_KEYWORDS[g]).filter(Boolean).join(' ');
  const memoPart = memo.trim().slice(0, 30);
  return [base, genrePart, memoPart, 'playlist'].filter(s => s.length > 0).join(' ');
}
