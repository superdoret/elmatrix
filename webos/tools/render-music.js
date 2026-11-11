// Renders the bundled background music: assets/music/ambient.mp3 and assets/music/christmas.mp3.
// Pure-JS synthesis (tools/lib/offline-synth.js) -> temp WAV -> ffmpeg (libmp3lame, 64 kbps mono).
// Usage: node tools/render-music.js   (or: npm run render-music). Needs ffmpeg only here, never for `npm run build`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('./lib/offline-synth.js');

const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
if (ffmpeg.error || ffmpeg.status !== 0) {
  console.error('ffmpeg was not found in PATH. Install it (for example: sudo apt install ffmpeg or brew install ffmpeg) and run again.');
  console.error('The committed MP3 files in assets/music/ are enough to build the app; this tool is only for re-rendering them.');
  process.exit(1);
}

const outDir = path.join(__dirname, '..', 'assets', 'music');
fs.mkdirSync(outDir, { recursive: true });
const JOBS = [
  { name: 'ambient', seed: 20261, minSeconds: 270 },
  { name: 'christmas', seed: 20262, minSeconds: 240 }
];

for (const job of JOBS) {
  const t0 = Date.now();
  const plan = S.planTrack(job.name, job.seed, job.minSeconds);
  console.log(`${job.name}: ${plan.blocks.length} blocks, ${plan.total.toFixed(1)} s ... rendering`);
  const pcm = S.render(plan);
  const wav = path.join(os.tmpdir(), `elmatrix-${job.name}-${process.pid}.wav`);
  fs.writeFileSync(wav, S.toWav16(pcm, S.SR));
  const mp3 = path.join(outDir, `${job.name}.mp3`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ar', String(S.SR), '-ac', '1', '-map_metadata', '-1', '-id3v2_version', '0', '-write_xing', '1', mp3], { encoding: 'utf8' });
  fs.rmSync(wav, { force: true });
  if (r.status !== 0) { console.error('ffmpeg failed:', r.stderr); process.exit(1); }
  console.log(`  wrote ${path.relative(process.cwd(), mp3)} (${(fs.statSync(mp3).size / 1024).toFixed(0)} KB) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
