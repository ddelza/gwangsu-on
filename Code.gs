// =============================================
// 2세대 광수 Online 교무실 — 백엔드
// SharedLib.gs(같은 프로젝트의 두 번째 파일)의 norm/findSheet/findColIndex/
// getSS_/respond_ 등을 그대로 사용한다. 이 파일에는 새로 정의하지 않는다.
// =============================================

// ── 스프레드시트 ID 설정 ──────────────────────────────
// 아래 세 ID는 실제 시트를 만든 뒤 채워 넣는다 (색인/학사일정/회의록을 한 시트의
// 다른 탭으로 모아도 되고, 분리해도 된다 — 여기서는 분리 구조를 기본값으로 둔다)
const SS_INDEX = '10oIqF4rHjm8UaxulhDB114PWa_B4FwuK64We8jGbtpo';
const SS_SCHEDULE = 'PUT_학사일정_FORM_RESPONSES_SPREADSHEET_ID_HERE';
const SS_MINUTES = 'PUT_회의록_FORM_RESPONSES_SPREADSHEET_ID_HERE';
const SS_STUDENT = '1bbpmbK8ittaWXQIyyjp9eBeq14p1oe5DfQgUG7sj_Tw'; // [2026]학생정보 — 학년/반/번호별 동아리·스포츠클럽·주제선택 배정 명단

// ── 웹앱 진입점 ──────────────────────────────
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  const page = e && e.parameter && e.parameter.page;

  if (!action) {
    const fileMap = {
      schedule: 'schedule',
      minutes: 'minutes',
      admin: 'admin',
      stu: 'stu',
      phone: 'phone',
    };
    const file = fileMap[page] || 'index';
    return HtmlService.createHtmlOutputFromFile(file)
      .setTitle('광수 Online 교무실')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  let data;
  try {
    if (action === 'getIndex') {
      data = getIndex();
    } else if (action === 'getCategories') {
      data = getCategories();
    } else if (action === 'getSchedule') {
      data = getSchedule(e.parameter.from || '', e.parameter.to || '');
    } else if (action === 'getMinutes') {
      data = getMinutes(e.parameter.limit ? parseInt(e.parameter.limit, 10) : 0);
    } else if (action === 'getCalendar') {
      data = getCalendar(e.parameter.sem ? parseInt(e.parameter.sem, 10) : 1);
    } else if (action === 'getStudentRoster') {
      data = getStudentRoster();
    } else if (action === 'getPhoneDirectory') {
      data = getPhoneDirectory();
    } else if (action === 'search') {
      data = searchIndex(e.parameter.q || '');
    } else {
      data = { error: 'unknown action' };
    }
  } catch (err) {
    data = { error: err.toString() };
  }

  return respond_(e, data);
}

// ── 웹앱 진입점(쓰기) ──────────────────────────────
// calender.html의 "일정/실 예약 추가" 팝업이 호출. POST 바디(JSON 문자열)로 액션을 받는다.
// text/plain Content-Type으로 보내 CORS preflight를 피하는 관행을 그대로 따른다.
function doPost(e) {
  let data;
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'addCalendarEntry') {
      data = addCalendarEntry(body.sem, body.date, body.category, body.text, body.rooms || {});
    } else if (body.action === 'setCalendarDayEntries') {
      data = setCalendarDayEntries(body.sem, body.date, body.originalKeys || [], body.entries || []);
    } else if (body.action === 'updateStudentFields') {
      data = updateStudentFields(body.changes || []);
    } else if (body.action === 'savePhoneDirectory') {
      data = savePhoneDirectory(body.entries || []);
    } else if (body.action === 'addPhoneCategory') {
      data = addPhoneCategory(body.name || '');
    } else {
      data = { error: 'unknown action' };
    }
  } catch (err) {
    data = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ── 색인(검색) ──────────────────────────────
// 탭명: 색인 / 열: 제목, 카테고리, 링크, 키워드, 설명, 담당자, 노출순서
function getIndex() {
  const ss = getSS_(SS_INDEX);
  const sheet = findSheet(ss, ['색인', 'Index', 'index']);
  if (!sheet) return { items: [], error: '색인 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { items: [] };

  const header = data[0].map(h => String(h).trim());
  const col = {
    title: findColIndex(header, ['제목', '이름', '타이틀']),
    category: findColIndex(header, ['카테고리', '분류', '구분']),
    url: findColIndex(header, ['링크', 'URL', '주소']),
    keywords: findColIndex(header, ['키워드', '태그', '검색어']),
    description: findColIndex(header, ['설명', '내용', '비고']),
    owner: findColIndex(header, ['담당자', '담당', '책임자']),
    order: findColIndex(header, ['노출순서', '순서', '우선순위']),
  };

  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const title = col.title >= 0 ? String(row[col.title] || '').trim() : '';
    if (!title) continue;
    items.push({
      title,
      category: col.category >= 0 ? String(row[col.category] || '').trim() : '',
      url: col.url >= 0 ? String(row[col.url] || '').trim() : '',
      keywords: col.keywords >= 0 ? String(row[col.keywords] || '').trim() : '',
      description: col.description >= 0 ? String(row[col.description] || '').trim() : '',
      owner: col.owner >= 0 ? String(row[col.owner] || '').trim() : '',
      order: col.order >= 0 ? Number(row[col.order]) || 0 : 0,
    });
  }

  items.sort((a, b) => {
    if (a.category !== b.category) return naturalSort(a.category, b.category);
    if (a.order !== b.order) return a.order - b.order;
    return naturalSort(a.title, b.title);
  });

  return { items };
}

function getCategories() {
  const { items } = getIndex();
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
  return { categories };
}

// ── 내선번호 ──────────────────────────────
// SS_INDEX 스프레드시트의 "내선번호" 탭 (원래 Google Slides 표였던 걸 그대로 옮겨와서
// 이제부터는 HTML(phone.html)에서만 직접 보고 고친다 — 슬라이드와는 더 이상 연동하지 않는다)
// 탭: 내선번호 / 열: 카테고리, 담당, 이름, 내선번호, 직통번호
// G1/G2 = 분류 목록 보관 칸 (G1 헤더 "카테고리목록", G2에 콤마로 구분해 저장) — 항목이 아직 하나도
// 없는 새 분류도(예: 신설 부서) 드롭다운에 남아있도록 entries의 cat 값과는 별도로 관리한다.
const PHONE_CATEGORY_CELL = 'G2';
function getPhoneCategoryList_(sheet) {
  const raw = String(sheet.getRange(PHONE_CATEGORY_CELL).getValue() || '').trim();
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function getPhoneDirectory() {
  const ss = getSS_(SS_INDEX);
  const sheet = findSheet(ss, ['내선번호']);
  if (!sheet) return { entries: [], categories: [], error: '내선번호 탭을 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { entries: [], categories: getPhoneCategoryList_(sheet) };

  const header = data[0].map(h => String(h).trim());
  const col = {
    cat: findColIndex(header, ['카테고리', '분류']),
    role: findColIndex(header, ['담당', '직책']),
    name: findColIndex(header, ['이름', '성명']),
    ext: findColIndex(header, ['내선번호', '내선']),
    direct: findColIndex(header, ['직통번호', '직통']),
  };

  const entries = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    entries.push({
      cat: col.cat >= 0 ? String(row[col.cat] || '').trim() : '',
      role: col.role >= 0 ? String(row[col.role] || '').trim() : '',
      name: col.name >= 0 ? String(row[col.name] || '').trim() : '',
      ext: col.ext >= 0 ? String(row[col.ext] || '').trim() : '',
      direct: col.direct >= 0 ? String(row[col.direct] || '').trim() : '',
    });
  }

  // 저장된 분류 목록 + 실제 항목에 쓰인 분류(혹시 목록에 빠진 게 있으면 보강) 합쳐서 반환
  const categories = getPhoneCategoryList_(sheet);
  entries.forEach(e => { if (e.cat && !categories.includes(e.cat)) categories.push(e.cat); });

  return { entries, categories };
}

// phone.html 수정모드의 "수정 완료" 한 번에 전체 목록을 통째로 받아 덮어쓴다.
// 행 수가 적어(40여 행) 부분 업데이트 대신 전체 재기록이 더 간단하고 안전하다(행 추가/삭제도 자동 반영됨).
function savePhoneDirectory(entries) {
  const ss = getSS_(SS_INDEX);
  const sheet = findSheet(ss, ['내선번호']);
  if (!sheet) return { error: '내선번호 탭을 찾을 수 없습니다.' };

  const rows = (entries || []).map(e => [
    String(e.cat || '').trim(),
    String(e.role || '').trim(),
    String(e.name || '').trim(),
    String(e.ext || '').trim(),
    String(e.direct || '').trim(),
  ]);

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 5).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, 5).setValues(rows);

  return { success: true, count: rows.length };
}

// phone.html 상단 "+" 버튼 — 분류 하나를 즉시 목록에 추가한다(항목 저장과 별개, 바로 반영됨).
function addPhoneCategory(name) {
  name = String(name || '').trim();
  if (!name) return { error: '분류 이름이 비어 있습니다.' };

  const ss = getSS_(SS_INDEX);
  const sheet = findSheet(ss, ['내선번호']);
  if (!sheet) return { error: '내선번호 탭을 찾을 수 없습니다.' };

  const categories = getPhoneCategoryList_(sheet);
  if (!categories.includes(name)) categories.push(name);
  sheet.getRange('G1').setValue('카테고리목록');
  sheet.getRange(PHONE_CATEGORY_CELL).setValue(categories.join(','));

  return { success: true, categories };
}

// 서버측 검색 폴백 (기본 경로는 클라이언트 fuzzySearch — 비-JS 클라이언트/외부 연동용)
function searchIndex(q) {
  const { items } = getIndex();
  if (!q) return { results: items };
  const nq = norm(q);
  const results = items.filter(it =>
    norm(it.title).includes(nq) ||
    norm(it.keywords).includes(nq) ||
    norm(it.description).includes(nq)
  );
  return { results };
}

// ── 학사일정 ──────────────────────────────
// Google Form 응답 시트 그대로 사용: 타임스탬프, 행사명, 시작일, 종료일, 대상, 비고
function getSchedule(from, to) {
  const ss = getSS_(SS_SCHEDULE);
  const sheet = findSheet(ss, ['설문지 응답 시트1', 'Form Responses 1', '응답', '학사일정']);
  if (!sheet) return { events: [], error: '학사일정 응답 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { events: [] };

  const header = data[0].map(h => String(h).trim());
  const col = {
    title: findColIndex(header, ['행사명', '제목', '일정명']),
    start: findColIndex(header, ['시작일', '날짜', '일시']),
    end: findColIndex(header, ['종료일']),
    audience: findColIndex(header, ['대상']),
    note: findColIndex(header, ['비고', '메모']),
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 30); // 30일 이전 행사는 기본적으로 숨김

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const events = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const title = col.title >= 0 ? String(row[col.title] || '').trim() : '';
    if (!title) continue;
    const start = col.start >= 0 ? new Date(row[col.start]) : null;
    if (!start || isNaN(start.getTime())) continue;
    if (start < cutoff) continue;
    if (fromDate && start < fromDate) continue;
    if (toDate && start > toDate) continue;

    events.push({
      title,
      start: Utilities.formatDate(start, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      end: (() => {
        const e = col.end >= 0 ? row[col.end] : '';
        const d = e ? new Date(e) : null;
        return d && !isNaN(d.getTime()) ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
      })(),
      audience: col.audience >= 0 ? String(row[col.audience] || '').trim() : '',
      note: col.note >= 0 ? String(row[col.note] || '').trim() : '',
    });
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events };
}

// ── 학사일정 캘린더 ──────────────────────────────
// 탭: "1학기 종합" 또는 "2학기 종합" / 열: 날짜, 학사일정, 전교사일정, 학년별일정, 기타일정
// sem=1 → 1학기 종합, sem=2 → 2학기 종합
// calender.html은 프론트엔드에서 gviz로 직접 읽으므로 이 함수는 Apps Script 호스팅 경로용 폴백
const SS_CALENDAR = '1hvpMzy02s-SEwAV4lllpiRZhtFy0og3WX8wEXzpTejI';
function getCalendar(sem) {
  sem = sem || 1;
  const ss = getSS_(SS_CALENDAR);
  const sheetName = sem === 1 ? '1학기 종합' : '2학기 종합';
  const sheet = findSheet(ss, [sheetName]);
  if (!sheet) return { events: [], error: `${sheetName} 시트를 찾을 수 없습니다.` };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { events: [] };

  const header = data[0].map(h => String(h).trim().replace(/\n.*/,''));
  const col = {
    date:    0,
    school:  findColIndex(header, ['학사일정']),
    teacher: findColIndex(header, ['전교사일정']),
    grade:   findColIndex(header, ['학년별일정', '학생일정']),
    other:   findColIndex(header, ['기타일정', '기타 일정']),
  };

  const events = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dateVal = row[col.date];
    if (!dateVal) continue;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) continue;
    const dateKey = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    const cats = [
      { key: 'school',  label: '학사',   col: col.school },
      { key: 'teacher', label: '전교사', col: col.teacher },
      { key: 'grade',   label: '학년',   col: col.grade },
      { key: 'other',   label: '기타',   col: col.other },
    ];
    const dayEvs = [];
    for (const cat of cats) {
      if (cat.col < 0) continue;
      const val = String(row[cat.col] || '').trim();
      if (val) dayEvs.push({ key: cat.key, label: cat.label, text: val });
    }
    if (dayEvs.length) events.push({ date: dateKey, events: dayEvs });
  }
  return { events };
}

// ── 학사일정 캘린더(쓰기) ──────────────────────────────
// 날짜 행을 찾아 해당 분류/실 예약 열에 내용을 추가한다.
// 중요: 기존 셀 내용을 절대 덮어쓰지 않는다 — 기존 내용이 있으면 줄바꿈 후 새 내용을 이어 붙인다.
const CALENDAR_CATEGORY_HEADERS = {
  school:  ['학사일정'],
  teacher: ['전교사일정'],
  grade:   ['학년별일정', '학생일정'],
  other:   ['기타일정', '기타 일정'],
};
const CALENDAR_ROOM_HEADERS = {
  plaza:  ['광장 예약', '광장'],
  large:  ['대형 세미나실', '대형'],
  medium: ['중형 세미나실', '중형'],
  small:  ['소형 세미나실', '소형'],
  dance:  ['댄스실 예약', '댄스실', '댄스'],
};

function addCalendarEntry(sem, dateKey, category, text, rooms) {
  sem = sem || 1;
  const ss = getSS_(SS_CALENDAR);
  const sheetName = sem === 1 ? '1학기 종합' : '2학기 종합';
  const sheet = findSheet(ss, [sheetName]);
  if (!sheet) return { error: `${sheetName} 시트를 찾을 수 없습니다.` };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { error: '시트에 데이터가 없습니다.' };

  const header = data[0].map(h => String(h).trim());

  let sheetRow = -1;
  for (let i = 1; i < data.length; i++) {
    const dateVal = data[i][0];
    if (!dateVal) continue;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) continue;
    const key = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (key === dateKey) { sheetRow = i + 1; break; } // 1-based row
  }
  if (sheetRow === -1) return { error: `${dateKey} 날짜를 시트에서 찾을 수 없습니다.` };

  function appendToColumn(candidates, newText) {
    if (!newText) return;
    const ci = findColIndex(header, candidates);
    if (ci < 0) return;
    const cell = sheet.getRange(sheetRow, ci + 1);
    const existing = String(cell.getValue() || '').trim();
    cell.setValue(existing ? existing + '\n' + newText : newText);
  }

  if (category && text && CALENDAR_CATEGORY_HEADERS[category]) {
    appendToColumn(CALENDAR_CATEGORY_HEADERS[category], String(text).trim());
  }
  for (const key of Object.keys(rooms || {})) {
    const val = String(rooms[key] || '').trim();
    if (val && CALENDAR_ROOM_HEADERS[key]) appendToColumn(CALENDAR_ROOM_HEADERS[key], val);
  }

  return { success: true };
}

// ── 학사일정 캘린더(날짜 단위 편집모드) ──────────────────────────────
// calender.html의 "이 날짜 편집" 모드에서 호출. addCalendarEntry(추가, append)와 달리
// 이건 사용자가 명시적으로 기존 내용을 고치는 것이므로 줄바꿈 없이 그대로 덮어쓴다(overwrite).
//
// originalKeys: 편집모드 진입 시 화면에 표시되어 있던 항목들 [{kind,key}, ...]
//   — 사용자가 드롭다운으로 분류를 바꿔서 다른 칸으로 옮긴 경우, 원래 칸은 비워야 하므로 필요.
// entries: 편집 완료 시점의 최종 항목들 [{kind,key,text}, ...]
//   — 같은 (kind,key)로 여러 항목이 모이면 줄바꿈으로 합쳐서 한 칸에 기록한다.
function setCalendarDayEntries(sem, dateKey, originalKeys, entries) {
  sem = sem || 1;
  const ss = getSS_(SS_CALENDAR);
  const sheetName = sem === 1 ? '1학기 종합' : '2학기 종합';
  const sheet = findSheet(ss, [sheetName]);
  if (!sheet) return { error: `${sheetName} 시트를 찾을 수 없습니다.` };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { error: '시트에 데이터가 없습니다.' };
  const header = data[0].map(h => String(h).trim());

  let sheetRow = -1;
  for (let i = 1; i < data.length; i++) {
    const dateVal = data[i][0];
    if (!dateVal) continue;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) continue;
    const k = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (k === dateKey) { sheetRow = i + 1; break; }
  }
  if (sheetRow === -1) return { error: `${dateKey} 날짜를 시트에서 찾을 수 없습니다.` };

  // (kind,key) -> 합쳐진 최종 텍스트
  const finalText = {};
  for (const { kind, key, text } of entries) {
    const t = String(text || '').trim();
    if (!t) continue;
    const k = kind + ':' + key;
    finalText[k] = finalText[k] ? finalText[k] + '\n' + t : t;
  }

  // 원래 표시되어 있던 칸 + 최종적으로 내용이 들어가는 칸 = 이번에 건드릴 모든 칸
  const targetKeys = {};
  for (const { kind, key } of originalKeys) targetKeys[kind + ':' + key] = { kind, key };
  for (const { kind, key } of entries) targetKeys[kind + ':' + key] = { kind, key };

  for (const k of Object.keys(targetKeys)) {
    const { kind, key } = targetKeys[k];
    const candidates = kind === 'room' ? CALENDAR_ROOM_HEADERS[key] : CALENDAR_CATEGORY_HEADERS[key];
    if (!candidates) continue;
    const ci = findColIndex(header, candidates);
    if (ci < 0) continue;
    sheet.getRange(sheetRow, ci + 1).setValue(finalText[k] || '');
  }

  return { success: true };
}

// ── 학생 정보 조회(교사용) ──────────────────────────────
// "[2026]학생정보" 시트의 "1학년"/"2학년"/"3학년" 탭(최종 배정 명단)만 읽는다.
// 같은 시트의 "학적"/"편성정보..." 탭들은 교사 작업용 배정계획/배정현황 보조표라 사용하지 않는다.
// 생년월일/구글계정 같은 민감정보는 화면에 노출하지 않기로 해서 애초에 읽지도 않는다.
//
// 학년마다 "주제선택"인지 "동아리"인지가 다르다(1학년: 화/금 주제선택, 2학년: 스포츠클럽만,
// 3학년: 동아리). 각 학년 시트 자체의 헤더(2번째 행)에 이미 "스포츠클럽"/"주제선택(화)"/
// "주제선택(금)"/"동아리" 텍스트가 그대로 적혀 있으므로, 그 텍스트로 칼럼을 찾는다 — 같은 텍스트가
// 1학기/2학기 칸에 똑같이 나오므로(모든 학년 시트가 1학기 칼럼 그룹 다음에 2학기 칼럼 그룹이 오는
// 구조), 1학기는 첫 번째로 등장한 칼럼, 2학기는 두 번째로 등장한 칼럼을 쓴다.
const STUDENT_STRUCTURE_FIELDS = [
  { sem: 1, label: '주제선택(화)', type: 'elective' },
  { sem: 1, label: '주제선택(금)', type: 'elective' },
  { sem: 1, label: '스포츠클럽', type: 'sport' },
  { sem: 1, label: '동아리', type: 'elective' },
  { sem: 2, label: '주제선택(화)', type: 'elective' },
  { sem: 2, label: '주제선택(금)', type: 'elective' },
  { sem: 2, label: '스포츠클럽', type: 'sport' },
  { sem: 2, label: '동아리', type: 'elective' },
];

// subHeader(시트의 2번째 행) 중 text를 포함하는 칼럼 인덱스를 등장 순서대로 모두 반환
function findHeaderColumns_(subHeader, text) {
  const idxs = [];
  subHeader.forEach((h, i) => { if (String(h).trim().includes(text)) idxs.push(i); });
  return idxs;
}

// 항목 이름 + 학기(1학기=첫 등장, 2학기=두 번째 등장)로 실제 칼럼 인덱스(0-based)를 찾는다
function resolveStudentFieldColumn_(subHeader, sem, label) {
  const matches = findHeaderColumns_(subHeader, label);
  const occurrence = sem === 1 ? 0 : 1;
  return matches[occurrence] !== undefined ? matches[occurrence] : -1;
}

// "structure" 탭은 칼럼 위치를 찾는 용도가 아니라, 학년/학기/항목별로 "고를 수 있는 이름 목록"을
// "/"로 구분해 적어두는 용도다(예: "배구 1/탁구 1/야구 1/농구 1"). 아직 정해지지 않은 학기(보통
// 2학기)는 빈칸으로 둔다. stu.html 수정모드 드롭다운이 이 목록을 우선 사용하고, 목록이 비어있으면
// 현재 배정된 값들로부터 자동으로 옵션을 추리는 식으로 동작한다.
// A열 = 행 라벨("1학기 주제선택(화)" 등), 1행 = 학년 헤더("1학년"/"2학년"/"3학년").
function getStudentFieldOptions_() {
  const ss = getSS_(SS_STUDENT);
  const sheet = findSheet(ss, ['structure', 'Structure', '구조']);
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  const header = data[0].map(h => String(h).trim());
  const gradeCol = {};
  header.forEach((h, i) => {
    const m = h.match(/([123])\s*학년/);
    if (m) gradeCol[m[1]] = i;
  });

  const options = { '1': {}, '2': {}, '3': {} };
  for (let i = 1; i < data.length; i++) {
    const label = String(data[i][0] || '').trim();
    if (!label) continue;
    Object.keys(gradeCol).forEach(g => {
      const raw = String(data[i][gradeCol[g]] || '').trim();
      if (!raw) return;
      const list = raw.split('/').map(s => s.trim()).filter(Boolean);
      if (list.length) options[g][label] = list;
    });
  }
  return options;
}

function getStudentRoster() {
  const ss = getSS_(SS_STUDENT);
  const fieldOptions = getStudentFieldOptions_();
  const students = [];

  for (const grade of [1, 2, 3]) {
    const sheet = findSheet(ss, [`${grade}학년`]);
    if (!sheet) continue;

    const data = sheet.getDataRange().getValues();
    if (data.length < 3) continue; // 헤더 2줄 + 데이터 최소 1줄

    const header0 = data[0].map(h => String(h).trim());
    const subHeader = data[1].map(h => String(h).trim());
    const colGrade = findColIndex(header0, ['학년']);
    const colBan = findColIndex(header0, ['반']);
    const colNum = findColIndex(header0, ['번호']);
    const colId = findColIndex(header0, ['학번']);
    const colName = findColIndex(header0, ['성명', '이름']);
    if (colId < 0 || colName < 0) continue;

    // 이 학년 시트 헤더에 실제로 매칭되는 필드만 추린다 (없는 학년은 자동으로 빠짐)
    const fields = STUDENT_STRUCTURE_FIELDS
      .map(f => {
        const colIndex = resolveStudentFieldColumn_(subHeader, f.sem, f.label);
        return colIndex >= 0 ? { ...f, colIndex } : null;
      })
      .filter(Boolean);

    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      const id = String(row[colId] || '').trim();
      const name = String(row[colName] || '').trim();
      if (!id || !name) continue; // 보조표 행 등 학생 데이터가 아닌 행은 건너뜀

      const sem1 = { sport: '', extras: [] };
      const sem2 = { sport: '', extras: [] };
      fields.forEach(f => {
        const target = f.sem === 1 ? sem1 : sem2;
        const value = String(row[f.colIndex] || '').trim();
        if (f.type === 'sport') target.sport = value;
        else target.extras.push({ label: f.label, value });
      });

      students.push({
        grade: colGrade >= 0 ? row[colGrade] : grade,
        ban: colBan >= 0 ? row[colBan] : '',
        num: colNum >= 0 ? row[colNum] : '',
        id,
        name,
        sem1,
        sem2,
      });
    }
  }

  return { students, fieldOptions };
}

// ── 학생 정보 일괄 수정(교사용 수정모드) ──────────────────────────────
// stu.html의 수정모드에서, 여러 학생의 여러 칸을 한번에 바꾼 뒤 "수정 완료" 한 번으로 묶어 보낸다.
// changes: [{ id(학번), grade, sem(1|2), label('스포츠클럽'|'주제선택(화)'|'주제선택(금)'|'동아리'), value }]
// 칼럼 찾기는 getStudentRoster와 동일하게 각 학년 시트 자체의 헤더 텍스트로 한다(섹션 위 설명 참고).
function updateStudentFields(changes) {
  const ss = getSS_(SS_STUDENT);
  const sheetCache = {};
  const subHeaderCache = {};
  const rowCache = {};

  function getSheetForGrade(grade) {
    if (!(grade in sheetCache)) sheetCache[grade] = findSheet(ss, [`${grade}학년`]);
    return sheetCache[grade];
  }
  function getSubHeaderForGrade(grade) {
    if (!(grade in subHeaderCache)) {
      const sheet = getSheetForGrade(grade);
      subHeaderCache[grade] = sheet
        ? sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim())
        : [];
    }
    return subHeaderCache[grade];
  }
  function getRowForStudent(grade, id) {
    const cacheKey = `${grade}|${id}`;
    if (cacheKey in rowCache) return rowCache[cacheKey];
    const sheet = getSheetForGrade(grade);
    if (!sheet) { rowCache[cacheKey] = -1; return -1; }
    const data = sheet.getDataRange().getValues();
    const header0 = data[0].map(h => String(h).trim());
    const colId = findColIndex(header0, ['학번']);
    let found = -1;
    for (let i = 2; i < data.length; i++) {
      if (String(data[i][colId] || '').trim() === String(id)) { found = i + 1; break; } // 1-based row
    }
    rowCache[cacheKey] = found;
    return found;
  }

  let updated = 0;
  const errors = [];
  for (const ch of (changes || [])) {
    const subHeader = getSubHeaderForGrade(ch.grade);
    const colIndex = resolveStudentFieldColumn_(subHeader, ch.sem, ch.label);
    if (colIndex < 0) { errors.push(`${ch.id}: "${ch.sem}학기 ${ch.label}" 칼럼을 ${ch.grade}학년 시트에서 찾을 수 없습니다.`); continue; }
    const sheet = getSheetForGrade(ch.grade);
    if (!sheet) { errors.push(`${ch.id}: ${ch.grade}학년 시트를 찾을 수 없습니다.`); continue; }
    const row = getRowForStudent(ch.grade, ch.id);
    if (row < 0) { errors.push(`${ch.id}: 학번을 시트에서 찾을 수 없습니다.`); continue; }
    const col = colIndex + 1; // 1-based
    sheet.getRange(row, col).setValue(String(ch.value || '').trim());
    updated++;
  }

  return { success: true, updated, errors };
}

// ── 회의록 ──────────────────────────────
// Google Form 응답 시트 그대로 사용: 타임스탬프, 회의명, 일시, 작성자, 회의록 링크, 요약
function getMinutes(limit) {
  const ss = getSS_(SS_MINUTES);
  const sheet = findSheet(ss, ['설문지 응답 시트1', 'Form Responses 1', '응답', '회의록']);
  if (!sheet) return { minutes: [], error: '회의록 응답 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { minutes: [] };

  const header = data[0].map(h => String(h).trim());
  const col = {
    title: findColIndex(header, ['회의명', '제목']),
    date: findColIndex(header, ['일시', '날짜']),
    author: findColIndex(header, ['작성자', '담당자']),
    link: findColIndex(header, ['회의록 링크', '링크', 'URL']),
    summary: findColIndex(header, ['요약', '내용']),
  };

  const minutes = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const title = col.title >= 0 ? String(row[col.title] || '').trim() : '';
    if (!title) continue;
    const dateVal = col.date >= 0 ? row[col.date] : '';
    const d = dateVal ? new Date(dateVal) : null;
    minutes.push({
      title,
      date: d && !isNaN(d.getTime()) ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(dateVal || ''),
      author: col.author >= 0 ? String(row[col.author] || '').trim() : '',
      link: col.link >= 0 ? String(row[col.link] || '').trim() : '',
      summary: col.summary >= 0 ? String(row[col.summary] || '').trim() : '',
    });
  }

  minutes.sort((a, b) => b.date.localeCompare(a.date)); // 최신순
  return { minutes: limit ? minutes.slice(0, limit) : minutes };
}
