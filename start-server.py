#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Step Up ローカル開発サーバー（Codespaces / Linux 用）

setup-server.ps1（Windows）と同等の役割を、Python標準ライブラリだけで実現する。

機能:
  - プロジェクト直下（このファイルがあるディレクトリ）をWebルートとして静的ファイルを配信
    （index.html, app.js, styles.css, data/配下, assets/配下 など）
  - GET  /api/state  -> shared-data.json の内容をJSONで返す
  - POST /api/state  -> 受け取ったJSONを shared-data.json に保存する
  - PUT  /api/state  -> 同上（POSTと同じ扱い）
  - 5500〜5510番の空きポートを自動で探して 0.0.0.0 で待ち受ける
  - 起動時に使用ポートをターミナルへ表示する

このファイルは既存の index.html / app.js / styles.css / data配下のファイル、
および setup-server.ps1 / start.bat を一切変更しない。

起動方法:
  python3 start-server.py
"""

import http.server
import json
import mimetypes
import socket
import socketserver
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------
WEB_ROOT = Path(__file__).resolve().parent
SHARED_DATA_FILE = WEB_ROOT / "shared-data.json"
HOST = "0.0.0.0"
PORT_CANDIDATES = range(5500, 5511)  # 5500〜5510

# 日本語を含むJSON/JSファイルなどが文字化けしないよう、MIMEタイプを明示しておく。
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/html", ".html")


class StepUpRequestHandler(http.server.SimpleHTTPRequestHandler):
    """静的ファイル配信 + /api/state APIを1つのハンドラで扱う。"""

    def __init__(self, *args, **kwargs):
        # directory引数を指定することで、実行時のカレントディレクトリに関係なく
        # 常にこのファイルがある場所（WEB_ROOT）を基準に配信する。
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    # --- ログ出力（日本語が文字化けしないようそのままUTF-8で出す） ---
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (
            self.address_string(),
            self.log_date_time_string(),
            fmt % args,
        ))

    # --- 共通ユーティリティ -------------------------------------------------
    def _current_path(self):
        return urlparse(self.path).path

    def _is_state_path(self):
        return self._current_path().rstrip("/") == "/api/state"

    def _send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return b""
        return self.rfile.read(length)

    # --- HTTPメソッド ---------------------------------------------------
    def do_GET(self):
        if self._is_state_path():
            self._handle_get_state()
            return
        super().do_GET()

    def do_HEAD(self):
        if self._is_state_path():
            # /api/state に対するHEADは簡易的にGETと同じ扱いにする
            self._handle_get_state()
            return
        super().do_HEAD()

    def do_POST(self):
        if self._is_state_path():
            self._handle_write_state()
            return
        self.send_error(404, "Not Found")

    def do_PUT(self):
        if self._is_state_path():
            self._handle_write_state()
            return
        self.send_error(404, "Not Found")

    # --- /api/state ---------------------------------------------------
    def _handle_get_state(self):
        if not SHARED_DATA_FILE.exists():
            # まだ一度も保存されていない場合は空オブジェクトを返す
            self._send_json(200, {})
            return
        try:
            raw = SHARED_DATA_FILE.read_text(encoding="utf-8")
            data = json.loads(raw) if raw.strip() else {}
        except (OSError, json.JSONDecodeError) as e:
            self._send_json(500, {
                "error": "shared-data.jsonの読み込みに失敗しました",
                "detail": str(e),
            })
            return
        self._send_json(200, data)

    def _handle_write_state(self):
        raw_body = self._read_body()
        try:
            text = raw_body.decode("utf-8")
        except UnicodeDecodeError as e:
            self._send_json(400, {
                "error": "リクエストボディがUTF-8として不正です",
                "detail": str(e),
            })
            return

        try:
            data = json.loads(text) if text.strip() else {}
        except json.JSONDecodeError as e:
            self._send_json(400, {
                "error": "不正なJSONです",
                "detail": str(e),
            })
            return

        try:
            SHARED_DATA_FILE.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as e:
            self._send_json(500, {
                "error": "shared-data.jsonの保存に失敗しました",
                "detail": str(e),
            })
            return

        self._send_json(200, {"ok": True})

    # --- パストラバーサル対策 -------------------------------------------
    def translate_path(self, path):
        """
        リクエストパスをWEB_ROOT配下のファイルパスへ変換する。
        '..' 等でWEB_ROOTの外に出ようとした場合は、存在しないパスへ逃がして
        必ず404になるようにする（安全側に倒す）。
        """
        raw_path = urlparse(path).path
        raw_path = unquote(raw_path)
        # '.' や '..' は無視する（そもそも上位ディレクトリへ辿らせない）
        parts = [p for p in raw_path.split("/") if p not in ("", ".", "..")]
        candidate = WEB_ROOT.joinpath(*parts) if parts else WEB_ROOT

        try:
            resolved = candidate.resolve()
            resolved.relative_to(WEB_ROOT.resolve())
        except (ValueError, OSError):
            # WEB_ROOTの外を指している、または解決できない場合は
            # 確実に存在しないパスを返して404にする。
            return str(WEB_ROOT / "__blocked_path__")

        return str(resolved)


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def find_free_port():
    """5500〜5510の中から空いているポートを1つ探す。"""
    for port in PORT_CANDIDATES:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((HOST, port))
            except OSError:
                continue
            return port
    return None


def main():
    port = find_free_port()
    if port is None:
        print(
            f"エラー: {PORT_CANDIDATES.start}〜{PORT_CANDIDATES.stop - 1}番のポートが"
            f"すべて使用中で起動できませんでした。",
            file=sys.stderr,
        )
        sys.exit(1)

    httpd = ThreadingHTTPServer((HOST, port), StepUpRequestHandler)

    print("=" * 60)
    print("Step Up ローカル開発サーバーを起動しました")
    print(f"  使用ポート   : {port}")
    print(f"  待受アドレス : {HOST}")
    print(f"  Web root     : {WEB_ROOT}")
    print(f"  shared-data  : {SHARED_DATA_FILE}")
    print(f"  ローカルURL  : http://127.0.0.1:{port}/")
    print("  Codespacesの場合は、PORTSタブに表示されるURLを開いてください。")
    print("  終了するには Ctrl+C を押してください。")
    print("=" * 60)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nサーバーを停止します。")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
