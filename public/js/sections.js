// Definitions for the four content types. Keys match Supabase table names.

export const SECTION_ORDER = ['songs', 'passages', 'commentaries', 'announcements'];

export const SECTIONS = {
  songs: {
    label: '찬양',
    noun: '찬양',
    emoji: '🎵',
    empty: '아직 등록된 찬양이 없습니다.',
    bodyField: 'lyrics',
    fields: [
      { name: 'title', label: '찬양 제목', type: 'text', required: true, placeholder: '예: 주님의 사랑' },
      {
        name: 'lyrics', label: '가사', type: 'textarea', rows: 12,
        hint: '한 줄씩 입력하세요. 빈 줄을 넣으면 크게 보기에서 다음 화면으로 나뉩니다.',
      },
      {
        name: 'image_paths', label: '이미지', type: 'images',
        hint: '악보나 가사 이미지를 올릴 수 있습니다. 크게 보기에서 가사 다음에 이미지를 한 장씩 보여 줍니다.',
      },
    ],
  },
  passages: {
    label: '성경',
    noun: '성경 본문',
    emoji: '📖',
    empty: '아직 등록된 성경 본문이 없습니다.',
    bodyField: 'body',
    fields: [
      { name: 'book', label: '성경', type: 'text', required: true, list: 'bible-books', placeholder: '예: 요한복음', width: 'md' },
      { name: 'chapter', label: '장', type: 'number', min: 1, width: 'sm' },
      { name: 'verse_start', label: '시작 절', type: 'number', min: 1, width: 'sm' },
      { name: 'verse_end', label: '끝 절', type: 'number', min: 1, width: 'sm' },
      { name: 'title', label: '본문 제목', type: 'text', placeholder: '예: 하나님의 사랑' },
      {
        name: 'body', label: '본문', type: 'textarea', rows: 10,
        hint: '절마다 줄을 바꾸면 읽기 편합니다. 빈 줄을 넣으면 크게 보기에서 화면이 나뉩니다.',
      },
    ],
  },
  commentaries: {
    label: '해설',
    noun: '해설',
    emoji: '💬',
    empty: '아직 등록된 해설이 없습니다.',
    bodyField: 'body',
    fields: [
      { name: 'title', label: '제목', type: 'text', required: true, placeholder: '예: 오늘 말씀의 의미' },
      { name: 'body', label: '내용', type: 'textarea', rows: 12, hint: '빈 줄을 넣으면 문단이 나뉩니다.' },
    ],
  },
  announcements: {
    label: '광고',
    noun: '광고',
    emoji: '📢',
    empty: '아직 등록된 광고가 없습니다.',
    bodyField: 'body',
    fields: [
      { name: 'title', label: '제목', type: 'text', required: true, placeholder: '예: 다음 모임 안내' },
      { name: 'body', label: '내용', type: 'textarea', rows: 5 },
      { name: 'is_important', label: '중요한 광고로 표시하기', type: 'checkbox' },
    ],
  },
};

/** '요한복음 3장 16-18절' */
export function passageRef(p) {
  let ref = p.book || '';
  if (p.chapter) ref += ` ${p.chapter}장`;
  if (p.verse_start && p.verse_end && p.verse_end !== p.verse_start) ref += ` ${p.verse_start}-${p.verse_end}절`;
  else if (p.verse_start) ref += ` ${p.verse_start}절`;
  return ref;
}

export function itemHeading(sectionKey, item) {
  if (sectionKey === 'passages') return passageRef(item);
  return item.title;
}

/** Secondary line under the heading, if any. */
export function itemMeta(sectionKey, item) {
  if (sectionKey === 'passages') return item.title || '';
  return '';
}

export const BIBLE_BOOKS = [
  '창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기', '사무엘상', '사무엘하',
  '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더', '욥기', '시편', '잠언',
  '전도서', '아가', '이사야', '예레미야', '예레미야애가', '에스겔', '다니엘', '호세아', '요엘', '아모스',
  '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기',
  '마태복음', '마가복음', '누가복음', '요한복음', '사도행전', '로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서',
  '빌립보서', '골로새서', '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서', '디도서', '빌레몬서', '히브리서', '야고보서',
  '베드로전서', '베드로후서', '요한일서', '요한이서', '요한삼서', '유다서', '요한계시록',
];
