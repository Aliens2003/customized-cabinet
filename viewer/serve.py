from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from subprocess import TimeoutExpired
from threading import Lock
import json
import sys

from export_stl import ROOT, export_stl

export_lock = Lock()


class ViewerHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/export-stl":
            self.send_error(404)
            return
        if self.headers.get_content_type() != "application/json":
            self.reply(415, "text/plain; charset=utf-8", "需要 JSON 参数。".encode())
            return
        if not export_lock.acquire(blocking=False):
            self.reply(409, "text/plain; charset=utf-8", "已有导出正在进行。".encode())
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                raise ValueError("参数大小不正确。")
            body = export_stl(json.loads(self.rfile.read(length)))
        except ValueError as error:
            self.reply(400, "text/plain; charset=utf-8", str(error).encode())
        except TimeoutExpired:
            self.reply(504, "text/plain; charset=utf-8", "OpenSCAD 生成超时。".encode())
        except (RuntimeError, OSError) as error:
            self.reply(500, "text/plain; charset=utf-8", str(error).encode())
        else:
            self.reply(200, "application/zip", body)
        finally:
            export_lock.release()

    def reply(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(ViewerHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"http://127.0.0.1:{port}/viewer/", flush=True)
        server.serve_forever()
