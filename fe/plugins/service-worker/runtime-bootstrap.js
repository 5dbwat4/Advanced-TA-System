;(function () {
  var earlyErrors = (window.__TA_EARLY_ERRORS__ = window.__TA_EARLY_ERRORS__ || [])
  var recovering = false

  function record(kind, message, url) {
    if (window.__TA_REPORT__) {
      window.__TA_REPORT__(kind, { message: String(message || kind), url: url || location.href })
      return
    }
    if (earlyErrors.length < 20) {
      earlyErrors.push({ kind: kind, message: String(message || kind), url: url || location.href })
    }
  }

  window.addEventListener('error', function (event) {
    var target = event.target
    var url = target && (target.src || target.href)
    if (url) record('resource_error', 'resource load failed', url)
    else if (event.message) record('boot_error', event.message, event.filename || location.href)
  }, true)
  window.addEventListener('unhandledrejection', function (event) {
    record('unhandled_rejection', event.reason && event.reason.message || event.reason, location.href)
  })

  var registrationPromise = Promise.resolve(null)
  if ('serviceWorker' in navigator) {
    registrationPromise = navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(function (registration) {
        registration.update().catch(function (error) {
          record('sw_update_failed', error && error.message || error, location.href)
        })
        return registration
      })
      .catch(function (error) {
        record('sw_register_failed', error && error.message || error, location.href)
        return null
      })
  }
  window.__TA_SW_REGISTRATION__ = registrationPromise

  function timeout(ms) {
    return new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('RECOVERY_STEP_TIMEOUT')) }, ms)
    })
  }

  function broadcast(type) {
    try {
      var channel = new BroadcastChannel('tasaas-runtime')
      channel.postMessage({ type: type })
      channel.close()
    } catch (_) {}
  }

  window.__TA_RECOVER__ = async function () {
    if (recovering) return
    recovering = true
    var count = 0
    try {
      count = Number(sessionStorage.getItem('tasaas-recovery-count') || 0)
    } catch (_) {}
    if (count >= 2) {
      var status = document.getElementById('app-splash-status')
      if (status) {
        status.hidden = false
        status.textContent = '自动恢复次数已达上限，请清除此站点的缓存后重试。其他标签页不会自动刷新。'
      }
      recovering = false
      record('recovery_exhausted', 'recovery attempt limit reached', location.href)
      return
    }
    try { sessionStorage.setItem('tasaas-recovery-count', String(count + 1)) } catch (_) {}
    broadcast('recovery-started')
    record('recovery_started', 'attempt ' + (count + 1), location.href)

    try {
      var registration = await Promise.race([registrationPromise, timeout(5000)])
      if (registration) {
        try { await Promise.race([registration.update(), timeout(5000)]) } catch (_) {}
        if (registration.waiting) {
          var controllerChanged = new Promise(function (resolve) {
            navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
          })
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
          try { await Promise.race([controllerChanged, timeout(3000)]) } catch (_) {}
        }
      }
      if (count > 0 && 'serviceWorker' in navigator) {
        var registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.filter(function (item) {
          return item.scope === new URL('/', location.origin).href
        }).map(function (item) { return item.unregister() }))
        if ('caches' in window) {
          var names = await caches.keys()
          await Promise.all(names.filter(function (name) {
            return name === 'tasaas-static' || name.indexOf('tasaas-pages-') === 0 || name.indexOf('tasaas-manifest-') === 0
          }).map(function (name) { return caches.delete(name) }))
        }
      }
    } catch (error) {
      record('recovery_step_failed', error && error.message || error, location.href)
    }

    if (window.__TA_FLUSH__) {
      try { await Promise.race([window.__TA_FLUSH__(), timeout(1500)]) } catch (_) {}
    }
    broadcast('recovery-finished')
    window.location.reload()
  }

  window.addEventListener('pb:app-ready', function () {
    setTimeout(function () {
      try { sessionStorage.removeItem('tasaas-recovery-count') } catch (_) {}
    }, 30000)
  })
})()
