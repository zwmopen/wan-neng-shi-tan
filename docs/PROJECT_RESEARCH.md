# 开源项目调研与迁移边界

调研日期：2026-11-13

目标是把媒体识别做成 Via 可导入的用户脚本。浏览器扩展的网络层能力不属于 Via 用户脚本，因此下列调研区分“可移植设计”与“平台专属实现”。本仓库没有复制这些项目的源码。

| 项目 | 许可证 / 形态 | 值得吸收的经验 | 不直接移植的部分 |
| --- | --- | --- | --- |
| [Media Grabber](https://github.com/riponcm/media-grabber) | MIT；Chrome Manifest V3 扩展 | DOM 与网络发现分层；区分直链、HLS、DASH；候选排序；私有本地处理 | `webRequest`、下载、HLS 分片合并和录音需要扩展 API；本脚本暂只实现 DOM / Resource Timing、格式排序和网页内试播 |
| [Gleaner](https://github.com/sssssssanjiu/gleaner) | MIT；本地优先扩展 | 说明不上传、权限说明、来源分层；DOM 媒体扫描与只读网络观察并行 | 代码依赖扩展权限和多模块构建；其 README 也将 HLS 标为尚不支持。本项目不引入其代码、扩展权限或下载器 |
| [Stream Sniffer](https://github.com/afxjzs/stream-sniffer) | Apache-2.0；Chrome 扩展，内含 Apache-2.0 的 hls.js | HLS 需要区分主清单与媒体清单；Referer/Origin 与短期 URL 会影响外跳播放 | 请求头由扩展规则控制，内置播放器使用 hls.js；Via 用户脚本不能等价设置跨域请求头，故只给直接试播和原网页播放器回退 |
| [Via Browser Userscripts](https://github.com/ilimon/via-Userscripts) | MIT；Via 脚本集合 | 直接安装链接、在浏览器内管理启停 | 未发现与本项目匹配的媒体嗅探实现；没有复制其脚本 |
| [Video Web Inspector](https://github.com/neura-neura/video-web-inspector) | 仓库说明未提供开源许可证 | 会话级观察可用来诊断 fetch、XHR、MediaSource 和播放事件之间的关系 | 需要 `chrome.debugger` 等高权限，README 明确没有许可证；不使用其代码或权限设计 |
| GreasyFork 470154 / 544799 / 544800 | 470154 标为版权保留并带广告；544799、544800 未确认可复用许可证 | 资源列表和轻量操作入口等通用交互思路 | 不复制脚本代码；不引入广告、跨域下载、页面网络 API 劫持或工具箱的无关功能 |

## 由调研形成的实现决策

1. 用 `<video>` / `<audio>` / `<source>` 和 Resource Timing 作为 Via 脚本能访问的发现来源。
2. 用户点击后才显示试播层和触发媒体请求；列表按常见播放格式排序，URL 参数不显示在界面上。
3. `blob:` / MSE 视频保留原网页播放器入口，因为脚本没有可靠权限取得其底层网络请求和媒体数据。
4. 不改写 `fetch` / XHR。其他扩展把只读 hooks 用作补充，但它仍可能与网站脚本冲突，而且不能替代浏览器的网络请求 API。
5. 不捆绑 hls.js。HLS.js 不能绕过浏览器 CORS、Referer 限制或 DRM；在 Via 中增加大型依赖也不能保证兼容，先以真机覆盖率决定是否需要独立播放模块。

## 后续验证方向

- 在 Via 真机上覆盖直链 MP4、标准 HTML5 播放器、HLS、受 Referer 限制的链接、嵌入 iframe 和 `blob:` 播放。
- 对每个失败样本记录页面播放器行为、候选 URL 类型和 Via 内核报错，按证据决定是否增加站点规则或可选增强模块。
- 若需要 `webRequest` 级别嗅探或自带 HLS 播放器，应另做具备明确权限说明的浏览器扩展/原生伴侣，而不是把额外权限伪装成 Via 用户脚本能力。
