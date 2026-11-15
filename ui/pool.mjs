import { Worker } from 'node:worker_threads';

const WORKER_URL = new URL('./worker.mjs', import.meta.url);

export class QueueFullError extends Error {
  constructor() { super('Die Render-Warteschlange ist voll, versuch es gleich noch einmal'); this.code = 'QUEUE_FULL'; }
}
export class AbortError extends Error {
  constructor() { super('abgebrochen'); this.code = 'ABORTED'; }
}

export class Pool {
  constructor(size, { timeoutMs = 60000, maxQueue = 256 } = {}) {
    this.size = Math.max(1, size);
    this.timeoutMs = timeoutMs;
    this.maxQueue = maxQueue;
    this.queue = [];
    this.workers = new Set();
    this.generation = 0;
    for (let i = 0; i < this.size; i++) this.spawn();
  }

  spawn() {
    const w = new Worker(WORKER_URL);
    w.job = null;
    w.gen = this.generation;
    w.dead = false;
    w.on('message', (msg) => {
      const job = w.job;
      w.job = null;
      if (job) {
        clearTimeout(job.timer);
        if (msg.error) job.reject(new Error(msg.error));
        else job.resolve(msg);
      }
      if (w.gen !== this.generation) this.retire(w);
      this.next();
    });
    const fail = (err) => {
      if (w.dead) return;
      const job = w.job;
      w.job = null;
      this.retire(w);
      if (job) {
        clearTimeout(job.timer);
        job.reject(err instanceof Error ? err : new Error(`Worker beendet (${err})`));
      }
      this.next();
    };
    w.on('error', fail);
    w.on('exit', (code) => fail(code));
    this.workers.add(w);
    return w;
  }

  retire(w) {
    if (w.dead) return;
    w.dead = true;
    this.workers.delete(w);
    w.terminate().catch(() => {});
    if (!this.closed) this.spawn();
  }

  // Fresh workers re-import every module, so edits to instruments take effect.
  recycle() {
    this.generation++;
    for (const w of [...this.workers]) if (!w.job) this.retire(w);
  }

  // An aborted signal drops the job while it still waits; a job already running finishes.
  run(task, { timeoutMs = this.timeoutMs, signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(new AbortError());
      if (this.queue.length >= this.maxQueue) return reject(new QueueFullError());
      const job = { task, resolve, reject, timeoutMs };
      if (signal) {
        const onAbort = () => {
          const i = this.queue.indexOf(job);
          if (i >= 0) { this.queue.splice(i, 1); reject(new AbortError()); }
        };
        signal.addEventListener('abort', onAbort, { once: true });
        job.resolve = (v) => { signal.removeEventListener('abort', onAbort); resolve(v); };
        job.reject = (e) => { signal.removeEventListener('abort', onAbort); reject(e); };
      }
      this.queue.push(job);
      this.next();
    });
  }

  next() {
    for (const w of this.workers) {
      if (!this.queue.length) return;
      if (w.job || w.dead) continue;
      const job = this.queue.shift();
      w.job = job;
      job.timer = setTimeout(() => {
        w.job = null;
        this.retire(w);
        job.reject(new Error(`Zeitüberschreitung nach ${job.timeoutMs / 1000} s`));
        this.next();
      }, job.timeoutMs);
      w.postMessage(job.task);
    }
  }

  get pending() { return this.queue.length; }

  async close() {
    this.closed = true;
    for (const job of this.queue) job.reject(new Error('Server wird beendet'));
    this.queue = [];
    await Promise.all([...this.workers].map((w) => { w.dead = true; return w.terminate(); }));
  }
}
