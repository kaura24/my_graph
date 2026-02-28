"""
desktop.py — pywebview 기반 데스크톱 셸
FastAPI 백엔드를 백그라운드 스레드로 기동하고, pywebview로 UI를 감싸는 진입점.

사용법:
  # 개발 모드 (Vite dev 서버 사용):
  python desktop.py --dev

  # 프로덕션 모드 (빌드된 dist/index.html 사용):
  python desktop.py
"""
import argparse
import threading
import time
import sys
import os
from pathlib import Path

import uvicorn
import webview


def _start_server(host: str = "127.0.0.1", port: int = 8000):
    """FastAPI 서버를 별도 스레드에서 실행"""
    # app.py가 있는 python/ 디렉토리를 sys.path에 추가
    py_dir = Path(__file__).resolve().parent
    if str(py_dir) not in sys.path:
        sys.path.insert(0, str(py_dir))

    from app import app as fastapi_app
    config = uvicorn.Config(
        fastapi_app,
        host=host,
        port=port,
        log_level="warning",
        loop="asyncio",
    )
    server = uvicorn.Server(config)
    server.run()


def _wait_for_server(host: str, port: int, timeout: float = 10.0):
    """서버가 준비될 때까지 대기"""
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://{host}:{port}/api/docs", timeout=1)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def main():
    parser = argparse.ArgumentParser(description="My Graph Desktop")
    parser.add_argument("--dev", action="store_true", help="Vite dev 서버(5173) 사용")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    # ① 백엔드 서버 스레드 기동
    server_thread = threading.Thread(
        target=_start_server,
        kwargs={"host": args.host, "port": args.port},
        daemon=True,
    )
    server_thread.start()

    if not _wait_for_server(args.host, args.port):
        print("[ERROR] FastAPI 서버가 시작되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

    # ② UI URL 결정
    if args.dev:
        url = "http://127.0.0.1:5173"
    else:
        # 빌드된 파일 경로 (프로젝트 루트 기준)
        root = Path(__file__).resolve().parent.parent
        index = root / "dist" / "index.html"
        if not index.exists():
            print(f"[ERROR] dist/index.html 없음. `npm run build` 를 먼저 실행하세요: {index}", file=sys.stderr)
            sys.exit(1)
        url = index.as_uri()

    # ③ pywebview 윈도우 열기
    webview.create_window(
        "My Graph",
        url=url,
        width=1280,
        height=800,
        resizable=True,
    )
    webview.start()


if __name__ == "__main__":
    main()
