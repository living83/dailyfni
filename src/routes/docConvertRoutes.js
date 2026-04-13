const express = require('express');
const router = express.Router();
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

router.post('/doc-convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '파일이 없습니다.' });
  }

  const dpi = parseInt(req.body.dpi) || 300;
  const format = (req.body.format || 'tiff').toLowerCase();
  const allowedFormats = ['tiff', 'png', 'jpg'];
  if (!allowedFormats.includes(format)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, message: '지원하지 않는 형식입니다.' });
  }

  const inputPath = req.file.path;
  const outputPath = inputPath + '.' + format;

  const args = [
    '-density', String(dpi),
    inputPath,
    '-compress', format === 'tiff' ? 'LZW' : 'None',
    outputPath
  ];

  execFile('convert', args, { timeout: 60000 }, (err, stdout, stderr) => {
    // 입력 파일 삭제
    try { fs.unlinkSync(inputPath); } catch (e) {}

    if (err) {
      try { fs.unlinkSync(outputPath); } catch (e) {}
      return res.status(500).json({ success: false, message: '변환 실패: ' + (stderr || err.message) });
    }

    // 출력 파일 전송 후 삭제
    const mimeMap = { tiff: 'image/tiff', png: 'image/png', jpg: 'image/jpeg' };
    const origName = (req.file.originalname || 'output').replace(/\.(pdf|jpg|jpeg|png|bmp|gif)$/i, '') + '.' + format;

    res.setHeader('Content-Type', mimeMap[format] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(origName)}"`);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => {
      try { fs.unlinkSync(outputPath); } catch (e) {}
    });
    stream.on('error', () => {
      try { fs.unlinkSync(outputPath); } catch (e) {}
      res.status(500).end();
    });
  });
});

module.exports = router;
