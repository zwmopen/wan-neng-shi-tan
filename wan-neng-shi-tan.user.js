// ==UserScript==
// @name         万能嗅探（Via版）
// @namespace    zwmopen-via-userscripts
// @version      0.1.1
// @description  安静发现网页公开的媒体直链，点击打开；也可回到网页播放器继续播放。
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    var MAX_ITEMS = 40;
    var items = [];
    var host = null;
    var root = null;
    var listNode = null;
    var countNode = null;
    var panelNode = null;
    var pillNode = null;
    var playbackNode = null;
    var playbackVideo = null;
    var playbackAudio = null;
    var playbackError = null;
    var playbackFallback = null;
    var nextPlayerId = 1;
    var mediaScanScheduled = false;

    function parseHttpUrl(raw) {
        if (!raw || typeof raw !== 'string') return null;
        var link = document.createElement('a');
        try {
            link.href = raw;
        } catch (ignore) {
            return null;
        }
        if (link.protocol !== 'http:' && link.protocol !== 'https:') return null;
        return {
            href: link.href,
            protocol: link.protocol,
            host: link.host,
            pathname: link.pathname || '/',
            display: (link.protocol + '//' + link.host + (link.pathname || '/'))
        };
    }

    function mediaFormat(pathname, mime) {
        var path = (pathname || '').toLowerCase();
        var match = path.match(/\.([a-z0-9]+)$/);
        var ext = match ? match[1] : '';
        var type = (mime || '').toLowerCase();
        if (ext === 'm3u8') return { label: 'HLS · m3u8', score: 82 };
        if (ext === 'mpd') return { label: 'DASH · mpd', score: 72 };
        if (ext === 'mp4' || ext === 'm4v') return { label: 'MP4', score: 100 };
        if (ext === 'webm') return { label: 'WebM', score: 96 };
        if (ext === 'mov') return { label: 'MOV', score: 90 };
        if (ext === 'ogv') return { label: 'OGV', score: 84 };
        if (ext === 'mp3' || ext === 'm4a' || ext === 'aac' || ext === 'oga' || ext === 'opus') {
            return { label: '音频 · ' + ext, score: 30 };
        }
        if (type.indexOf('video/') === 0) return { label: '视频直链', score: 88 };
        if (type.indexOf('audio/') === 0) return { label: '音频直链', score: 35 };
        return null;
    }

    function getItem(key) {
        var i;
        for (i = 0; i < items.length; i += 1) {
            if (items[i].key === key) return items[i];
        }
        return null;
    }

    function ensureUi() {
        if (host) return;
        host = document.createElement('div');
        host.id = 'via-media-sniffer-root';
        host.style.position = 'fixed';
        host.style.right = '12px';
        host.style.bottom = '76px';
        host.style.zIndex = '2147483647';
        host.style.fontFamily = 'system-ui, -apple-system, Roboto, sans-serif';
        host.style.fontSize = '14px';
        host.style.lineHeight = '1.4';
        host.style.color = '#f7f8fa';
        host.style.maxWidth = 'calc(100vw - 24px)';

        root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
        var style = document.createElement('style');
        style.textContent =
            '.vms-shell{font:14px/1.4 system-ui,-apple-system,Roboto,sans-serif;color:#f7f8fa}' +
            '.vms-pill{display:none;border:0;border-radius:22px;padding:10px 14px;background:#18212b;color:#fff;box-shadow:0 3px 14px rgba(0,0,0,.35);font:inherit;font-weight:600}' +
            '.vms-panel{display:none;width:90vw;max-width:360px;max-height:62vh;overflow:hidden;border:1px solid rgba(255,255,255,.15);border-radius:14px;background:#18212b;box-shadow:0 5px 24px rgba(0,0,0,.42)}' +
            '.vms-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.12)}' +
            '.vms-title{flex:1;font-weight:700}.vms-count{color:#b9c8d8;font-size:12px}' +
            '.vms-close,.vms-action{border:0;border-radius:9px;padding:8px 10px;background:#293949;color:#fff;font:inherit}' +
            '.vms-hint{margin:0;padding:9px 12px;color:#c4cfda;font-size:12px}' +
            '.vms-list{list-style:none;margin:0;padding:0 8px 8px;overflow:auto;max-height:calc(62vh - 92px)}' +
            '.vms-item{padding:9px 4px;border-top:1px solid rgba(255,255,255,.09)}' +
            '.vms-meta{display:flex;gap:7px;align-items:center;margin-bottom:5px}' +
            '.vms-format{color:#8ed0ff;font-weight:700;font-size:12px}.vms-url{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d9e2eb;font-size:12px}' +
            '.vms-actions{display:flex;gap:7px}.vms-action{display:inline-block;text-decoration:none;font-size:12px;padding:6px 9px}' +
            '.vms-open{background:#1478cf}.vms-empty{padding:10px 4px;color:#c4cfda;font-size:13px}' +
            '.vms-play{background:#167a55}.vms-playback{display:none;position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;width:100vw;height:100vh;background:#05080b;color:#fff}' +
            '.vms-playback-head{height:48px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#121a22}' +
            '.vms-playback-title{flex:1;font-size:14px;font-weight:600}.vms-playback-body{height:calc(100% - 48px);display:flex;flex-direction:column;align-items:center;justify-content:center}' +
            '.vms-inline-video{max-width:100%;max-height:100%;width:100%;object-fit:contain;background:#000}.vms-inline-audio{width:calc(100% - 32px);max-width:560px}' +
            '.vms-playback-error{display:none;margin:10px 16px;color:#f5c978;font-size:13px;text-align:center}' +
            '@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}';
        root.appendChild(style);

        var shell = document.createElement('div');
        shell.className = 'vms-shell';
        shell.innerHTML = '<button class="vms-pill" type="button" aria-label="查看发现的媒体">▶ <span class="vms-pill-count">0</span></button>' +
            '<section class="vms-panel" role="dialog" aria-label="发现的媒体资源">' +
            '<header class="vms-head"><span class="vms-title">万能嗅探</span><span class="vms-count"></span><button class="vms-close" type="button" aria-label="关闭">×</button></header>' +
            '<p class="vms-hint">只列出网页已暴露的媒体地址。签名、来源限制或 DRM 可能导致外部播放失败。</p>' +
            '<ul class="vms-list"></ul></section>';
        root.appendChild(shell);

        playbackNode = document.createElement('section');
        playbackNode.className = 'vms-playback';
        playbackNode.setAttribute('role', 'dialog');
        playbackNode.setAttribute('aria-label', '媒体播放器');
        playbackNode.innerHTML = '<header class="vms-playback-head"><span class="vms-playback-title">网页内试播</span><button class="vms-close" type="button" aria-label="关闭播放器">关闭</button></header>' +
            '<div class="vms-playback-body"><video class="vms-inline-video" controls playsinline preload="metadata"></video>' +
            '<audio class="vms-inline-audio" controls preload="metadata"></audio>' +
            '<p class="vms-playback-error"></p><a class="vms-action vms-open vms-playback-fallback" target="_blank" rel="noopener noreferrer">在新标签页打开</a></div>';
        root.appendChild(playbackNode);

        pillNode = shell.querySelector('.vms-pill');
        countNode = shell.querySelector('.vms-count');
        listNode = shell.querySelector('.vms-list');
        panelNode = shell.querySelector('.vms-panel');
        playbackVideo = playbackNode.querySelector('.vms-inline-video');
        playbackAudio = playbackNode.querySelector('.vms-inline-audio');
        playbackError = playbackNode.querySelector('.vms-playback-error');
        playbackFallback = playbackNode.querySelector('.vms-playback-fallback');
        playbackVideo.style.display = 'none';
        playbackAudio.style.display = 'none';
        playbackVideo.addEventListener('error', showPlaybackError, false);
        playbackAudio.addEventListener('error', showPlaybackError, false);
        playbackNode.querySelector('.vms-close').addEventListener('click', closePlayback, false);
        pillNode.addEventListener('click', function () {
            panelNode.style.display = panelNode.style.display === 'block' ? 'none' : 'block';
        }, false);
        shell.querySelector('.vms-close').addEventListener('click', function () {
            panelNode.style.display = 'none';
        }, false);
        shell.addEventListener('click', function (event) {
            var target = event.target;
            while (target && target !== shell && !target.getAttribute('data-action')) {
                target = target.parentNode;
            }
            if (!target || target === shell) return;
            var action = target.getAttribute('data-action');
            if (action === 'direct-play') {
                event.preventDefault();
                playDirect(target.__vmsUrl, target.__vmsLabel);
            } else if (action === 'page-play') {
                event.preventDefault();
                playPage(target.__vmsPlayer);
            }
        }, false);

        var mount = document.documentElement || document.body;
        if (mount) mount.appendChild(host);
    }

    function render() {
        if (!items.length) return;
        ensureUi();
        pillNode.style.display = 'block';
        pillNode.querySelector('.vms-pill-count').textContent = String(items.length);
        countNode.textContent = items.length + ' 项';
        while (listNode.firstChild) listNode.removeChild(listNode.firstChild);
        if (!items.length) {
            var empty = document.createElement('li');
            empty.className = 'vms-empty';
            empty.textContent = '暂未发现可打开的媒体地址';
            listNode.appendChild(empty);
            return;
        }
        var ordered = items.slice(0);
        ordered.sort(function (a, b) { return b.score - a.score; });
        var i;
        for (i = 0; i < ordered.length; i += 1) {
            var item = ordered[i];
            var row = document.createElement('li');
            row.className = 'vms-item';
            var meta = document.createElement('div');
            meta.className = 'vms-meta';
            var format = document.createElement('span');
            format.className = 'vms-format';
            format.textContent = item.label;
            meta.appendChild(format);
            var urlText = document.createElement('span');
            urlText.className = 'vms-url';
            urlText.textContent = item.display || '网页播放器';
            meta.appendChild(urlText);
            row.appendChild(meta);

            var actions = document.createElement('div');
            actions.className = 'vms-actions';
            if (item.url) {
                var play = document.createElement('button');
                play.className = 'vms-action vms-play';
                play.type = 'button';
                play.textContent = '直接播放';
                play.setAttribute('data-action', 'direct-play');
                play.__vmsUrl = item.url;
                play.__vmsLabel = item.label;
                actions.appendChild(play);

                var open = document.createElement('a');
                open.className = 'vms-action vms-open';
                open.href = item.url;
                open.target = '_blank';
                open.rel = 'noopener noreferrer';
                open.textContent = '打开 / 试播';
                actions.appendChild(open);
            }
            if (item.player) {
                var locate = document.createElement('button');
                locate.className = 'vms-action';
                locate.type = 'button';
                locate.textContent = item.protected ? '回到站内播放' : '定位并播放';
                locate.setAttribute('data-action', 'page-play');
                locate.__vmsPlayer = item.player;
                actions.appendChild(locate);
            }
            row.appendChild(actions);
            listNode.appendChild(row);
        }
    }

    function showPlaybackError() {
        if (!playbackError) return;
        playbackError.textContent = '当前内核无法播放该地址，可能是格式不支持、链接过期或需要网页来源。可尝试在新标签页打开。';
        playbackError.style.display = 'block';
    }

    function closePlayback() {
        if (!playbackNode) return;
        playbackNode.style.display = 'none';
        try {
            playbackVideo.pause();
            playbackAudio.pause();
            playbackVideo.removeAttribute('src');
            playbackAudio.removeAttribute('src');
            playbackVideo.load();
            playbackAudio.load();
        } catch (ignore) {}
    }

    function playDirect(url, label) {
        if (!url || !playbackNode) return;
        closePlayback();
        playbackError.style.display = 'none';
        playbackError.textContent = '';
        playbackFallback.href = url;
        var isAudio = label && label.indexOf('音频') === 0;
        var media = isAudio ? playbackAudio : playbackVideo;
        var other = isAudio ? playbackVideo : playbackAudio;
        other.style.display = 'none';
        media.style.display = 'block';
        media.src = url;
        playbackNode.style.display = 'block';
        try {
            var result = media.play();
            if (result && typeof result.catch === 'function') {
                result.catch(function () {
                    playbackError.textContent = '自动播放被浏览器拦截，请点播放器上的播放键。';
                    playbackError.style.display = 'block';
                });
            }
        } catch (ignore) {
            showPlaybackError();
        }
    }

    function playPage(player) {
        if (!player) return;
        try {
            player.scrollIntoView();
            if (typeof player.play === 'function') {
                var result = player.play();
                if (result && typeof result.catch === 'function') result.catch(function () {});
            }
        } catch (ignore) {}
    }

    function addDirect(raw, mime, player) {
        var parsed = parseHttpUrl(raw);
        if (!parsed) return false;
        var format = mediaFormat(parsed.pathname, mime);
        if (!format) return false;
        var existing = getItem('url:' + parsed.href);
        if (existing) {
            if (player && existing.player !== player) {
                existing.player = player;
                render();
            }
            return true;
        }
        if (items.length >= MAX_ITEMS) return false;
        items.push({
            key: 'url:' + parsed.href,
            url: parsed.href,
            display: parsed.display,
            label: format.label,
            score: format.score,
            player: player || null,
            protected: false
        });
        render();
        return true;
    }

    function addPagePlayer(player, protectedMedia) {
        if (!player || items.length >= MAX_ITEMS) return;
        if (!player.__vmsId) {
            player.__vmsId = 'player-' + nextPlayerId;
            nextPlayerId += 1;
        }
        var key = 'page:' + player.__vmsId;
        var existing = getItem(key);
        if (existing) {
            if (protectedMedia && !existing.protected) {
                existing.protected = true;
                existing.label = '站内受保护视频';
                render();
            }
            return;
        }
        items.push({
            key: key,
            url: null,
            display: '当前网页的视频播放器',
            label: protectedMedia ? '站内受保护视频' : '网页内视频',
            score: 45,
            player: player,
            protected: !!protectedMedia
        });
        render();
    }

    function collectMediaElement(media) {
        if (!media || (media.tagName !== 'VIDEO' && media.tagName !== 'AUDIO')) return;
        var protectedMedia = false;
        try { protectedMedia = !!media.mediaKeys; } catch (ignore) {}
        var candidates = [];
        if (media.currentSrc) candidates.push({ url: media.currentSrc, mime: media.getAttribute('type') || '' });
        if (media.src) candidates.push({ url: media.src, mime: media.getAttribute('type') || '' });
        var sources = media.querySelectorAll ? media.querySelectorAll('source') : [];
        var i;
        for (i = 0; i < sources.length; i += 1) {
            candidates.push({ url: sources[i].src || sources[i].getAttribute('src'), mime: sources[i].type || '' });
        }
        var foundDirect = false;
        for (i = 0; i < candidates.length; i += 1) {
            if (protectedMedia) continue;
            if (addDirect(candidates[i].url, candidates[i].mime, media)) foundDirect = true;
            else if (candidates[i].url && candidates[i].url.indexOf('blob:') === 0) addPagePlayer(media, false);
        }
        if (protectedMedia) addPagePlayer(media, true);
        else if (!foundDirect && (media.currentSrc || media.src || (sources && sources.length))) addPagePlayer(media, false);
    }

    function scanMedia(rootNode) {
        if (!rootNode || !rootNode.querySelectorAll) return;
        var ancestor = rootNode;
        while (ancestor && ancestor.tagName !== 'VIDEO' && ancestor.tagName !== 'AUDIO') {
            ancestor = ancestor.parentNode;
        }
        if (ancestor) {
            collectMediaElement(ancestor);
            return;
        }
        var nodes = rootNode.querySelectorAll('video,audio');
        var i;
        for (i = 0; i < nodes.length; i += 1) collectMediaElement(nodes[i]);
        if (rootNode.tagName === 'VIDEO' || rootNode.tagName === 'AUDIO') collectMediaElement(rootNode);
    }

    function nodeContainsMedia(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO' || node.tagName === 'SOURCE') return true;
        return !!(node.querySelector && node.querySelector('video,audio,source'));
    }

    function scheduleMediaScan() {
        if (mediaScanScheduled) return;
        mediaScanScheduled = true;
        window.setTimeout(function () {
            mediaScanScheduled = false;
            scanMedia(document);
        }, 500);
    }

    function scanResourceEntries(entries) {
        var i;
        for (i = 0; entries && i < entries.length; i += 1) {
            if (entries[i] && entries[i].name) addDirect(entries[i].name, '', null);
        }
    }

    function installResourceObserver() {
        if (!window.performance || typeof window.performance.getEntriesByType !== 'function') return;
        try { scanResourceEntries(window.performance.getEntriesByType('resource')); } catch (ignore) {}
        if (typeof window.PerformanceObserver !== 'function') return;
        try {
            var observer = new window.PerformanceObserver(function (list) {
                scanResourceEntries(list.getEntries());
            });
            observer.observe({ entryTypes: ['resource'] });
        } catch (ignore) {}
    }

    function installDomObserver() {
        if (typeof window.MutationObserver !== 'function') return;
        try {
            var observer = new window.MutationObserver(function (records) {
                var i;
                for (i = 0; i < records.length; i += 1) {
                    if (records[i].type === 'attributes') {
                        var target = records[i].target;
                        if (target && (target.tagName === 'VIDEO' || target.tagName === 'AUDIO' || target.tagName === 'SOURCE')) {
                            scheduleMediaScan();
                        }
                    }
                    else {
                        var j;
                        for (j = 0; j < records[i].addedNodes.length; j += 1) {
                            if (nodeContainsMedia(records[i].addedNodes[j])) {
                                scheduleMediaScan();
                                break;
                            }
                        }
                    }
                }
            });
            observer.observe(document.documentElement || document, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'type']
            });
        } catch (ignore) {}
    }

    document.addEventListener('play', function (event) {
        collectMediaElement(event.target);
    }, true);
    document.addEventListener('loadstart', function (event) {
        collectMediaElement(event.target);
    }, true);

    scanMedia(document);
    installResourceObserver();
    installDomObserver();
}());
