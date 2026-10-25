/* 首屏加载器（构建时独立成一个已 minify 的 hashed 文件，由 index.html 以 <script src> 引入）。
 *
 * 目标：不再为了 FMP 等待全部 chunk 下载完成。
 *
 * 流程：
 * 1. 立即在页面顶部显示不确定态进度条。
 * 2. 并行：拉取 manifest.json；注册 Service Worker 并等待就绪。
 * 3. 拿到 manifest 后马上注入样式表与入口脚本，页面开始渲染（不等待 chunk 预加载完成）。
 * 4. 通知 SW 启动后台加载进程：SW 基于 manifest 把 JS/CSS chunk 持续写入缓存，
 *    并通过 postMessage 广播 CHUNK_PROGRESS；这里只负责把进度映射到顶部进度条。
 * 5. 进度 100% 后淡出进度条；页面本身始终可交互。
 * 6. 不支持 Service Worker / SW 启动失败时退化为浏览器原生按需加载，进度条很快隐藏。
 */
(function () {
  var BASE = '__BASE_URL__'
  var MANIFEST_URL = BASE + 'manifest.json'
  var WORKER_URL = BASE + 'sw.js'
  var WORKER_READY_TIMEOUT_MS = 4000
  var WORKER_POLL_MS = 2500
  var WORKER_POLL_UNTIL_MS = 120000

  var workerSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.serviceWorker &&
    typeof navigator.serviceWorker.register === 'function'

  var barEl = document.getElementById('pb-bar')
  var fillEl = document.getElementById('pb-fill')

  var injected = false
  var completed = false
  var finished = false
  var lastProgress = null
  var pollTimer = 0
  var pollDeadline = 0

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = 0
    }
  }

  function schedulePoll(worker) {
    if (!worker || typeof worker.postMessage !== 'function') return
    pollDeadline = Date.now() + WORKER_POLL_UNTIL_MS
    var tick = function () {
      if (finished || Date.now() > pollDeadline) return
      try {
        worker.postMessage({ type: 'PRELOAD_STATE' })
      } catch {
        /* worker 已失效 */
      }
      pollTimer = setTimeout(tick, WORKER_POLL_MS)
    }
    pollTimer = setTimeout(tick, WORKER_POLL_MS)
  }

  function hideBar(delay) {
    if (!barEl) return
    setTimeout(function () {
      if (!barEl) return
      barEl.classList.add('pb-hide')
      setTimeout(function () {
        if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl)
      }, 400)
    }, delay || 0)
  }

  function finish() {
    if (finished) return
    finished = true
    completed = true
    stopPolling()

    if (barEl) {
      barEl.classList.remove('pb-ind')
      barEl.setAttribute('aria-valuenow', '100')
    }
    if (fillEl) fillEl.style.width = '100%'

    var detail = lastProgress || { done: 0, total: 0, bytes: 0, totalBytes: 0 }
    window.__pbStats = detail
    window.dispatchEvent(new CustomEvent('pb:done', { detail: detail }))

    hideBar(250)
  }

  function applyProgress(data) {
    if (finished) return
    lastProgress = data
    var done = Number(data.done) || 0
    var total = Number(data.total) || 0

    if (barEl && fillEl && total > 0) {
      var pct = Math.max(0, Math.min(100, (done / total) * 100))
      barEl.classList.remove('pb-ind')
      barEl.setAttribute('aria-valuenow', pct.toFixed(0))
      fillEl.style.width = pct.toFixed(2) + '%'
    }

    if (data.complete) {
      completed = true
      if (injected) finish()
    }
  }

  function onMessage(event) {
    var data = event.data || {}
    if (data.type === 'CHUNK_PROGRESS') applyProgress(data)
  }

  function fetchManifest(attempt) {
    return fetch(MANIFEST_URL, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status)
        return response.json()
      })
      .catch(function (error) {
        if (attempt >= 2) throw error
        return new Promise(function (resolve) {
          setTimeout(resolve, 400)
        }).then(function () {
          return fetchManifest(attempt + 1)
        })
      })
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        setTimeout(function () {
          resolve(null)
        }, ms)
      }),
    ])
  }

  function injectAssets(manifest) {
    var styles = (manifest && manifest.styles) || []
    var i
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

  function showFatal() {
    stopPolling()
    if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl)
    if (document.getElementById('pb-fatal')) return
    var el = document.createElement('div')
    el.id = 'pb-fatal'
    el.className = 'pb-fatal'
    el.innerHTML =
      '<div><p>加载失败，请检查网络后重试。</p><button type="button" id="pb-reload">重试</button></div>'
    document.body.appendChild(el)
    var retry = document.getElementById('pb-reload')
    if (retry) {
      retry.addEventListener('click', function () {
        window.location.reload()
      })
    }
  }

  if (workerSupported) {
    navigator.serviceWorker.addEventListener('message', onMessage)
  }

  var workerPromise = workerSupported
    ? Promise.resolve()
        .then(function () {
          return navigator.serviceWorker.register(WORKER_URL)
        })
        .then(function () {
          return withTimeout(navigator.serviceWorker.ready, WORKER_READY_TIMEOUT_MS)
        })
        .then(function (registration) {
          if (!registration) return false
          var worker = navigator.serviceWorker.controller || registration.active
          if (worker) {
            try {
              worker.postMessage({ type: 'PRELOAD_START' })
            } catch {
              /* 忽略 */
            }
            schedulePoll(worker)
          }
          return true
        })
        .catch(function () {
          return false
        })
    : Promise.resolve(false)

  Promise.all([fetchManifest(0), workerPromise])
    .then(function (results) {
      var manifest = results[0]
      var workerOk = results[1]

      injectAssets(manifest)
      injected = true

      if (completed) finish()
      else if (!workerOk) hideBar(600)
    })
    .catch(function () {
      showFatal()
    })
})()
