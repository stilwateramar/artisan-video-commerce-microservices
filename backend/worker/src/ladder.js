// HLS ladder with fMP4 segments. The lowest rung has to stay under 50 kbps in total
// (video + audio + container overhead): 22 kbps H.264 baseline at 144p/12 fps leaves
// room for 12 kbps Opus mono, which still sounds clear for speech. Every rung uses
// closed 4-second GOPs so players can switch rendition at any segment boundary.
export const SEGMENT_SECONDS = 4;

export const LADDER = [
  { name: '144p', short: 144, fps: 12, vKbps: 22, vMax: 26, aKbps: 12, preset: 'slow' },
  { name: '240p', short: 240, fps: 15, vKbps: 110, vMax: 130, aKbps: 24, preset: 'medium' },
  { name: '360p', short: 360, fps: 24, vKbps: 350, vMax: 420, aKbps: 32, preset: 'veryfast' },
  { name: '720p', short: 720, fps: 24, vKbps: 1400, vMax: 1700, aKbps: 64, preset: 'veryfast' },
];

// Scale by the short side so portrait phone videos get the same resolution as landscape.
function scaleExpr(short) {
  return `scale='if(gt(iw,ih),-2,${short})':'if(gt(iw,ih),${short},-2)'`;
}

// Produces outDir/master.m3u8 plus outDir/<rung>/index.m3u8, init_N.mp4 and seg_NNNNN.m4s.
export function buildFfmpegArgs({ input, outDir, hasAudio, audioCodec = 'libopus' }) {
  const n = LADDER.length;
  const split = `[0:v]split=${n}` + LADDER.map((_, i) => `[s${i}]`).join('');
  const chains = LADDER.map((r, i) => `[s${i}]${scaleExpr(r.short)},fps=${r.fps},format=yuv420p[v${i}]`);
  const args = ['-hide_banner', '-y', '-i', input, '-filter_complex', [split, ...chains].join(';')];

  LADDER.forEach((r, i) => {
    args.push('-map', `[v${i}]`);
    if (hasAudio) args.push('-map', '0:a:0');
  });

  LADDER.forEach((r, i) => {
    args.push(
      `-c:v:${i}`,
      'libx264',
      `-profile:v:${i}`,
      i === 0 ? 'baseline' : 'main',
      `-preset:v:${i}`,
      r.preset,
      `-b:v:${i}`,
      `${r.vKbps}k`,
      `-maxrate:v:${i}`,
      `${r.vMax}k`,
      `-bufsize:v:${i}`,
      `${r.vMax * 2}k`,
    );
    if (hasAudio) {
      args.push(`-c:a:${i}`, audioCodec, `-b:a:${i}`, `${r.aKbps}k`, `-ac:a:${i}`, i < 2 ? '1' : '2');
      if (audioCodec === 'libopus') args.push(`-application:a:${i}`, i < 2 ? 'voip' : 'audio');
    }
  });

  args.push(
    '-force_key_frames',
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    '-sc_threshold',
    '0',
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_flags',
    'independent_segments',
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_segment_filename',
    `${outDir}/%v/seg_%05d.m4s`,
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    LADDER.map((r, i) => (hasAudio ? `v:${i},a:${i},name:${r.name}` : `v:${i},name:${r.name}`)).join(' '),
    `${outDir}/%v/index.m3u8`,
  );
  return args;
}

// A 5-15 KB poster lets product cards render before any video loads on a slow link.
export function buildThumbnailArgs({ input, outFile, atSeconds = 2 }) {
  return [
    '-hide_banner',
    '-y',
    '-ss',
    String(atSeconds),
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    `${scaleExpr(360)}`,
    '-q:v',
    '6',
    outFile,
  ];
}
