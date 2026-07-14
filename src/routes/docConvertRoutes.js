const express = require('express');
const router = express.Router();
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// ImageMagick 바이너리 탐지: 7.x 는 `magick`, 6.x 는 `convert`
// 서버에 설치된 쪽을 런타임에 확인한 뒤 해당 명령으로 실행한다.
let MAGICK_BIN = null;
let MAGICK_MODE = null; // 'magick' | 'convert'
function detectMagick() {
  return new Promise((resolve) => {
    if (MAGICK_BIN) return resolve({ bin: MAGICK_BIN, mode: MAGICK_MODE });
    execFile('magick', ['-version'], (err) => {
      if (!err) {
        MAGICK_BIN = 'magick';
        MAGICK_MODE = 'magick';
        return resolve({ bin: MAGICK_BIN, mode: MAGICK_MODE });
      }
      execFile('convert', ['-version'], (err2) => {
        if (!err2) {
          MAGICK_BIN = 'convert';
          MAGICK_MODE = 'convert';
          return resolve({ bin: MAGICK_BIN, mode: MAGICK_MODE });
        }
        resolve({ bin: null, mode: null });
      });
    });
  });
}

// Ghostscript 탐지 (PDF 처리에 필수)
function detectGhostscript() {
  return new Promise((resolve) => {
    execFile('gs', ['--version'], (err, stdout) => {
      resolve(err ? null : (stdout || '').trim());
    });
  });
}

// ImageMagick policy.xml 이 PDF 를 차단하는지 확인 (Ubuntu 기본값에서 흔한 문제)
function checkPdfPolicy() {
  const candidates = [
    '/etc/ImageMagick-6/policy.xml',
    '/etc/ImageMagick-7/policy.xml',
    '/usr/local/etc/ImageMagick-7/policy.xml',
  ];
  for (const p of candidates) {
    try {
      const xml = fs.readFileSync(p, 'utf8');
      // PDF read 가 none 으로 막혀 있는지 대략적으로 검사
      const blocked = /<policy\s+[^>]*pattern="PDF"[^>]*rights="none"/i.test(xml);
      return { path: p, blocked };
    } catch (e) {
      // 다음 후보
    }
  }
  return { path: null, blocked: false };
}

// 진단 엔드포인트: 서버 환경 확인용
router.get('/doc-convert/check', async (req, res) => {
  const mk = await detectMagick();
  const gs = await detectGhostscript();
  const policy = checkPdfPolicy();
  res.json({
    success: true,
    data: {
      imagemagick: mk.bin
        ? { ok: true, command: mk.bin, mode: mk.mode }
        : { ok: false, hint: 'ImageMagick 미설치. 설치: sudo apt install imagemagick' },
      ghostscript: gs
        ? { ok: true, version: gs }
        : { ok: false, hint: 'Ghostscript 미설치 — PDF 변환 불가. 설치: sudo apt install ghostscript' },
      pdfPolicy: policy.path
        ? policy.blocked
          ? { ok: false, path: policy.path, hint: `PDF 차단 중. ${policy.path} 에서 PDF 관련 <policy> 를 주석 처리하거나 rights="read|write" 로 변경하세요.` }
          : { ok: true, path: policy.path }
        : { ok: true, path: null, note: 'policy.xml 을 찾지 못함 (문제 아닐 수 있음)' },
    },
  });
});

router.post('/doc-convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '파일이 없습니다.' });
  }

  const dpi = parseInt(req.body.dpi) || 300;
  const format = (req.body.format || 'tiff').toLowerCase();
  const allowedFormats = ['tiff', 'png', 'jpg'];
  if (!allowedFormats.includes(format)) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ success: false, message: '지원하지 않는 형식입니다.' });
  }

  // 압축 옵션
  //   - lzw   : 무손실, 호환성 최고 (기존 동작)
  //   - zip   : 무손실, LZW 보다 약간 작음
  //   - jpeg  : 손실, 컬러/그레이 스캔본에 5~10배 작음 (대부중개 문서 권장)
  //   - group4: 무손실 1-bit 흑백, 최강 압축 (자동 -monochrome 변환)
  //   - none  : 무압축 (PNG/JPG 출력 시 무시됨)
  const allowedComps = ['lzw', 'zip', 'jpeg', 'group4', 'none'];
  let compression = (req.body.compression || (format === 'tiff' ? 'lzw' : 'none')).toLowerCase();
  if (!allowedComps.includes(compression)) compression = 'lzw';
  const quality = Math.max(1, Math.min(100, parseInt(req.body.quality) || 80));

  // ImageMagick 준비 확인
  const { bin, mode } = await detectMagick();
  if (!bin) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(500).json({
      success: false,
      message: 'ImageMagick 이 설치돼 있지 않습니다. (sudo apt install imagemagick ghostscript)',
    });
  }

  // multer 임시파일은 확장자가 없어서 ImageMagick 포맷 감지가 불안정 → 원본 확장자로 rename
  const origName = req.file.originalname || 'input';
  const origExt = (path.extname(origName) || '').toLowerCase().replace('.', '');
  const knownExts = ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'gif', 'tif', 'tiff'];
  const safeExt = knownExts.includes(origExt) ? origExt : '';
  let inputPath = req.file.path;
  if (safeExt) {
    const renamed = inputPath + '.' + safeExt;
    try { fs.renameSync(inputPath, renamed); inputPath = renamed; } catch (e) {}
  }

  const outputPath = inputPath + '.out.' + format;

  // ImageMagick 실행 인자.
  //   - -density 는 PDF 래스터화 DPI 라서 입력 파일 앞에 둬야 PDF 에 적용됨.
  //   - TIFF 는 다중 페이지 지원이므로 여러 페이지 PDF 도 단일 TIFF 로 저장됨.
  //   - PNG/JPG 는 다중 페이지를 지원 못 해서 output-0.png 식으로 쪼개질 수 있음.
  const compMap = { lzw: 'LZW', zip: 'Zip', jpeg: 'JPEG', group4: 'Group4', none: 'None' };
  const args = ['-density', String(dpi), inputPath];

  if (format === 'tiff') {
    if (compression === 'group4') args.push('-monochrome');
    if (compression === 'jpeg') args.push('-quality', String(quality));
    args.push('-compress', compMap[compression]);
  } else if (format === 'jpg') {
    args.push('-quality', String(quality), '-compress', 'JPEG');
  } else {
    args.push('-compress', 'None');
  }
  args.push(outputPath);

  console.log('[doc-convert]', bin, args.join(' '));

  execFile(bin, args, { timeout: 120000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
    // 입력 파일 삭제
    try { fs.unlinkSync(inputPath); } catch (e) {}

    if (err) {
      try { fs.unlinkSync(outputPath); } catch (e) {}
      const msg = (stderr && stderr.toString().trim()) || err.message || '알 수 없는 오류';
      console.error('[doc-convert] 실패:', msg);

      // 자주 발생하는 오류에 대해 친절한 가이드 제공
      let hint = '';
      if (/not authorized|attempt to perform an operation not allowed/i.test(msg) && /pdf/i.test(msg)) {
        hint = '\n\n[해결] ImageMagick policy.xml 에서 PDF 가 차단돼 있습니다. 서버에서:\n' +
               'sudo sed -i \'s/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/\' /etc/ImageMagick-6/policy.xml';
      } else if (/no decode delegate|unable to open image/i.test(msg) && /pdf/i.test(msg)) {
        hint = '\n\n[해결] Ghostscript 미설치로 보입니다: sudo apt install ghostscript';
      } else if (/convert: command not found/i.test(msg)) {
        hint = '\n\n[해결] ImageMagick 미설치: sudo apt install imagemagick ghostscript';
      }

      return res.status(500).json({ success: false, message: '변환 실패: ' + msg + hint });
    }

    // 다중 페이지 PDF → PNG/JPG 로 변환하면 output-0.png / output-1.png 식으로
    // 파일이 나눠 떨어지므로 그 경우를 대비해 존재 확인
    if (!fs.existsSync(outputPath)) {
      const alt = fs.readdirSync(path.dirname(outputPath)).filter(f =>
        f.startsWith(path.basename(outputPath).replace(/\.[^.]+$/, '')) && f.endsWith('.' + format)
      );
      if (alt.length > 0) {
        // 첫 페이지만 반환 + 경고. 다중 페이지 PDF 는 TIFF 사용 권장.
        const first = path.join(path.dirname(outputPath), alt[0]);
        return sendAndCleanup(first, alt.map(f => path.join(path.dirname(outputPath), f)));
      }
      return res.status(500).json({ success: false, message: '변환 출력 파일을 찾을 수 없습니다.' });
    }

    return sendAndCleanup(outputPath, [outputPath]);

    function sendAndCleanup(filePath, allPaths) {
      const mimeMap = { tiff: 'image/tiff', png: 'image/png', jpg: 'image/jpeg' };
      const outName = origName.replace(/\.(pdf|jpg|jpeg|png|bmp|gif|tif|tiff)$/i, '') + '.' + format;
      res.setHeader('Content-Type', mimeMap[format] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('close', () => {
        for (const p of allPaths) { try { fs.unlinkSync(p); } catch (e) {} }
      });
      stream.on('error', () => {
        for (const p of allPaths) { try { fs.unlinkSync(p); } catch (e) {} }
        if (!res.headersSent) res.status(500).end();
      });
    }
  });
});

// 다중 TIFF → 단일 다중페이지 TIFF 합치기
// 클라이언트가 보낸 순서(files 필드 순서)대로 ImageMagick 에 입력하면
// TIFF 컨테이너 특성상 페이지가 그 순서대로 누적된다.
router.post('/doc-convert/merge-tif', upload.array('files', 100), async (req, res) => {
  const files = req.files || [];
  if (files.length < 2) {
    for (const f of files) { try { fs.unlinkSync(f.path); } catch (e) {} }
    return res.status(400).json({ success: false, message: '합칠 TIF 파일을 2개 이상 선택해주세요.' });
  }

  const { bin } = await detectMagick();
  if (!bin) {
    for (const f of files) { try { fs.unlinkSync(f.path); } catch (e) {} }
    return res.status(500).json({
      success: false,
      message: 'ImageMagick 이 설치돼 있지 않습니다. (sudo apt install imagemagick)',
    });
  }

  // multer 임시파일은 확장자 없음 → .tif 로 rename 해야 ImageMagick 이 포맷을 정확히 인식한다.
  const inputPaths = [];
  for (const f of files) {
    const renamed = f.path + '.tif';
    try { fs.renameSync(f.path, renamed); inputPaths.push(renamed); }
    catch (e) { inputPaths.push(f.path); }
  }

  const outputPath = path.join(os.tmpdir(), `merged-${Date.now()}-${Math.random().toString(36).slice(2)}.tif`);

  const allowedComps = ['lzw', 'zip', 'jpeg', 'group4', 'none'];
  let compression = (req.body.compression || 'lzw').toLowerCase();
  if (!allowedComps.includes(compression)) compression = 'lzw';
  const quality = Math.max(1, Math.min(100, parseInt(req.body.quality) || 80));
  const compMap = { lzw: 'LZW', zip: 'Zip', jpeg: 'JPEG', group4: 'Group4', none: 'None' };

  const args = [...inputPaths];
  if (compression === 'group4') args.push('-monochrome');
  if (compression === 'jpeg') args.push('-quality', String(quality));
  args.push('-compress', compMap[compression], outputPath);

  console.log('[doc-convert/merge-tif]', bin, `${inputPaths.length}개 파일 합치기 → ${outputPath}`);

  execFile(bin, args, { timeout: 180000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
    for (const p of inputPaths) { try { fs.unlinkSync(p); } catch (e) {} }

    if (err) {
      try { fs.unlinkSync(outputPath); } catch (e) {}
      const msg = (stderr && stderr.toString().trim()) || err.message || '알 수 없는 오류';
      console.error('[doc-convert/merge-tif] 실패:', msg);
      return res.status(500).json({ success: false, message: '합치기 실패: ' + msg });
    }

    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({ success: false, message: '병합 출력 파일을 찾을 수 없습니다.' });
    }

    const outName = `merged-${new Date().toISOString().slice(0,10)}.tif`;
    res.setHeader('Content-Type', 'image/tiff');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => { try { fs.unlinkSync(outputPath); } catch (e) {} });
    stream.on('error', () => {
      try { fs.unlinkSync(outputPath); } catch (e) {}
      if (!res.headersSent) res.status(500).end();
    });
  });
});

module.exports = router;
