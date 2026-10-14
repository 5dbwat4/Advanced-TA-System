/* 首屏加载器（构建时独立成一个已 minify 的 hashed 文件，由 index.html 以 <script src> 引入）。
 *
 * 流程：
 * 1. 标题：无 Service Worker 时「正在加载 Service Worker」（并触发浏览器检查/更新 sw.js），已有则「正在更新 Manifest」。
 * 2. 注册 Service Worker 并等待就绪。
 * 3. 拉取 manifest.json（同版本，由 SW 以 cache-first 提供）。
 * 4. 交给 SW 预缓存：SW 先算出需要更新的资源（未命中缓存）并通过 postMessage 回传 plan；
 *    页面据此展示列表与进度条，只有确实要下载的资源才出现，下载完成即从列表移除。
 * 5. 全部就绪后注入样式表与入口脚本，进入页面逻辑；失败可重试。
 * 6. 不支持 Service Worker 时回退为页面内直接 fetch。
 */
(function () {
  var BASE = '__BASE_URL__'
  var MANIFEST_URL = BASE + 'manifest.json'
  var WORKER_URL = BASE + 'sw.js'
  var CONCURRENCY = 6
  var TIMEOUT_MS = 45000

  var TITLE_WAIT = '这个阶段，人们通常会绞尽脑汁写一些笑话写上去，避免用户因为FMP过高而退出……'
  var TITLE_DOWNLOAD =
    '你知道吗，仍然有很多游戏会使用闪断更新+补偿这一方式，即使热更新完全是可行的……我们选择了闪断更新且没有补偿的方案，并且还要加上绞尽脑汁写的变质笑话'
  var TITLE_READY = 'Ready.'

  var workerSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.serviceWorker &&
    typeof navigator.serviceWorker.register === 'function' &&
    typeof MessageChannel === 'function'

  var shell = document.getElementById('pb-shell')
  var titleEl = document.getElementById('pb-title')
  var listEl = document.getElementById('pb-list')
  var railEl = document.getElementById('pb-grail')
  var gfillEl = document.getElementById('pb-gfill')
  var retryBtn = document.getElementById('pb-retry')

  var items = []
  var byUrl = {}
  var manifest = null
  var single = false
  var booted = false
  var rafId = 0
  var dirty = false

  function setTitle(text) {
    if (titleEl) titleEl.textContent = text
  }

  setTitle(TITLE_WAIT)

  function fmtBytes(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(2) + ' MB'
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
    return Math.round(n) + ' B'
  }

  function fmtSpeed(bps) {
    if (bps >= 1048576) return (bps / 1048576).toFixed(2) + ' MB/s'
    if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
    return Math.max(0, bps).toFixed(0) + ' B/s'
  }

  function scheduleRender() {
    if (dirty || rafId || !shell) return
    dirty = true
    rafId = requestAnimationFrame(render)
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  // 文件名形如 `name.[hash].ext`：把倒数第二段（hash）渲染成灰色。
  function setRowName(el, url) {
    var file = url.split('/').pop()
    var segments = file.split('.')
    if (segments.length >= 3) {
      var hashIndex = segments.length - 2
      el.innerHTML =
        escapeHtml(segments.slice(0, hashIndex).join('.')) +
        '.<span class="pb-hash">' +
        escapeHtml(segments[hashIndex]) +
        '</span>.' +
        escapeHtml(segments.slice(hashIndex + 1).join('.'))
    } else {
      el.textContent = file
    }
  }

  function ensureRow(item) {
    if (item.row || !shell) return
    var rowEl, nameEl, metaEl, fillEl
    if (single) {
      rowEl = document.getElementById('pb-mainrow')
      nameEl = document.getElementById('pb-name')
      metaEl = document.getElementById('pb-meta')
      fillEl = gfillEl
    } else {
      rowEl = document.createElement('div')
      rowEl.className = 'pb-row'
      rowEl.innerHTML =
        '<div class="pb-line"><span class="pb-name"></span><span class="pb-meta"></span></div><div class="pb-rail"><div class="pb-fill"></div></div>'
      listEl.appendChild(rowEl)
      nameEl = rowEl.querySelector('.pb-name')
      metaEl = rowEl.querySelector('.pb-meta')
      fillEl = rowEl.querySelector('.pb-fill')
    }
    setRowName(nameEl, item.a.u)
    item.row = { el: rowEl, name: nameEl, meta: metaEl, fill: fillEl }
  }

  function renderRow(item) {
    if (!item.row) return
    var row = item.row
    if (item.state === 'error') {
      row.el.classList.add('pb-err')
      row.meta.textContent = '失败：' + ((item.error && item.error.message) || '网络错误')
      return
    }
    row.el.classList.remove('pb-err')
    if (item.total > 0) {
      var pct = Math.min(100, (item.bytes / item.total) * 100)
      row.fill.style.width = pct + '%'
      row.meta.textContent =
        pct.toFixed(0) + '% · ' + fmtSpeed(item.speed) + ' · ' + fmtBytes(item.bytes) + ' / ' + fmtBytes(item.total)
    } else {
      row.fill.style.width = item.bytes > 0 ? '100%' : '0%'
      row.meta.textContent = fmtBytes(item.bytes) + ' · ' + fmtSpeed(item.speed)
    }
  }

  function render() {
    rafId = 0
    dirty = false
    if (!shell) return
    var received = 0
    var total = 0
    var i
    for (i = 0; i < items.length; i++) {
      var item = items[i]
      received += item.bytes
      if (item.total > 0) total += item.total
      if (item.dirty) {
        renderRow(item)
        item.dirty = false
      }
    }
    if (single) {
      var only = items[0]
      if (railEl && only) {
        if (only.total > 0) railEl.setAttribute('aria-valuenow', Math.min(100, (only.bytes / only.total) * 100).toFixed(0))
        else if (only.bytes > 0) railEl.classList.add('pb-ind')
      }
      return
    }
    if (!railEl || !gfillEl) return
    if (total > 0) {
      var pct = Math.min(100, (received / total) * 100)
      gfillEl.style.width = pct + '%'
      railEl.classList.remove('pb-ind')
      railEl.setAttribute('aria-valuenow', pct.toFixed(0))
    } else if (received > 0) {
      railEl.classList.add('pb-ind')
    }
  }

  function applyProgress(item, received, total) {
    ensureRow(item)
    if (total > 0) item.total = total
    var now = performance.now()
    var delta = received - item.bytes
    if (item.lastAt > 0 && delta >= 0) {
      var dt = now - item.lastAt
      if (dt > 0) {
        var inst = (delta / dt) * 1000
        item.speed = item.speed === 0 ? inst : item.speed * 0.7 + inst * 0.3
      }
    }
    item.bytes = received
    item.lastAt = now
    item.dirty = true
    scheduleRender()
  }

  // 完成的资源从进度条中移除。
  function markItemDone(item, bytes, total) {
    if (total > 0) item.total = total
    item.bytes = bytes
    item.state = 'done'
    item.speed = 0
    if (!single && item.row) {
      if (item.row.el.parentNode) item.row.el.parentNode.removeChild(item.row.el)
      item.row = null
    }
    scheduleRender()
  }

  function markItemError(item, message) {
    ensureRow(item)
    item.state = 'error'
    item.error = { message: message }
    item.dirty = true
    scheduleRender()
  }

  function allDone() {
    return items.every(function (it) {
      return it.state === 'done'
    })
  }

  function buildItems(list) {
    items = list.map(function (a) {
      return {
        a: a,
        bytes: 0,
        total: a.s > 0 ? a.s : 0,
        speed: 0,
        lastAt: 0,
        state: 'pending',
        error: null,
        row: null,
        dirty: true,
      }
    })
    byUrl = {}
    single = items.length === 1
    items.forEach(function (item) {
      byUrl[item.a.u] = item
      // 待下载的资源（含 0% 进度）也先展示，完成（100%）时再移除。
      ensureRow(item)
    })
    // 只有确实要下载时才显示进度框（此前保持 spinner + 标题垂直居中）。
    if (items.length > 0 && shell) {
      shell.classList.add('pb-downloading')
      setTitle(TITLE_DOWNLOAD)
    }
    scheduleRender()
  }

  /* ---------- 启动 ---------- */

  function injectAssets() {
    var i
    var styles = (manifest && manifest.styles) || []
    for (i = 0; i < styles.length; i++) {
      var link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = styles[i]
      document.head.appendChild(link)
    }
    if (!manifest || !manifest.entry) return
    var script = document.createElement('script')
    script.type = 'module'
    script.src = manifest.entry
    document.head.appendChild(script)
  }

  function hideShell() {
    if (!shell) return
    setTitle(TITLE_READY)
    shell.classList.add('pb-hide')
    setTimeout(function () {
      if (shell.parentNode) shell.parentNode.removeChild(shell)
      var totalBytes = 0
      for (var i = 0; i < items.length; i++) totalBytes += items[i].bytes
      var detail = { totalBytes: totalBytes }
      window.__pbStats = detail
      window.dispatchEvent(new CustomEvent('pb:done', { detail: detail }))
    }, 350)
  }

  function boot() {
    if (booted) return
    booted = true
    injectAssets()
    hideShell()
  }

  function markFailed() {
    if (!shell) return
    shell.classList.add('pb-fail')
    setTitle('加载失败')
    if (retryBtn) retryBtn.hidden = false
  }

  /* ---------- Service Worker 预缓存 + postMessage 进度 ---------- */

  function fetchManifest() {
    return fetch(MANIFEST_URL, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return response.json()
    })
  }

  function resolveWorker(registration) {
    return registration.active || registration.waiting || registration.installing
  }

  function precacheViaWorker(worker) {
    return new Promise(function (resolve) {
      var channel = new MessageChannel()
      var anyError = false
      channel.port1.onmessage = function (event) {
        var data = event.data || {}
        if (data.type === 'plan') {
          buildItems(Array.isArray(data.pending) ? data.pending : [])
        } else if (data.type === 'progress') {
          var item = byUrl[data.url]
          if (item) applyProgress(item, data.received, data.total)
        } else if (data.type === 'done') {
          var done = byUrl[data.url]
          if (done) markItemDone(done, data.bytes, data.total)
        } else if (data.type === 'error') {
          var failed = byUrl[data.url]
          if (failed) markItemError(failed, data.message)
          anyError = true
        } else if (data.type === 'complete') {
          resolve(!anyError)
        }
      }
      worker.postMessage(
        {
          type: 'PRECACHE',
          assets: (manifest && manifest.assets) || [],
        },
        [channel.port2],
      )
    })
  }

  /* ---------- 回退：页面内直接 fetch（不写缓存） ---------- */

  function fetchItem(item) {
    return fetch(item.a.u, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status)
        var len = response.headers.get('content-length')
        var total = item.total > 0 ? item.total : len && !isNaN(+len) && +len > 0 ? +len : 0
        if (response.body && typeof response.body.getReader === 'function') {
          var reader = response.body.getReader()
          var received = 0
          var pump = function () {
            return reader.read().then(function (result) {
              if (result.done) {
                markItemDone(item, received, total)
                return
              }
              received += result.value.length
              applyProgress(item, received, total)
              return pump()
            })
          }
          return pump()
        }
        return response.arrayBuffer().then(function (buf) {
          markItemDone(item, buf.byteLength, total || buf.byteLength)
        })
      })
      .then(function () {
        return true
      })
      .catch(function (err) {
        markItemError(item, (err && err.message) || String(err))
        return false
      })
  }

  function precacheLocally() {
    var index = 0
    var runners = new Array(Math.min(CONCURRENCY, items.length)).fill(0).map(function () {
      var loop = function () {
        if (index >= items.length) return Promise.resolve()
        var item = items[index]
        index += 1
        return fetchItem(item).then(loop)
      }
      return loop()
    })
    return Promise.all(runners)
  }

  function runFallback() {
    return fetchManifest()
      .then(function (data) {
        manifest = data
        buildItems(data.assets || [])
        return precacheLocally().then(function () {
          if (allDone()) boot()
          else markFailed()
        })
      })
      .catch(markFailed)
  }

  /* ---------- 主流程 ---------- */

  function start() {
    if (!workerSupported) return runFallback()
    return navigator.serviceWorker
      .register(WORKER_URL)
      .then(function () {
        return navigator.serviceWorker.ready
      })
      .then(function (registration) {
        var worker = resolveWorker(registration)
        if (!worker) throw new Error('no active service worker')
        return fetchManifest().then(function (data) {
          manifest = data
          return precacheViaWorker(worker).then(function (ok) {
            if (ok && allDone()) boot()
            else markFailed()
          })
        })
      })
      .catch(function () {
        runFallback()
      })
  }

  function retry() {
    var failed = items.filter(function (it) {
      return it.state === 'error'
    })
    if (failed.length === 0) return
    if (retryBtn) retryBtn.hidden = true
    if (shell) shell.classList.remove('pb-fail')
    setTitle(TITLE_DOWNLOAD)
    failed.forEach(function (it) {
      if (it.row && it.row.el.parentNode) it.row.el.parentNode.removeChild(it.row.el)
      it.row = null
      it.bytes = 0
      it.speed = 0
      it.lastAt = 0
      it.state = 'pending'
      it.error = null
      it.dirty = true
    })
    scheduleRender()

    var finish = function () {
      if (allDone()) boot()
      else markFailed()
    }
    if (workerSupported && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(function (registration) {
        var worker = resolveWorker(registration)
        if (!worker) {
          precacheLocally().then(finish)
          return
        }
        var channel = new MessageChannel()
        channel.port1.onmessage = function (event) {
          var data = event.data || {}
          if (data.type === 'progress') {
            var item = byUrl[data.url]
            if (item) applyProgress(item, data.received, data.total)
          } else if (data.type === 'done') {
            var done = byUrl[data.url]
            if (done) markItemDone(done, data.bytes, data.total)
          } else if (data.type === 'error') {
            var errored = byUrl[data.url]
            if (errored) markItemError(errored, data.message)
          } else if (data.type === 'complete') {
            finish()
          }
        }
        worker.postMessage(
          {
            type: 'PRECACHE',
            assets: failed.map(function (it) {
              return { u: it.a.u, s: it.a.s }
            }),
          },
          [channel.port2],
        )
      })
      return
    }
    precacheLocally().then(finish)
  }

  if (retryBtn) retryBtn.addEventListener('click', retry)

  setTimeout(function () {
    if (!booted) boot()
  }, TIMEOUT_MS)

  start()
})()
