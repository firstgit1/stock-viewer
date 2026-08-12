const BASE = 'https://stock.quicktiny.cn/api'

export async function searchStockBasic(query, limit = 20) {
  const url = `${BASE}/tushare/stock-basic/search?query=${encodeURIComponent(query)}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error('搜索接口返回失败')
  return json.data
}

/**
 * 批量分钟分时
 * @param {string[]} codes ts_code 或 symbol，如 ['600519.SH']
 */
export async function fetchStockMinuteBatch(codes) {
  const list = (codes || []).map((c) => String(c || '').trim()).filter(Boolean)
  if (!list.length) throw new Error('请提供代码列表')

  const res = await fetch(`${BASE}/tushare/stock-minute-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes: list }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.message || '分时接口返回失败')
  return json.data || {}
}

/**
 * 实时行情
 * @param {string[]} codes 如 ['sz002364'] 或 ['002364.SZ']
 */
export async function fetchRealtimeStocks(codes) {
  const list = (codes || []).map((c) => String(c || '').trim()).filter(Boolean)
  if (!list.length) throw new Error('请提供代码')
  const url = `${BASE}/realtime-stocks?codes=${encodeURIComponent(list.join(','))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** 002364.SZ / 600519.SH / 002364 → sz002364 / sh600519 */
export function toRealtimeCode(tsCodeOrSymbol) {
  const raw = String(tsCodeOrSymbol || '').trim()
  if (!raw) return ''
  if (/^(sh|sz|bj)\d{6}$/i.test(raw)) return raw.toLowerCase()

  const m = raw.toUpperCase().match(/^(\d{6})\.(SH|SZ|BJ)$/)
  if (m) {
    const map = { SH: 'sh', SZ: 'sz', BJ: 'bj' }
    return `${map[m[2]]}${m[1]}`
  }

  if (/^\d{6}$/.test(raw)) {
    if (raw.startsWith('6') || raw.startsWith('9')) return `sh${raw}`
    if (raw.startsWith('8') || raw.startsWith('4')) return `bj${raw}`
    return `sz${raw}`
  }
  return raw.toLowerCase()
}

/** 解析 trends 字符串：时间,开,高,低,收,量,额,均价 */
export function parseMinuteTrends(trends = []) {
  return trends
    .map((row) => {
      const parts = String(row).split(',')
      if (parts.length < 8) return null
      const [time, open, high, low, close, vol, amount, avg] = parts
      return {
        time,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        vol: Number(vol),
        amount: Number(amount),
        avg: Number(avg),
      }
    })
    .filter(Boolean)
}

/** A股分时：09:30-11:30 + 13:00-15:00（午休在轴上紧挨，共 242 个分钟点） */
const MINUTE_MORNING_START = 9 * 60 + 30
const MINUTE_MORNING_END = 11 * 60 + 30
const MINUTE_AFTERNOON_START = 13 * 60
const MINUTE_AFTERNOON_END = 15 * 60
export const MINUTE_MORNING_LEN = MINUTE_MORNING_END - MINUTE_MORNING_START + 1 // 121
export const MINUTE_AFTERNOON_LEN = MINUTE_AFTERNOON_END - MINUTE_AFTERNOON_START + 1 // 121
export const MINUTE_TOTAL_SLOTS = MINUTE_MORNING_LEN + MINUTE_AFTERNOON_LEN // 242

/** @param {string} timeStr 如 2026-08-12 10:35 或 10:35 */
export function minuteTimeToSlot(timeStr) {
  const m = String(timeStr || '').match(/(\d{1,2}):(\d{2})/)
  if (!m) return -1
  const mins = Number(m[1]) * 60 + Number(m[2])
  if (mins >= MINUTE_MORNING_START && mins <= MINUTE_MORNING_END) {
    return mins - MINUTE_MORNING_START
  }
  if (mins >= MINUTE_AFTERNOON_START && mins <= MINUTE_AFTERNOON_END) {
    return MINUTE_MORNING_LEN + (mins - MINUTE_AFTERNOON_START)
  }
  return -1
}

export function pickRealtimeQuote(map, ...keys) {
  if (!map || typeof map !== 'object') return null
  for (const key of keys) {
    if (key && map[key]) return map[key]
  }
  const values = Object.values(map)
  return values[0] || null
}

/** 002364.SZ → 0.002364；600519.SH → 1.600519 */
export function toEastmoneySecid(tsCodeOrSymbol) {
  const raw = String(tsCodeOrSymbol || '').trim().toUpperCase()
  const m = raw.match(/^(\d{6})\.(SH|SZ|BJ)$/)
  if (m) return `${m[2] === 'SH' ? 1 : 0}.${m[1]}`
  if (/^\d{6}$/.test(raw)) {
    return `${raw.startsWith('6') || raw.startsWith('9') ? 1 : 0}.${raw}`
  }
  const rt = toRealtimeCode(raw)
  const rm = rt.match(/^(sh|sz|bj)(\d{6})$/i)
  if (rm) return `${rm[1].toLowerCase() === 'sh' ? 1 : 0}.${rm[2]}`
  return ''
}

/**
 * 东方财富日K
 * klines: 日期,开,收,高,低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
 * @param {string} tsCodeOrSymbol
 * @param {number|{limit?:number,end?:string}} limitOrOpts end 形如 20230612
 */
export async function fetchDailyKline(tsCodeOrSymbol, limitOrOpts = 60) {
  const opts = typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts || {}
  const limit = opts.limit ?? 60
  const end = opts.end || '20500101'
  const secid = toEastmoneySecid(tsCodeOrSymbol)
  if (!secid) throw new Error('无法识别代码')
  const params = new URLSearchParams({
    secid,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
    klt: '101',
    fqt: '1',
    end,
    lmt: String(limit),
    _: String(Date.now()),
  })
  const res = await fetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.data?.klines) throw new Error('日K数据为空')
  return parseDailyKlines(json.data.klines)
}

/** 2026-05-19 → 20260518 */
export function prevTradeEndDate(dateStr) {
  const raw = String(dateStr || '').replaceAll('-', '')
  if (raw.length !== 8) return ''
  const d = new Date(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
  )
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function parseDailyKlines(klines = []) {
  return klines
    .map((row) => {
      const p = String(row).split(',')
      if (p.length < 11) return null
      return {
        date: p[0],
        open: Number(p[1]),
        close: Number(p[2]),
        high: Number(p[3]),
        low: Number(p[4]),
        vol: Number(p[5]),
        amount: Number(p[6]),
        amplitude: Number(p[7]),
        changePct: Number(p[8]),
        changeAmt: Number(p[9]),
        turnover: Number(p[10]),
      }
    })
    .filter(Boolean)
}

export function calcMA(list, period, key = 'close') {
  return list.map((_, i) => {
    if (i + 1 < period) return null
    let sum = 0
    for (let j = i - period + 1; j <= i; j += 1) sum += list[j][key]
    return sum / period
  })
}

/** @param {string} yyyymmdd */
export async function fetchLadderDay(yyyymmdd) {
  const url = `${BASE}/ladder/day/${yyyymmdd}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchCailianTelegraph(count = 100) {
  const url = `${BASE}/cailian-telegraph?count=${count}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.error !== 0 && json.error !== undefined) {
    throw new Error('电报接口返回失败')
  }
  return Array.isArray(json.data) ? json.data : []
}

/**
 * 交易所监控池
 * @param {'severe_abnormal'|'risk_warning'|string} type
 */
export async function fetchExchangeMonitorList(type = 'severe_abnormal') {
  const url = `${BASE}/ladder/exchange-monitor/list?type=${encodeURIComponent(type)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.message || '监控池接口返回失败')
  return {
    list: Array.isArray(json.data) ? json.data : [],
    stats: json.stats || null,
  }
}

/** Unix 秒时间戳 → HH:mm 或 MM-DD HH:mm */
export function formatUnixTime(sec) {
  const n = Number(sec)
  if (!n) return '-'
  const d = new Date(n * 1000)
  const pad = (x) => String(x).padStart(2, '0')
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay) return hm
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

export function toYyyymmdd(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export function yyyymmddToInput(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return ''
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

export function inputToYyyymmdd(inputValue) {
  return (inputValue || '').replaceAll('-', '')
}

export function formatYi(num) {
  if (num == null || Number.isNaN(Number(num))) return '-'
  return `${(Number(num) / 1e8).toFixed(2)}亿`
}

export function formatPct(num) {
  if (num == null || Number.isNaN(Number(num))) return '-'
  return `${Number(num).toFixed(2)}%`
}
