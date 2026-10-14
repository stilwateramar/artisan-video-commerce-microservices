// HTTP/HTTPS proxy that limits all traffic through it to a fixed bandwidth, shared
// across connections like a real slow link, and logs throughput every 10 seconds.
//
//   node tools/throttle-proxy.mjs [kbps=40] [port=8899]
//   adb shell settings put global http_proxy 10.0.2.2:8899   # route the emulator through it
//   adb shell settings put global http_proxy :0              # undo
//
// We use this instead of `adb emu network speed`: recent emulators route traffic over
// virtual Wi-Fi, which that command does not throttle, and Android marks a throttled
// mobile link as unvalidated.
import http from 'node:http';
import net from 'node:net';

const KBPS = Number(process.argv[2] || 40);
const PORT = Number(process.argv[3] || 8899);
const BYTES_PER_SEC = (KBPS * 1000) / 8;
const TICK_MS = 50;

function makeLink() {
  const queue = [];
  let allowance = 0;
  let sent = 0;
  setInterval(() => {
    allowance = Math.min(allowance + (BYTES_PER_SEC * TICK_MS) / 1000, BYTES_PER_SEC / 4);
    while (queue.length && allowance >= 1) {
      const item = queue[0];
      if (item.socket.destroyed) {
        queue.shift();
        continue;
      }
      const n = Math.min(item.buf.length, Math.floor(allowance));
      item.socket.write(item.buf.subarray(0, n));
      item.buf = item.buf.subarray(n);
      allowance -= n;
      sent += n;
      if (!item.buf.length) {
        queue.shift();
        item.done?.();
      }
    }
  }, TICK_MS).unref?.();
  return {
    pipe(from, to) {
      from.on('data', (buf) => {
        from.pause();
        queue.push({ socket: to, buf, done: () => from.resume() });
      });
      from.on('end', () => to.end());
      from.on('error', () => to.destroy());
      to.on('error', () => from.destroy());
    },
    take() {
      const s = sent;
      sent = 0;
      return s;
    },
  };
}

const down = makeLink();
const up = makeLink();

// Only HTTPS (CONNECT) is proxied; the API and media are HTTPS-only.
const server = http.createServer((_req, res) => res.writeHead(405).end());

server.on('connect', (req, client, head) => {
  const [host, port] = req.url.split(':');
  const upstream = net.connect(Number(port || 443), host, () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) upstream.write(head);
    up.pipe(client, upstream);
    down.pipe(upstream, client);
  });
  upstream.on('error', () => client.destroy());
  client.on('error', () => upstream.destroy());
});

server.listen(PORT, () => console.log(`throttle-proxy: ${KBPS} kbps down/up on :${PORT}`));

let t = 0;
setInterval(() => {
  t += 10;
  const d = down.take(),
    u = up.take();
  if (d || u)
    console.log(
      `+${t}s  down ${((d * 8) / 10 / 1000).toFixed(1)} kbps  up ${((u * 8) / 10 / 1000).toFixed(1)} kbps`,
    );
}, 10_000);
