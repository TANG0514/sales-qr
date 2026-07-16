'use strict';
/*
 * 存储抽象层
 * - 配置了 Vercel KV（KV_REST_API_URL + KV_REST_API_TOKEN）时使用 Vercel KV（持久化，生产用）
 * - 否则降级为进程内内存（仅本地/演示，重启即清空，不持久）
 * 对外暴露统一的 Redis 风格接口：get/set/sadd/smembers/hset/hget/hgetall/del
 */

// 内存版 KV（降级用）
class MemKV {
  constructor() {
    this.data = new Map();
    this.sets = new Map();
    this.hashes = new Map();
  }
  async get(k) { return this.data.has(k) ? this.data.get(k) : null; }
  async set(k, v) { this.data.set(k, v); return 'OK'; }
  async sadd(k, ...vs) {
    if (!this.sets.has(k)) this.sets.set(k, new Set());
    let n = 0;
    vs.forEach(v => { if (!this.sets.get(k).has(v)) { this.sets.get(k).add(v); n++; } });
    return n;
  }
  async smembers(k) { return this.sets.has(k) ? Array.from(this.sets.get(k)) : []; }
  async hset(k, obj) {
    if (!this.hashes.has(k)) this.hashes.set(k, {});
    Object.assign(this.hashes.get(k), obj);
    return 1;
  }
  async hget(k, f) { const h = this.hashes.get(k); return (h && h[f] !== undefined) ? h[f] : null; }
  async hgetall(k) { const h = this.hashes.get(k); return h ? Object.assign({}, h) : {}; }
  async del(k) { this.data.delete(k); this.sets.delete(k); this.hashes.delete(k); return 1; }
}

let kv;
let mode = 'memory';
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    kv = require('@vercel/kv').kv;
    mode = 'vercel-kv';
  } catch (e) {
    kv = new MemKV();
    mode = 'memory-fallback';
    console.warn('[store] Vercel KV 未安装，已降级为内存存储（不持久）');
  }
} else {
  kv = new MemKV();
  mode = 'memory';
}

console.log(`[store] storage mode = ${mode}`);
module.exports = { kv, mode };
