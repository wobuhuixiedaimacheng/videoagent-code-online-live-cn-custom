#!/usr/bin/env python3
"""
lanshu-awesome-ai-video-kit · 本地开发 server
─────────────────────────────────────────────
比 `python3 -m http.server` 多两件事:

1. 给 .md / .yaml / .yml 设 Content-Type: text/plain; charset=utf-8
   → 直接打开 raw markdown 不再乱码(Python 默认不给 .md 设 charset)

2. 自动把 /xxx.md 重定向到 /viewer.html?file=xxx.md
   → 任何途径访问 .md 都得到 viewer 渲染(收藏夹 / 外部链接 / 直接输 URL)
   → 想看 raw 源码:viewer 底部"查看原始 .md"按钮(用 Blob 强制 UTF-8)

用法:
    python3 serve.py            # 默认 8000 端口
    python3 serve.py 8765       # 指定端口
"""
import http.server
import socketserver
import sys
from urllib.parse import urlparse


class VideoKitHandler(http.server.SimpleHTTPRequestHandler):
    # 修正 Python http.server 默认不给 .md 设 charset 的问题
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.md':   'text/plain; charset=utf-8',
        '.yaml': 'text/plain; charset=utf-8',
        '.yml':  'text/plain; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
    }

    def do_GET(self):
        path = urlparse(self.path).path

        # 把 /any/path.md → 302 → /viewer.html?file=any/path.md
        # 例外:viewer.html 自身和明确请求 raw 的(?raw=1)
        query = urlparse(self.path).query or ''
        if path.endswith('.md') and 'raw=1' not in query:
            file_param = path.lstrip('/')
            new_location = f'/viewer.html?file={file_param}'
            self.send_response(302)
            self.send_header('Location', new_location)
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return

        return super().do_GET()

    def end_headers(self):
        # 开发期完全禁缓存,避免改文件后用户还看旧的
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # 精简日志
        sys.stderr.write(f"  {self.address_string()} → {format % args}\n")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

    # 允许端口快速重用,避免重启时 "Address already in use"
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("", port), VideoKitHandler) as httpd:
        print(f"""
╭────────────────────────────────────────────────────────╮
│  lanshu-awesome-ai-video-kit dev server                │
│                                                        │
│  ✓ .md UTF-8 charset (no more gibberish)               │
│  ✓ .md → /viewer.html auto-redirect                    │
│  ✓ Dev cache disabled (always serve fresh)             │
│                                                        │
│  Serving at: http://localhost:{port}/{' ' * (24 - len(str(port)))}│
│  Press Ctrl+C to stop                                  │
╰────────────────────────────────────────────────────────╯
""")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Server stopped.")


if __name__ == "__main__":
    main()
