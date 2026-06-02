const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const https = require('https');
const { google } = require('googleapis');

const SPREADSHEET_ID = '1eZiZNrsy6fNB5QBwxPoLho4-P1YGdTFD0j8krh31xXk';
const SHEET_GID = 272007916;
const SERVICE_ACCOUNT_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'service-account.json')
  : path.join(__dirname, 'service-account.json');

// Google Sheets 인증
function getAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Makestar 출고 분석',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  win.loadFile('index.html');

  win.once('ready-to-show', () => {
    win.show();
  });

  // 창 닫기 → 렌더러에 커스텀 모달 요청
  win.on('close', (e) => {
    e.preventDefault();
    win.webContents.send('close-request');
  });

  ipcMain.on('close-confirmed',  () => win.destroy());
  ipcMain.on('close-cancelled',  () => {});

  // 메뉴 간소화
  const menu = Menu.buildFromTemplate([
    {
      label: '파일',
      submenu: [
        { label: '새로고침', accelerator: 'F5', click: () => win.reload() },
        { type: 'separator' },
        { label: '종료', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '확대', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '축소', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '기본 크기', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: '전체화면', accelerator: 'F11', role: 'togglefullscreen' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// ── 시트 탭 목록 가져오기 ──
ipcMain.handle('get-sheet-tabs', async () => {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    return res.data.sheets.map(s => ({
      name: s.properties.title,
      gid:  s.properties.sheetId,
    }));
  } catch(e) {
    console.error('탭 목록 오류:', e.message);
    return [];
  }
});

// ── 구글시트 CSV fetch (리다이렉트 자동 추적) ──
ipcMain.handle('fetch-sheet-csv', (event, url) => {
  return new Promise((resolve, reject) => {
    function doGet(targetUrl, redirectCount) {
      if (redirectCount > 5) return reject(new Error('리다이렉트 횟수 초과'));
      const parsed = new URL(targetUrl);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      };
      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doGet(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.end();
    }
    doGet(url, 0);
  });
});

// ── 구글시트 셀 업데이트 ──
ipcMain.handle('write-to-sheet', async (event, updates, gid) => {
  // updates: [{ eventId, date, field, value }, ...]
  const targetGid = gid || SHEET_GID;
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // 시트 이름 가져오기 (GID로 매핑)
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.sheetId === targetGid);
    if (!sheet) throw new Error('시트를 찾을 수 없습니다.');
    const sheetName = sheet.properties.title;

    // 전체 데이터 읽기 (행 번호 매핑용)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:G200`,
    });
    const rows = response.data.values || [];

    // 헤더 행 찾기
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      if (rows[i].join(',').includes('이벤트 ID') || rows[i].join(',').includes('작업 예정 일')) {
        headerRowIdx = i;
        break;
      }
    }
    const headers = rows[headerRowIdx];
    const colIdx = {
      date:   headers.findIndex(h => h.includes('작업 예정')),
      type:   headers.findIndex(h => h.includes('구분')),
      id:     headers.findIndex(h => h.includes('이벤트 ID')),
      order:  headers.findIndex(h => h.includes('주문건')),
      album:  headers.findIndex(h => h.includes('앨범')),
      status: headers.findIndex(h => h.includes('작업여부')),
    };

    // 업데이트할 셀 목록 생성
    const data = [];
    const colorRequests = [];
    for (const u of updates) {
      // 해당 이벤트 행 찾기 (headerRowIdx+1 이후 행부터)
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const rowEventId = (row[colIdx.id] || '').trim();
        const rowDate    = (row[colIdx.date] || '').trim();
        const rowType    = (row[colIdx.type] || '').trim();
        console.log(`[row ${i}] id="${rowEventId}" date="${rowDate}" type="${rowType}" | searching id="${u.eventId}" date="${u.date}" type="${u.type}"`);
        if (rowEventId === u.eventId && rowDate === u.date && rowType === (u.type || '').trim()) {
          const sheetRow = i + 1; // 1-based
          // 작업여부 및 비고 컬럼 업데이트
          if (u.field === 'status') {
            const col = String.fromCharCode(65 + colIdx.status);
            data.push({
              range: `${sheetName}!${col}${sheetRow}`,
              values: [[u.value]],
            });
          }
          // 완료 시 행 배경색 적용 (진한 회색 2: #434343)
          if (u.value && u.value.includes('완료')) {
            colorRequests.push({
              repeatCell: {
                range: {
                  sheetId: targetGid,
                  startRowIndex: i,       // 0-based
                  endRowIndex: i + 1,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 67/255, green: 67/255, blue: 67/255 },
                    textFormat: {
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                    },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat.foregroundColor)',
              },
            });
          }
          break;
        }
      }
    }

    if (data.length === 0) return { success: false, message: '업데이트할 행을 찾지 못했습니다.' };

    // 텍스트 배치 업데이트
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    });

    // 완료 행 배경색 적용
    if (colorRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: colorRequests },
      });
    }

    return { success: true, count: data.length };
  } catch (e) {
    console.error('시트 쓰기 오류:', e.message);
    return { success: false, message: e.message };
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-update', async () => {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '앱버전!A1:B1',
    });
    const row = (res.data.values || [[]])[0] || [];
    return { latestVersion: (row[0] || '').trim(), downloadUrl: (row[1] || '').trim() };
  } catch (e) {
    return { latestVersion: '', downloadUrl: '' };
  }
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
