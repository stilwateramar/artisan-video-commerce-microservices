// One JSON object per line, which Cloud Logging parses into structured entries.
function write(severity, message, fields) {
  const entry = { severity, message, service: process.env.K_SERVICE || process.env.SERVICE_NAME, ...fields };
  (severity === 'ERROR' ? console.error : console.log)(JSON.stringify(entry));
}

export const log = {
  info: (message, fields) => write('INFO', message, fields),
  warn: (message, fields) => write('WARNING', message, fields),
  error: (message, fields) => write('ERROR', message, fields),
};
