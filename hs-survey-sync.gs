/**
 * =====================================================================
 * 고등학교 진학 희망 조사 — 설문(Firebase RTDB) → 구글시트 자동 연동
 * =====================================================================
 *
 * 데이터 출처 : https://ddelza.github.io/gwangsu-on/hs-survey-admin.html 가 읽는
 *               Firebase RTDB  years/{연도}/hsSurvey/{학번} = { latest, history }
 * 반영 대상   : 이 스프레드시트의 gid = HS_TARGET_GID 탭
 *               (반 / 번호 / 이름 / 전기고교(희망) / 학과 / 후기고교(희망))
 *
 * ── 설치 방법 ─────────────────────────────────────────────────────
 *  1. 대상 스프레드시트에서  확장 프로그램 > Apps Script  열기
 *  2. 이 파일 내용을 붙여넣고 저장 (파일명은 아무거나, 예: hsSurveySync.gs)
 *  3. 시트를 새로고침하면 상단에 "고입 희망조사" 메뉴가 생긴다
 *  4. 메뉴 > 지금 동기화  를 한 번 실행해 권한을 승인한다
 *  5. 계속 자동으로 맞추고 싶으면  메뉴 > 자동 동기화 켜기(1시간마다)
 *
 *  ※ 이 스프레드시트에 이미 onOpen() 이 있는 다른 스크립트 파일이 있다면,
 *    아래 onOpen 을 지우고 기존 onOpen 안에서 hsBuildMenu_() 를 호출할 것.
 *
 * ── 안전장치 ─────────────────────────────────────────────────────
 *  · 기본값(HS_OVERWRITE = false)은 "시트가 비어 있는 칸만" 채운다.
 *    선생님이 손으로 적어둔 값은 절대 지우지 않고, 설문 응답과 다르면
 *    그 칸에 메모(⚠)를 달고 연한 주황색으로 표시만 한다.
 *  · 설문 응답이 없는 학생의 칸은 손대지 않는다(빈칸으로 덮어쓰지 않음).
 *  · "미리보기"를 쓰면 시트를 건드리지 않고 무엇이 바뀔지만 보여준다.
 *  · 표 오른쪽(한 칸 띄고)에 "설문 …" 열을 만들어 지역·학교분류·원문·제출시각을
 *    같이 적어둔다. 이 열들은 스크립트 전용이라 매번 새로 덮어쓴다.
 */

// ── 설정 ───────────────────────────────────────────────────────────
const HS_DB_URL = 'https://gwangsu-on-default-rtdb.firebaseio.com';
const HS_YEAR = 2026;                 // RTDB years/{연도}
const HS_GRADE = 3;                   // 이 명단은 3학년 (학번 = 3 + 반 + 번호2자리)
const HS_SS_ID = '1PRQS3Jb1a9retpUBWThVgA4UveD-qfFiZO-haeq0_y4'; // 바인딩 안 된 경우 대비
const HS_TARGET_GID = 438675650;      // 반/번호/이름/전기고교/학과/후기고교 탭
const HS_RAW_SHEET_NAME = '설문원본(자동)'; // 전체 응답을 그대로 떨궈두는 탭(없으면 생성)

const HS_OVERWRITE = false;           // true = 시트에 값이 있어도 설문 값으로 덮어쓴다
const HS_SHORTEN_NAMES = true;        // '초월고등학교' → '초월고' 로 줄여서 기록
const HS_HIGHLIGHT_CONFLICT = true;   // 설문과 시트 값이 다를 때 칸 배경색 표시
const HS_CONFLICT_COLOR = '#fff3e0';
const HS_NOTE_TAG = '[설문연동]';     // 이 스크립트가 단 메모임을 알아보기 위한 표시

// 후기학교로 볼 학교 분류 — 일반고만 후기, 나머지(특성화고·마이스터고·과학고·
// 예술고·체육고·그외)는 모두 전기학교 칸에 기록한다.
const HS_LATE_TYPES = ['일반고'];
function hsIsEarly_(schoolType) { return HS_LATE_TYPES.indexOf(schoolType) < 0; }

// 표 오른쪽에 붙일 설문 상세 열 (스크립트가 만들고 매번 새로 씀)
const HS_EXTRA_COLS = true;
const HS_EXTRA_HEADERS = ['설문 지역', '설문 학교분류', '설문 전기/후기', '설문 희망학교(원문)',
                          '설문 학과(원문)', '설문 제출횟수', '설문 제출시각'];

// '○○고등학교' 규칙만으로 시트 표기와 안 맞는 학교들의 예외 표기
const HS_NAME_ALIAS = {
  '경화여자고등학교': '경화여고',
  '경화EB고등학교': '경화여자EB고',
  '한국애니고등학교': '한국애니메이션고',
  '한국애니메이션고등학교': '한국애니메이션고',
};

// ── 메뉴 ───────────────────────────────────────────────────────────
function onOpen() {
  hsBuildMenu_();
}

function hsBuildMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('고입 희망조사')
    .addItem('지금 동기화', 'hsSyncNow')
    .addItem('미리보기 (시트는 그대로)', 'hsPreview')
    .addSeparator()
    .addItem('자동 동기화 켜기 (1시간마다)', 'hsInstallTrigger')
    .addItem('자동 동기화 끄기', 'hsRemoveTrigger')
    .addToUi();
}

function hsSyncNow() { hsAlert_('동기화 결과', hsSync_(false)); }
function hsPreview() { hsAlert_('미리보기 (아무것도 저장하지 않았습니다)', hsSync_(true)); }
function hsSyncScheduled() { Logger.log(hsSync_(false)); } // 시간 트리거 진입점

// ── 본체 ───────────────────────────────────────────────────────────
function hsSync_(dryRun) {
  const ss = hsSpreadsheet_();
  const sheet = hsSheetByGid_(ss, HS_TARGET_GID);
  if (!sheet) throw new Error('gid=' + HS_TARGET_GID + ' 인 시트를 찾을 수 없습니다.');

  const loc = hsLocateTable_(sheet);
  if (!loc) throw new Error('"반 / 번호 / 이름 / 전기고교(희망)" 머리글 행을 찾지 못했습니다.');

  const roster = hsFetchJson_(HS_DB_URL + '/years/' + HS_YEAR + '/students.json') || {};
  const survey = hsFetchJson_(HS_DB_URL + '/years/' + HS_YEAR + '/hsSurvey.json') || {};
  const latestById = hsLatestById_(survey);

  const dataStart = loc.headerRow + 1;
  const nRows = sheet.getLastRow() - dataStart + 1;
  if (nRows <= 0) throw new Error('머리글 아래에 학생 행이 없습니다.');

  const all = sheet.getRange(dataStart, 1, nRows, sheet.getLastColumn()).getDisplayValues();

  // 손댈 세 칸(전기고교 / 학과 / 후기고교)을 한 덩어리로 읽어서 한 번에 되쓴다
  const cols = [loc.col.early, loc.col.dept, loc.col.late].filter(function (c) { return c != null; });
  const colStart = Math.min.apply(null, cols) + 1;
  const colEnd = Math.max.apply(null, cols) + 1;
  const blockW = colEnd - colStart + 1;
  const block = sheet.getRange(dataStart, colStart, nRows, blockW);
  const vals = block.getValues();
  const notes = block.getNotes();

  const bgOps = [];      // {row, col, color|null} — 배경색은 필요한 칸만 개별 적용
  const filled = [];     // 새로 채운 칸
  const updated = [];    // 덮어쓴 칸 (HS_OVERWRITE = true 일 때만)
  const conflicts = [];  // 시트 값 ≠ 설문 값 (건드리지 않음)
  const nameMismatch = [];
  const seen = {};

  // 미리보기에서는 머리글조차 만들지 않는다(시트를 전혀 건드리지 않기 위해)
  const extraCols = HS_EXTRA_COLS ? hsEnsureExtraCols_(sheet, loc.headerRow, dryRun) : null;
  const extraVals = [];

  for (let i = 0; i < nRows; i++) {
    const row = all[i];
    extraVals.push(['', '', '', '', '', '', '']);
    const ban = hsInt_(row[loc.col.ban]);
    const num = hsInt_(row[loc.col.num]);
    const sheetName = String(row[loc.col.name] || '').trim();
    if (!ban || !num) continue;

    const id = String(HS_GRADE) + String(ban) + hsPad2_(num);
    const sub = latestById[id];
    const who = HS_GRADE + '-' + ban + ' ' + num + '번 ' + (sheetName || '(이름없음)');

    const rosterName = String((roster[id] && roster[id].name) || (sub && sub.name) || '').trim();
    if (sheetName && rosterName && sheetName !== rosterName) {
      nameMismatch.push(who + ' ↔ 학생명부 "' + rosterName + '" (학번 ' + id + ')');
    }
    if (!sub) continue;
    seen[id] = true;

    const isEarly = hsIsEarly_(sub.schoolType);
    const school = hsShortName_(sub.schoolName);
    extraVals[i] = [
      sub.area || '', sub.schoolType || '', isEarly ? '전기' : '후기',
      sub.schoolName || '', sub.department || '',
      hsHistoryCount_(survey[id]),
      sub.submittedAt ? Utilities.formatDate(new Date(sub.submittedAt), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : '',
    ];
    const targets = [
      { col: loc.col.early, value: isEarly ? school : '', label: '전기고교' },
      { col: loc.col.dept, value: String(sub.department || '').trim(), label: '학과' },
      { col: loc.col.late, value: isEarly ? '' : school, label: '후기고교' },
    ];

    targets.forEach(function (t) {
      if (t.col == null || !t.value) return;      // 설문에 값이 없으면 시트를 비우지 않는다
      const bi = t.col + 1 - colStart;            // block 안에서의 열 인덱스
      const cur = String(vals[i][bi] == null ? '' : vals[i][bi]).trim();
      const stamp = hsStamp_(sub);

      if (cur === t.value) {                      // 이미 같음 — 예전 충돌 표시가 있으면 정리
        if (notes[i][bi].indexOf(HS_NOTE_TAG) === 0) {
          notes[i][bi] = HS_NOTE_TAG + ' ' + stamp;
          if (HS_HIGHLIGHT_CONFLICT) bgOps.push({ row: i, col: bi, color: null });
        }
        return;
      }
      if (!cur) {                                 // 빈 칸 → 채운다
        vals[i][bi] = t.value;
        notes[i][bi] = HS_NOTE_TAG + ' ' + stamp;
        if (HS_HIGHLIGHT_CONFLICT) bgOps.push({ row: i, col: bi, color: null });
        filled.push(who + ' · ' + t.label + ' → ' + t.value);
        return;
      }
      if (HS_OVERWRITE) {                         // 덮어쓰기 모드
        vals[i][bi] = t.value;
        notes[i][bi] = HS_NOTE_TAG + ' "' + cur + '" → "' + t.value + '" ' + stamp;
        updated.push(who + ' · ' + t.label + ': ' + cur + ' → ' + t.value);
        return;
      }
      // 기본 모드: 손으로 적은 값을 살리고 차이만 표시
      notes[i][bi] = HS_NOTE_TAG + ' ⚠ 설문 응답은 "' + t.value + '" 입니다 (덮어쓰지 않음) ' + stamp;
      if (HS_HIGHLIGHT_CONFLICT) bgOps.push({ row: i, col: bi, color: HS_CONFLICT_COLOR });
      conflicts.push(who + ' · ' + t.label + ': 시트 "' + cur + '" vs 설문 "' + t.value + '"');
    });
  }

  const orphans = Object.keys(latestById).filter(function (id) { return !seen[id]; }).sort();

  if (!dryRun) {
    block.setValues(vals);
    block.setNotes(notes);
    bgOps.forEach(function (op) {
      sheet.getRange(dataStart + op.row, colStart + op.col).setBackground(op.color);
    });
    if (extraCols) {
      extraCols.forEach(function (c, j) {
        sheet.getRange(dataStart, c, nRows, 1)
          .setValues(extraVals.map(function (r) { return [r[j]]; }));
      });
    }
    hsWriteRawSheet_(ss, roster, survey);
  }

  return hsReport_(dryRun, sheet.getName(), latestById, filled, updated, conflicts, nameMismatch, orphans);
}

// ── 설문 데이터 정리 ────────────────────────────────────────────────
/** years/{연도}/hsSurvey 전체 → { 학번: 최신제출 } */
function hsLatestById_(survey) {
  const out = {};
  Object.keys(survey || {}).forEach(function (id) {
    const sub = hsLatestOf_(survey[id]);
    if (sub && sub.schoolName) out[id] = sub;
  });
  return out;
}

/** { latest, history } 구조가 기본이지만, 초기 flat 스키마도 받아준다 */
function hsLatestOf_(rec) {
  if (!rec) return null;
  if (rec.latest) return rec.latest;
  if (rec.schoolName) return rec;           // 구(舊) flat 스키마
  if (rec.history) {
    const arr = Object.keys(rec.history).map(function (k) { return rec.history[k]; })
      .sort(function (a, b) { return (a.submittedAt || 0) - (b.submittedAt || 0); });
    return arr.length ? arr[arr.length - 1] : null;
  }
  return null;
}

function hsHistoryCount_(rec) {
  return rec && rec.history ? Object.keys(rec.history).length : (rec && rec.schoolName ? 1 : 0);
}

function hsShortName_(name) {
  const t = String(name == null ? '' : name).trim();
  if (!t) return '';
  if (HS_NAME_ALIAS[t]) return HS_NAME_ALIAS[t];
  if (!HS_SHORTEN_NAMES) return t;
  return t.replace(/고등학교$/, '고');
}

function hsStamp_(sub) {
  const when = sub.submittedAt ? Utilities.formatDate(new Date(sub.submittedAt), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : '';
  return '(제출 ' + (when || '시각미상') + (sub.editedByAdmin ? ', 관리자 수정' : '') + ')';
}

// ── 원본 탭 ────────────────────────────────────────────────────────
function hsWriteRawSheet_(ss, roster, survey) {
  let sh = ss.getSheetByName(HS_RAW_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(HS_RAW_SHEET_NAME);

  const header = ['학번', '반', '번호', '이름', '지역', '학교분류', '전기/후기', '희망학교(원문)',
                  '희망학교(표기)', '학과', '직접입력', '제출횟수', '최종제출시각', '관리자수정'];
  const rows = Object.keys(survey).sort().map(function (id) {
    const sub = hsLatestOf_(survey[id]);
    if (!sub) return null;
    // 학생명부(roster)에 없으면 제출 기록 자체에 들어 있는 반/번호/이름을 쓴다
    const s = roster[id] || sub;
    const isEarly = hsIsEarly_(sub.schoolType);
    return [
      id, s.ban || '', s.num || '', s.name || '',
      sub.area || '', sub.schoolType || '', isEarly ? '전기' : '후기',
      sub.schoolName || '', hsShortName_(sub.schoolName), sub.department || '',
      sub.isCustomSchool ? 'Y' : 'N', hsHistoryCount_(survey[id]),
      sub.submittedAt ? Utilities.formatDate(new Date(sub.submittedAt), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : '',
      sub.editedByAdmin ? 'Y' : '',
    ];
  }).filter(function (r) { return r; });

  sh.clear();
  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#1a3d7c').setFontColor('#ffffff');
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(rows.length + 3, 1)
    .setValue('마지막 동기화: ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'))
    .setFontColor('#888888');
  return sh;
}

/**
 * 표 오른쪽에 "설문 …" 상세 열을 확보한다.
 * 이미 머리글이 다 있으면 그 자리를 그대로 쓰고, 없으면 기존 표에서 한 칸 띄운
 * 다음 칸부터 새로 만든다. 반환값은 1-based 열 번호 배열.
 */
function hsEnsureExtraCols_(sheet, headerRow, dryRun) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const header = sheet.getRange(headerRow, 1, 1, width).getDisplayValues()[0]
    .map(function (v) { return String(v || '').replace(/\s/g, ''); });
  const found = HS_EXTRA_HEADERS.map(function (h) { return header.indexOf(h.replace(/\s/g, '')) + 1; });
  if (found.every(function (c) { return c > 0; })) return found;
  if (dryRun) return null;

  const start = width + 2; // 기존 표와 한 칸 띄운다
  const need = start + HS_EXTRA_HEADERS.length - 1 - sheet.getMaxColumns();
  if (need > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), need);
  sheet.getRange(headerRow, start, 1, HS_EXTRA_HEADERS.length)
    .setValues([HS_EXTRA_HEADERS])
    .setFontWeight('bold').setBackground('#1a3d7c').setFontColor('#ffffff').setWrap(true);
  return HS_EXTRA_HEADERS.map(function (h, i) { return start + i; });
}

// ── 시트 찾기 / 머리글 찾기 ─────────────────────────────────────────
function hsSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(HS_SS_ID);
}

function hsSheetByGid_(ss, gid) {
  const found = ss.getSheets().filter(function (s) { return s.getSheetId() === gid; });
  return found.length ? found[0] : null;
}

/**
 * 탭 위쪽을 훑어 "반 / 번호 / 이름 / 전기고교(희망) / 학과 / 후기고교(희망)"
 * 머리글 행과 각 열 위치를 찾는다. 위에 다른 표가 있어도 상관없다.
 */
function hsLocateTable_(sheet) {
  const scan = Math.min(sheet.getLastRow(), 60);
  const width = sheet.getLastColumn();
  if (!scan || !width) return null;
  const grid = sheet.getRange(1, 1, scan, width).getDisplayValues();

  for (let r = 0; r < grid.length; r++) {
    const col = {};
    for (let c = 0; c < width; c++) {
      const cell = String(grid[r][c] || '').replace(/\s/g, '');
      if (!cell) continue;
      if (cell === '반' && col.ban == null) col.ban = c;
      else if ((cell === '번호' || cell === '번') && col.num == null) col.num = c;
      else if ((cell === '이름' || cell === '성명') && col.name == null) col.name = c;
      else if (cell.indexOf('전기') === 0 && col.early == null) col.early = c;
      else if (cell.indexOf('후기') === 0 && col.late == null) col.late = c;
      else if (cell.indexOf('학과') === 0 && col.dept == null) col.dept = c;
    }
    if (col.ban != null && col.num != null && col.name != null && (col.early != null || col.late != null)) {
      return { headerRow: r + 1, col: col };
    }
  }
  return null;
}

// ── 자동 동기화 트리거 ──────────────────────────────────────────────
function hsInstallTrigger() {
  hsRemoveTriggers_();
  ScriptApp.newTrigger('hsSyncScheduled').timeBased().everyHours(1).create();
  hsAlert_('자동 동기화', '1시간마다 자동으로 동기화합니다.\n(끄려면 메뉴 > 자동 동기화 끄기)');
}

function hsRemoveTrigger() {
  const n = hsRemoveTriggers_();
  hsAlert_('자동 동기화', n ? '자동 동기화를 껐습니다.' : '켜져 있는 자동 동기화가 없습니다.');
}

function hsRemoveTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'hsSyncScheduled') { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

// ── 잡동사니 ───────────────────────────────────────────────────────
function hsFetchJson_(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('Firebase 응답 오류 ' + res.getResponseCode() + ' — ' + url);
  }
  const text = res.getContentText();
  return text && text !== 'null' ? JSON.parse(text) : null;
}

function hsInt_(v) {
  const n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function hsPad2_(n) { return (n < 10 ? '0' : '') + n; }

function hsReport_(dryRun, sheetName, latestById, filled, updated, conflicts, nameMismatch, orphans) {
  const lines = [];
  lines.push('대상 시트: ' + sheetName + (dryRun ? '  (미리보기 — 저장 안 함)' : ''));
  lines.push('설문 제출: ' + Object.keys(latestById).length + '명');
  lines.push('');
  lines.push('빈 칸 채움: ' + filled.length + '건');
  if (HS_OVERWRITE) lines.push('덮어씀: ' + updated.length + '건');
  lines.push('설문과 다름(그대로 둠): ' + conflicts.length + '건');
  lines.push('명부와 이름 불일치: ' + nameMismatch.length + '건');
  lines.push('시트에서 못 찾은 제출자: ' + orphans.length + '명');

  const detail = function (title, arr) {
    if (!arr.length) return;
    lines.push('');
    lines.push('── ' + title);
    arr.slice(0, 25).forEach(function (s) { lines.push('· ' + s); });
    if (arr.length > 25) lines.push('… 외 ' + (arr.length - 25) + '건');
  };
  detail('채운 칸', filled);
  if (HS_OVERWRITE) detail('덮어쓴 칸', updated);
  detail('설문과 다른 칸 (메모·색으로 표시만)', conflicts);
  detail('이름 불일치', nameMismatch);
  detail('시트에 행이 없는 제출 학번', orphans);
  return lines.join('\n');
}

function hsAlert_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(title + '\n' + message);
  }
}
