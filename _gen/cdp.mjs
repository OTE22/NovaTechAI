/* Minimal Chrome DevTools Protocol driver (Node 22+ built-in WebSocket, no deps).
   Used only for local verification; not part of the deployed site. */

const HOST = "http://127.0.0.1:9222";

export async function newTab() {
  const res = await fetch(`${HOST}/json/new?about:blank`, { method: "PUT" });
  return res.json();
}

export async function closeTab(id) {
  await fetch(`${HOST}/json/close/${id}`);
}

export class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    return new Session(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  once(method) {
    return new Promise((resolve) => {
      const fn = (params) => {
        const arr = this.handlers.get(method);
        arr.splice(arr.indexOf(fn), 1);
        resolve(params);
      };
      this.on(method, fn);
    });
  }

  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + expression);
    return r.result.value;
  }

  close() {
    this.ws.close();
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
