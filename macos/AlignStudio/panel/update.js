(function () {
    'use strict';
    var button = document.getElementById('updates'), message = document.getElementById('updateStatus');
    var timer = null, disposed = false;
    function report(text) { if (message) { message.textContent = text; message.hidden = false; } }
    function launch(settings) {
        if (disposed) return;
        try {
            if (!window.__adobe_cep__ || !window.cep || !window.cep.process || typeof window.cep.process.createProcess !== 'function')
                throw Error('The updater launcher is unavailable. Open the Align Studio updater application from the extension folder.');
            var rawPath = window.__adobe_cep__.getSystemPath('extension'), root = window.AlignPlatform.location(rawPath).path, environment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
            var major = parseInt(environment.appVersion, 10);
            if (!isFinite(major) || major < 1) throw Error('The After Effects version could not be read.');
            // CEP supplies separate arguments directly to its native process API. No shell or ExtendScript execution.
            var result = window.cep.process.createProcess(window.AlignPlatform.executable(rawPath), settings ? '--settings' : '--startup',
                '--extension-path', root, '--ae-version', String(major), '--current-version', '1.0.1');
            if (!result || result.err !== 0 || !(result.data > 0)) throw Error('The updater could not start. Reinstall the complete Align Studio package.');
            if (settings && message) { message.textContent = ''; message.hidden = true; }
        } catch (error) { report(error.message || String(error)); }
    }
    if (button) button.addEventListener('click', function () { launch(true); });
    // Delay once per panel load; a separate background helper owns network access and preference checks.
    if (window.__adobe_cep__) timer = window.setTimeout(function () { timer = null; launch(false); }, 30000);
    window.addEventListener('unload', function () { disposed = true; if (timer !== null) window.clearTimeout(timer); });
})();
