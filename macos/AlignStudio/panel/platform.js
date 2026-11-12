(function (root) {
    'use strict';
    function location(value) {
        if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f]/.test(value)) throw Error('The extension folder is unavailable.');
        var path = value;
        if (/^file:/i.test(path)) {
            var uri = /^file:\/\/([^/]*)(\/.*)$/i.exec(path);
            if (!uri || (uri[1] && uri[1].toLowerCase() !== 'localhost') || /[?#]/.test(uri[2]))
                throw Error('The extension must be installed in a local folder.');
            path = decodeURIComponent(uri[2]);
            if (/^\/[A-Za-z]:[\/\\]/.test(path)) path = path.slice(1);
        }
        var windows = /^[A-Za-z]:[\/\\]/.test(path);
        if (windows) path = path.replace(/\\/g, '/');
        if ((!windows && (!/^\/[^/]/.test(path) || /^\/\//.test(path))) || /[\x00-\x1f\x7f]/.test(path))
            throw Error('The extension must be installed in a local absolute folder.');
        path = path.replace(/\/+$/, '');
        if (/(^|\/)\.\.?($|\/)/.test(path)) throw Error('The extension folder contains an unresolved path.');
        return {path:path, mac:!windows};
    }
    function executable(value) { var parsed=location(value); return parsed.path + (parsed.mac ? '/updater/AlignStudioUpdater.app/Contents/MacOS/AlignStudioUpdater' : '/updater/AlignStudioUpdater.exe'); }
    function hint(text, mac) { return String(text).replace(/Ctrl\/Cmd\+/g, mac?'Cmd+':'Ctrl+').replace(/\bCtrl\+/g,mac?'Cmd+':'Ctrl+').replace(/\bAlt\+/g,mac?'Option+':'Alt+'); }
    root.AlignPlatform = {location:location, executable:executable, hint:hint};
})(window);
