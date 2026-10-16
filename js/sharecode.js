'use strict';

/**
 * SHARE CODES (v15.3): a level, or a folder of levels, as one line of text that anyone can paste into their own
 * game. There is NO server: the code IS the level - packed, compressed and written in letters and digits - so it
 * works offline and depends on nobody. No UI, no DOM and no game state here: pure functions (the compression step
 * is async, because the browser's own compressor is), used by My Levels (js/mylevels.js) and the store
 * (js/levelstore.js importShared), and tested by tools/share-test.js. The format is written down in
 * docs/level-format.md ("Share codes").
 *
 *   ECHO1L<payload><check>      one level          ECHO1F<payload><check>      a folder of levels
 *   ^^^^ ^^ the format version (1) and what it holds (L / F)
 *
 * - <payload> is the packed data (below), with a first byte saying how it was compressed (0 none, 1 deflate),
 *   written in base 62 (0-9 A-Z a-z, 8 bytes to every 11 characters) - nothing a chat app turns into formatting,
 *   a link or a line break, and one "word", so a double-click selects all of it.
 * - <check> is 6 characters: a CRC-32 of the header and the payload, so a mistyped, cut-off or damaged code is
 *   caught before anything is read from it.
 * - A level holds ONLY what is needed to play it: its walls, start, ways out, monsters, objects, effects, title
 *   card, palette and difficulty, its title, and (if there is one) a creator name. Never an id, a date, a folder,
 *   anything from the player's save. So the same level always makes the same code (in the same browser - another
 *   browser's compressor may write an equivalent code that reads back to the same level).
 *
 * Reading a code treats it as data from a stranger: every size is capped before anything is allocated
 * (LIMITS), decompression stops at LIMITS.inflated (a small code that would expand to something huge is refused),
 * and what comes out goes through EchoLevelFormat.normalise and EchoLevelCheck like every other level. A code from
 * a newer version says so. Nothing here throws: every outcome is { ok: true, ... } or { ok: false, code, error }.
 *
 * Interface:
 *   encodeLevel(doc)           -> Promise<{ ok, code, chars } | { ok: false, code, error }>   (doc.authorName goes in)
 *   encodeFolder(name, docs)   -> the same, for a folder
 *   decode(text)               -> Promise<{ ok, kind: 'level' | 'folder', folderName, levels: [doc] } | { ok: false, code, error }>
 *   clean(text)                -> the code inside whatever was pasted (whitespace, line breaks, quotes, invisible
 *                                 characters gone) - or ''
 *   contentKey(doc)            -> a string that is the same for two levels with the same content (title, creator,
 *                                 ids and dates aside) - for "you already have this level"
 *   register(resolver)         -> a later way of reading codes: { id, versions: [n], resolve(cleaned, version, kind) }
 *                                 (e.g. short codes looked up online). Version 1 is resolved here, offline, forever.
 */
const EchoShare = (() => {
  const PREFIX = 'ECHO';
  const VERSION = 1;
  const KINDS = { L: 'level', F: 'folder' };
  const LIMITS = {
    codeChars: 32000, // the longest code made or read (characters, once cleaned)
    folderLevels: 20, // levels in one folder code
    inflated: 262144, // bytes a code may unpack to (a folder of 20 big levels is well under 100 KB)
    folderName: 32,
  };
  const CHECK_CHARS = 6;
  const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const CHARS_FOR = [0, 2, 3, 5, 6, 7, 9, 10, 11]; // base 62 characters for 0..8 bytes
  const METHOD = { stored: 0, deflate: 1 };

  /**
   * The words a code may hold, numbered - FROZEN for format 1: only ever add to the end of a list. 0 means "a word
   * not in the list follows" (so a newer game's new monster still has a name), and a number past the end of a list
   * means the code came from a newer version of the game.
   */
  const WORDS = {
    monster: ['echo', 'scent', 'mimic', 'stalker', 'muffler', 'singer', 'warden'],
    variant: ['-', 'regular', 'upgraded'], // ('-': none)
    object: ['puddle', 'decoy', 'key', 'note'],
    style: ['note', 'recording'],
    effect: ['light', 'glow'],
    shape: ['rect', 'circle'],
    colour: ['warm', 'cold', 'pale', 'red', 'crimson', 'ember'],
    intensity: ['dim', 'medium', 'bright'],
    palette: ['-', 'default', 'protan', 'tritan', 'contrast'], // ('-': the player's own)
    rating: ['easy', 'normal', 'hard', 'hardcore', 'custom'],
  };
  const TUNING_KEYS = ['monsterSpeed', 'rippleRange', 'hearing'];

  const ERR = {
    empty: 'Paste a code first.',
    notCode: "That doesn't look like an Echo Maze level code. A code starts with ECHO and a number, like ECHO1.",
    damaged: 'This code looks incomplete or damaged. Check that you copied all of it - it is one long line that starts with ECHO.',
    newer: 'This code was made in a newer version of Echo Maze. Update the game to open it.',
    tooBig: 'This code is too big to be an Echo Maze level code, so it was not read.',
    folderTooBig: `A folder code can hold at most ${LIMITS.folderLevels} levels.`,
  };
  const fail = (code, error) => ({ ok: false, code, error: error || ERR[code] || ERR.damaged });
  class Bad extends Error {
    constructor(code) {
      super(code);
      this.why = code;
    }
  }

  // ------------------------------------------------------------------ CRC-32
  let crcTable = null;
  function crc32(parts) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (const bytes of parts) for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const ascii = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);

  // ------------------------------------------------------------------ base 62 (8 bytes -> 11 characters)
  function toBase62(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 8) {
      const k = Math.min(8, bytes.length - i);
      let v = 0n;
      for (let j = 0; j < k; j++) v = (v << 8n) | BigInt(bytes[i + j]);
      let s = '';
      for (let c = 0; c < CHARS_FOR[k]; c++) {
        s = ALPHABET[Number(v % 62n)] + s;
        v /= 62n;
      }
      out += s;
    }
    return out;
  }
  function fromBase62(text) {
    const full = Math.floor(text.length / 11);
    const rest = text.length - full * 11;
    const restBytes = CHARS_FOR.indexOf(rest);
    if (restBytes < 0) throw new Bad('damaged'); // no number of bytes is written with this many characters
    const out = new Uint8Array(full * 8 + restBytes);
    let o = 0;
    for (let i = 0; i < text.length; ) {
      const k = i + 11 <= text.length ? 8 : restBytes;
      const n = CHARS_FOR[k];
      let v = 0n;
      for (let c = 0; c < n; c++) {
        const d = ALPHABET.indexOf(text[i + c]);
        if (d < 0) throw new Bad('damaged');
        v = v * 62n + BigInt(d);
      }
      if (v >> BigInt(8 * k)) throw new Bad('damaged'); // more than k bytes can hold: not something we wrote
      for (let j = k - 1; j >= 0; j--) {
        out[o + j] = Number(v & 0xffn);
        v >>= 8n;
      }
      o += k;
      i += n;
    }
    return out;
  }
  function checkChars(n) {
    let s = '';
    for (let c = 0; c < CHECK_CHARS; c++) {
      s = ALPHABET[n % 62] + s;
      n = Math.floor(n / 62);
    }
    return s;
  }

  // ------------------------------------------------------------------ packing (bytes in, bytes out)
  function writer() {
    let buf = new Uint8Array(256);
    let len = 0;
    const room = (n) => {
      if (len + n <= buf.length) return;
      let size = buf.length * 2;
      while (size < len + n) size *= 2;
      const b = new Uint8Array(size);
      b.set(buf.subarray(0, len));
      buf = b;
    };
    const w = {
      byte(v) {
        room(1);
        buf[len++] = v & 0xff;
      },
      uint(v) {
        // unsigned LEB128
        let n = Math.max(0, Math.floor(v));
        do {
          let b = n & 0x7f;
          n = Math.floor(n / 128);
          if (n) b |= 0x80;
          w.byte(b);
        } while (n);
      },
      bytes(b) {
        room(b.length);
        buf.set(b, len);
        len += b.length;
      },
      str(s) {
        const b = new TextEncoder().encode(s || '');
        w.uint(b.length);
        w.bytes(b);
      },
      word(list, v) {
        const i = list.indexOf(v);
        if (i >= 0) w.uint(i + 1);
        else {
          w.uint(0);
          w.str(String(v));
        }
      },
      done: () => buf.slice(0, len),
    };
    return w;
  }
  function reader(bytes) {
    let p = 0;
    const r = {
      byte() {
        if (p >= bytes.length) throw new Bad('damaged');
        return bytes[p++];
      },
      uint(max) {
        let v = 0;
        let mul = 1;
        for (let i = 0; i < 5; i++) {
          const b = r.byte();
          v += (b & 0x7f) * mul;
          if (!(b & 0x80)) {
            if (v > max) throw new Bad('damaged');
            return v;
          }
          mul *= 128;
        }
        throw new Bad('damaged');
      },
      bytes(n) {
        if (p + n > bytes.length) throw new Bad('damaged');
        const b = bytes.subarray(p, p + n);
        p += n;
        return b;
      },
      str(maxChars) {
        const n = r.uint(maxChars * 4); // (UTF-8: at most 4 bytes a character)
        try {
          return new TextDecoder('utf-8', { fatal: true }).decode(r.bytes(n));
        } catch (e) {
          if (e instanceof Bad) throw e;
          throw new Bad('damaged');
        }
      },
      word(list) {
        const i = r.uint(1000);
        if (i === 0) return r.str(32);
        if (i > list.length) throw new Bad('newer'); // a word added to the list after this version
        return list[i - 1];
      },
      end: () => p >= bytes.length,
    };
    return r;
  }

  const L = () => EchoLevelFormat.LIMITS;

  /** A (normalised) level -> its bytes. Only the level's content, its title and its creator name. */
  function packLevel(doc, w = writer()) {
    const { w: W, h: H } = doc.size;
    w.uint(doc.schemaVersion || EchoLevelFormat.SCHEMA_VERSION);
    w.str(doc.title || '');
    w.str(doc.authorName || '');
    w.uint(W);
    w.uint(H);
    const grid = EchoLevelFormat.wallGrid(doc);
    const bits = new Uint8Array(Math.ceil((W * H) / 8));
    for (let i = 0; i < W * H; i++) if (grid[i]) bits[i >> 3] |= 1 << (i & 7);
    w.bytes(bits);
    w.uint(doc.start ? 1 + doc.start.y * W + doc.start.x : 0);
    const exits = doc.exits || [];
    w.uint(exits.length);
    for (const e of exits) w.uint((e.y * W + e.x) * 2 + (e.locked ? 1 : 0));
    w.uint(doc.enemies.length);
    for (const m of doc.enemies) {
      w.word(WORDS.monster, m.kind);
      w.word(WORDS.variant, m.variant || '-');
      w.uint(m.y * W + m.x);
    }
    const objects = doc.objects || [];
    w.uint(objects.length);
    for (const o of objects) {
      w.word(WORDS.object, o.kind);
      w.uint(o.y * W + o.x);
      if (o.kind === 'note') {
        w.str(o.text || '');
        w.word(WORDS.style, o.style || 'note');
      }
    }
    const effects = doc.effects || [];
    w.uint(effects.length);
    for (const f of effects) {
      w.word(WORDS.effect, f.kind);
      w.word(WORDS.shape, f.shape);
      w.uint(f.x);
      w.uint(f.y);
      w.uint(f.w);
      w.uint(f.h);
      w.word(WORDS.colour, f.colour);
      w.word(WORDS.intensity, f.intensity);
    }
    w.str(doc.titleCard || '');
    w.word(WORDS.palette, doc.palette || '-');
    const d = doc.difficulty || { rating: 'normal' };
    w.word(WORDS.rating, d.rating);
    if (d.rating === 'custom') for (const k of TUNING_KEYS) w.uint(Math.round((d[k] || 1) * 100));
    return w;
  }

  /** Bytes -> a PLAIN level object (untrusted: the caller normalises it). Every count and size capped first. */
  function unpackLevel(r) {
    const lim = L();
    const schemaVersion = r.uint(1000);
    if (schemaVersion > EchoLevelFormat.SCHEMA_VERSION) throw new Bad('newer');
    const title = r.str(lim.title);
    const authorName = r.str(lim.author);
    const W = r.uint(lim.maxW);
    const H = r.uint(lim.maxH);
    if (W < lim.minW || H < lim.minH) throw new Bad('damaged');
    const bits = r.bytes(Math.ceil((W * H) / 8));
    const walls = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        row += bits[i >> 3] & (1 << (i & 7)) ? '#' : '.';
      }
      walls.push(row);
    }
    const at = (t) => ({ x: t % W, y: Math.floor(t / W) });
    const s = r.uint(W * H);
    const start = s ? at(s - 1) : null;
    const exits = [];
    const ne = r.uint(lim.exits);
    for (let i = 0; i < ne; i++) {
      const v = r.uint(W * H * 2 - 1);
      exits.push({ ...at(v >> 1), locked: (v & 1) === 1 });
    }
    const enemies = [];
    const nm = r.uint(lim.enemies);
    for (let i = 0; i < nm; i++) {
      const kind = r.word(WORDS.monster);
      const variant = r.word(WORDS.variant);
      const m = { kind, ...at(r.uint(W * H - 1)) };
      if (variant !== '-') m.variant = variant;
      enemies.push(m);
    }
    const objects = [];
    const no = r.uint(lim.objects);
    for (let i = 0; i < no; i++) {
      const kind = r.word(WORDS.object);
      const o = { kind, ...at(r.uint(W * H - 1)) };
      if (kind === 'note') {
        o.text = r.str(lim.noteText);
        o.style = r.word(WORDS.style);
      }
      objects.push(o);
    }
    const effects = [];
    const nf = r.uint(lim.effects);
    for (let i = 0; i < nf; i++) {
      const kind = r.word(WORDS.effect);
      const shape = r.word(WORDS.shape);
      const x = r.uint(W - 1);
      const y = r.uint(H - 1);
      const w = r.uint(W);
      const h = r.uint(H);
      effects.push({ kind, shape, x, y, w, h, colour: r.word(WORDS.colour), intensity: r.word(WORDS.intensity) });
    }
    const titleCard = r.str(lim.titleCard);
    const palette = r.word(WORDS.palette);
    const rating = r.word(WORDS.rating);
    const difficulty = { rating };
    if (rating === 'custom') for (const k of TUNING_KEYS) difficulty[k] = r.uint(1000) / 100;
    return { format: EchoLevelFormat.FORMAT, schemaVersion, title, authorName, size: { w: W, h: H }, walls, start, exits, enemies, objects, effects, titleCard, palette: palette === '-' ? '' : palette, difficulty };
  }

  // ------------------------------------------------------------------ compression
  let builtIn = true; // (tests switch it off to prove the fallback)
  const hasStreams = () => {
    if (!builtIn) return false;
    try {
      return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && !!new CompressionStream('deflate-raw');
    } catch (e) {
      return false;
    }
  };
  /** Through the browser's own (de)compressor. `cap`: stop - and fail - past this many bytes out. */
  async function viaStream(stream, bytes, cap) {
    const writer = stream.writable.getWriter();
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});
    const r = stream.readable.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      total += value.length;
      if (cap && total > cap) {
        r.cancel().catch(() => {});
        throw new Bad('tooBig');
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  /**
   * INFLATE (raw deflate, RFC 1951), for a browser without DecompressionStream - so every code can be read
   * everywhere. Small and strict: any malformed input, and any output past `cap` bytes, is refused.
   */
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function inflate(src, cap) {
    let out = new Uint8Array(1024);
    let len = 0;
    const put = (b) => {
      if (len >= cap) throw new Bad('tooBig');
      if (len === out.length) {
        const n = new Uint8Array(Math.min(out.length * 2, cap));
        n.set(out);
        out = n;
      }
      out[len++] = b;
    };
    let ip = 0;
    let bitbuf = 0;
    let bitcnt = 0;
    const bits = (n) => {
      while (bitcnt < n) {
        if (ip >= src.length) throw new Bad('damaged');
        bitbuf |= src[ip++] << bitcnt;
        bitcnt += 8;
      }
      const v = bitbuf & ((1 << n) - 1);
      bitbuf >>>= n;
      bitcnt -= n;
      return v;
    };
    const table = (lengths) => {
      const count = new Uint16Array(16);
      const symbol = new Uint16Array(lengths.length);
      for (const l of lengths) count[l]++;
      count[0] = 0;
      const offs = new Uint16Array(16);
      for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
      lengths.forEach((l, i) => {
        if (l) symbol[offs[l]++] = i;
      });
      return { count, symbol };
    };
    const sym = (t) => {
      let code = 0;
      let first = 0;
      let index = 0;
      for (let l = 1; l < 16; l++) {
        code |= bits(1);
        const c = t.count[l];
        if (code - c < first) return t.symbol[index + (code - first)];
        index += c;
        first = (first + c) << 1;
        code <<= 1;
      }
      throw new Bad('damaged');
    };
    let fixed = null;
    let last = 0;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0;
        bitcnt = 0;
        if (ip + 4 > src.length) throw new Bad('damaged');
        const n = src[ip] | (src[ip + 1] << 8);
        const nn = src[ip + 2] | (src[ip + 3] << 8);
        ip += 4;
        if (n !== (~nn & 0xffff) || ip + n > src.length) throw new Bad('damaged');
        for (let i = 0; i < n; i++) put(src[ip++]);
        continue;
      }
      let lit;
      let dist;
      if (type === 1) {
        if (!fixed) {
          const l = [];
          for (let i = 0; i < 288; i++) l.push(i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8);
          fixed = { lit: table(l), dist: table(new Array(30).fill(5)) };
        }
        lit = fixed.lit;
        dist = fixed.dist;
      } else if (type === 2) {
        const nlen = bits(5) + 257;
        const ndist = bits(5) + 1;
        const ncode = bits(4) + 4;
        if (nlen > 286 || ndist > 30) throw new Bad('damaged');
        const cl = new Array(19).fill(0);
        for (let i = 0; i < ncode; i++) cl[CL_ORDER[i]] = bits(3);
        const clt = table(cl);
        const lengths = [];
        while (lengths.length < nlen + ndist) {
          const s = sym(clt);
          if (s < 16) lengths.push(s);
          else {
            let rep = 0;
            let val = 0;
            if (s === 16) {
              if (!lengths.length) throw new Bad('damaged');
              val = lengths[lengths.length - 1];
              rep = 3 + bits(2);
            } else if (s === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (lengths.length + rep > nlen + ndist) throw new Bad('damaged');
            for (let i = 0; i < rep; i++) lengths.push(val);
          }
        }
        lit = table(lengths.slice(0, nlen));
        dist = table(lengths.slice(nlen));
      } else throw new Bad('damaged');
      for (;;) {
        const s = sym(lit);
        if (s < 256) put(s);
        else if (s === 256) break;
        else {
          const li = s - 257;
          if (li >= 29) throw new Bad('damaged');
          const n = LBASE[li] + bits(LEXT[li]);
          const di = sym(dist);
          if (di >= 30) throw new Bad('damaged');
          const back = DBASE[di] + bits(DEXT[di]);
          if (back > len) throw new Bad('damaged');
          for (let i = 0; i < n; i++) put(out[len - back]);
        }
      }
    } while (!last);
    return out.slice(0, len);
  }

  async function compress(bytes) {
    if (hasStreams()) {
      try {
        const z = await viaStream(new CompressionStream('deflate-raw'), bytes, 0);
        if (z.length < bytes.length) return { method: METHOD.deflate, data: z };
      } catch (e) {
        /* fall through: stored */
      }
    }
    return { method: METHOD.stored, data: bytes };
  }
  async function decompress(method, data) {
    if (method === METHOD.stored) {
      if (data.length > LIMITS.inflated) throw new Bad('tooBig');
      return data;
    }
    if (method !== METHOD.deflate) throw new Bad('newer');
    if (hasStreams()) {
      try {
        return await viaStream(new DecompressionStream('deflate-raw'), data, LIMITS.inflated);
      } catch (e) {
        if (e instanceof Bad) throw e;
        throw new Bad('damaged');
      }
    }
    return inflate(data, LIMITS.inflated);
  }

  // ------------------------------------------------------------------ writing a code
  async function wrap(kindLetter, bytes) {
    const z = await compress(bytes);
    const payload = new Uint8Array(z.data.length + 1);
    payload[0] = z.method;
    payload.set(z.data, 1);
    const head = `${PREFIX}${VERSION}${kindLetter}`;
    const code = head + toBase62(payload) + checkChars(crc32([ascii(head), payload]));
    if (code.length > LIMITS.codeChars) return fail('tooLong', `It would be ${code.length.toLocaleString('en-GB')} characters long - more than a code can be (${LIMITS.codeChars.toLocaleString('en-GB')}).`);
    return { ok: true, code, chars: code.length };
  }
  const shareable = (doc) => !!doc && !!doc.size && Array.isArray(doc.walls);

  async function encodeLevel(doc) {
    try {
      if (!shareable(doc)) return fail('damaged', 'This level could not be read.');
      return await wrap('L', packLevel(doc).done());
    } catch (e) {
      return fail('damaged', 'This level could not be turned into a code.');
    }
  }
  async function encodeFolder(name, docs) {
    try {
      if (!Array.isArray(docs) || !docs.length) return fail('empty', 'There are no levels to share.');
      if (docs.length > LIMITS.folderLevels) return fail('folderTooBig');
      const w = writer();
      w.str(cleanName(name) || 'Shared levels');
      w.uint(docs.length);
      for (const d of docs) {
        if (!shareable(d)) return fail('damaged', 'One of these levels could not be read.');
        const b = packLevel(d).done();
        w.uint(b.length);
        w.bytes(b);
      }
      return await wrap('F', w.done());
    } catch (e) {
      return fail('damaged', 'This folder could not be turned into a code.');
    }
  }

  // ------------------------------------------------------------------ reading a code
  const INVISIBLE = /[\s­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ]/g;
  /** The code inside whatever was pasted: from "ECHO" on, letters and digits only. '' if there is no "ECHO" + digit. */
  function clean(text) {
    if (typeof text !== 'string') return '';
    const t = text.length > LIMITS.codeChars * 4 ? text.slice(0, LIMITS.codeChars * 4) : text; // (never work on a novel)
    const squeezed = t.replace(INVISIBLE, '');
    const at = squeezed.search(/echo\d/i);
    if (at < 0) return '';
    return squeezed.slice(at).replace(/[^0-9A-Za-z]/g, '');
  }
  const cleanName = (s) => {
    const n = EchoLevelFormat.cleanShown(s, LIMITS.folderName);
    return n;
  };

  /** Everything after the header of a version 1 code -> { kind, folderName, levels (plain, untrusted) }. */
  async function readV1(code, head, kindLetter) {
    const body = code.slice(head.length);
    if (body.length < CHECK_CHARS + 2) throw new Bad('damaged');
    const payloadText = body.slice(0, body.length - CHECK_CHARS);
    const check = body.slice(body.length - CHECK_CHARS);
    const payload = fromBase62(payloadText);
    if (!payload.length || checkChars(crc32([ascii(head), payload])) !== check) throw new Bad('damaged');
    const bytes = await decompress(payload[0], payload.subarray(1));
    const r = reader(bytes);
    if (kindLetter === 'L') {
      const lv = unpackLevel(r);
      if (!r.end()) throw new Bad('damaged');
      return { kind: 'level', folderName: '', levels: [lv] };
    }
    const folderName = r.str(LIMITS.folderName);
    const n = r.uint(LIMITS.folderLevels + 1);
    if (n < 1) throw new Bad('damaged');
    if (n > LIMITS.folderLevels) throw new Bad('folderTooBig');
    const levels = [];
    for (let i = 0; i < n; i++) {
      const size = r.uint(bytes.length);
      const one = reader(r.bytes(size));
      levels.push(unpackLevel(one));
      if (!one.end()) throw new Bad('damaged');
    }
    if (!r.end()) throw new Bad('damaged');
    return { kind: 'folder', folderName, levels };
  }

  /** The ways of reading codes, by format version (v1 is this file's own; a later one can be registered). */
  const resolvers = [{ id: 'offline-v1', versions: [1], resolve: (code, version, kindLetter, head) => readV1(code, head, kindLetter) }];
  function register(resolver) {
    if (!resolver || typeof resolver.resolve !== 'function' || !Array.isArray(resolver.versions)) return false;
    resolvers.push(resolver);
    return true;
  }

  /**
   * Read a pasted code. -> { ok: true, kind, folderName, levels: [normalised doc] } with every level checked and
   * playable - or { ok: false, code, error } with a sentence for the player. Never throws, never saves anything.
   */
  async function decode(text) {
    try {
      if (typeof text !== 'string' || !text.trim()) return fail('empty');
      const code = clean(text);
      if (!code) return fail('notCode');
      if (code.length > LIMITS.codeChars) return fail('tooBig');
      const m = /^ECHO(\d{1,4})([A-Za-z])/i.exec(code);
      if (!m) return fail('notCode');
      const version = Number(m[1]);
      const kindLetter = m[2].toUpperCase();
      const head = `${PREFIX}${m[1]}${kindLetter}`; // (the check covers the header as written: ECHO upper-case)
      const resolver = resolvers.find((r) => r.versions.includes(version));
      if (!resolver) return version > VERSION ? fail('newer') : fail('damaged');
      if (!KINDS[kindLetter]) return fail('damaged');
      const raw = await resolver.resolve(code, version, kindLetter, head);
      return finish(raw);
    } catch (e) {
      return fail(e instanceof Bad ? e.why : 'damaged');
    }
  }

  /** What a resolver read -> real levels: cleaned, normalised, checked. One bad level refuses the whole code. */
  function finish(raw) {
    const levels = [];
    const many = raw.levels.length > 1 || raw.kind === 'folder';
    for (let i = 0; i < raw.levels.length; i++) {
      const lv = raw.levels[i];
      // shown text is cleaned before anything else sees it (normalise cleans the notes and the card itself)
      lv.title = EchoLevelFormat.cleanShown(lv.title, EchoLevelFormat.LIMITS.title) || EchoLevelFormat.DEFAULT_TITLE;
      lv.authorName = EchoLevelFormat.cleanShown(lv.authorName, EchoLevelFormat.LIMITS.author);
      const read = EchoLevelFormat.normalise(lv);
      const which = many ? `Level ${i + 1} in this code${read.doc ? ` ("${read.doc.title}")` : ''}` : 'The level in this code';
      if (!read.doc) return fail('damaged');
      if (read.foreign || read.newer) return fail('newer');
      const verdict = EchoLevelCheck.check(read.doc);
      if (!verdict.playable) return fail('unplayable', `${which} can't be played: ${verdict.errors[0].text}${many ? ' Nothing was imported.' : ''}`);
      levels.push(read.doc);
    }
    return { ok: true, kind: raw.kind, folderName: raw.kind === 'folder' ? cleanName(raw.folderName) || 'Shared levels' : '', levels };
  }

  /** The same for two levels with the same content: walls, things, settings - not the title, creator, id or dates. */
  function contentKey(doc) {
    try {
      const b = packLevel({ ...doc, title: '', authorName: '' }).done();
      let s = '';
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return s;
    } catch (e) {
      return '';
    }
  }

  return {
    PREFIX,
    VERSION,
    LIMITS,
    ERR,
    encodeLevel,
    encodeFolder,
    decode,
    clean,
    contentKey,
    register,
    resolvers: () => resolvers.slice(),
    // for tests (tools/share-test.js): the parts on their own
    _: { packLevel: (d) => packLevel(d).done(), wrap, toBase62, fromBase62, crc32, inflate, compress, decompress, checkChars, useBuiltIn: (on) => (builtIn = !!on), hasStreams: () => hasStreams(), writer },
  };
})();
