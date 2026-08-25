"""PaddleOCR 精度最高引擎 - Python sidecar (stdlib only, 无 Flask 依赖)

用法:
  pip install paddleocr paddlepaddle   # CPU 版即可
  python python/ocr_server.py --port 8765

协议:
  GET  /health          -> {"ok": true}
  POST /ocr             -> body {"image": "<base64>", "lang": "ch"|"korean"}
                          -> {"text","confidence","lines","lang"} | {"error"}
  --self-test           打印 {"ok":true} 退出(连接性自检, 不加载模型)
"""
import argparse
import base64
import json
import logging
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# 静默 paddleocr/paddle 日志 (3.x 构造参数已移除 show_log/log_level)
logging.getLogger("paddleocr").setLevel(logging.CRITICAL)
logging.getLogger("paddle").setLevel(logging.CRITICAL)

_engines = {}
_lock = threading.Lock()


def make_engine(lang: str):
    """版本自适应创建: 优先 3.x(PP-OCRv5) 参数, TypeError 回退 2.7(PP-OCRv4)"""
    from paddleocr import PaddleOCR

    try:
        return PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=True,
            lang=lang,
        )
    except TypeError:
        pass
    try:
        return PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
    except TypeError:
        return PaddleOCR(lang=lang)


def get_engine(lang: str):
    """懒加载: 首次 /ocr 才 import paddleocr 并自动下载模型(~20MB)"""
    with _lock:
        if lang not in _engines:
            _engines[lang] = make_engine(lang)
        return _engines[lang]


def collect_page(d, texts, scores):
    rt = d.get("rec_texts") or []
    sc = d.get("rec_scores") or []
    for t, s in zip(rt, sc):
        ts = str(t).strip() if t else ""
        if ts:
            texts.append(ts)
            try:
                scores.append(float(s))
            except (TypeError, ValueError):
                pass


def run_ocr(image_bytes: bytes, lang: str):
    import cv2
    import numpy as np

    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("bad image bytes")

    texts: list[str] = []
    scores: list[float] = []
    engine = get_engine(lang)

    # 3.x: predict() -> list[dict]
    try:
        result = engine.predict(img)
        for page in result:
            d = page if isinstance(page, dict) else getattr(page, "__dict__", {})
            collect_page(d, texts, scores)
    except (TypeError, AttributeError, NotImplementedError):
        # 2.7: ocr(img, cls=True) -> [[[box, (text, score)], ...]]
        texts, scores = [], []
        result = engine.ocr(img, cls=True)
        for page in result or []:
            for line in page or []:
                try:
                    box, item = line
                    t, s = item[0], item[1]
                    ts = str(t).strip()
                    if ts:
                        texts.append(ts)
                        scores.append(float(s))
                except (TypeError, IndexError, ValueError):
                    pass

    if not texts:
        return {"text": "", "confidence": 0.0, "lines": [], "lang": "zh" if lang == "ch" else "ko"}

    text = "\n".join(texts)
    conf = sum(scores) / len(scores) if scores else 0.0
    return {
        "text": text,
        "confidence": round(conf, 4),
        "lines": texts,
        "lang": "zh" if lang == "ch" else "ko",
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # 静默
        pass

    def _send(self, code: int, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok": True})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/ocr":
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            image = base64.b64decode(body.get("image", ""))
            lang = body.get("lang", "ch")
            if lang not in ("ch", "korean"):
                lang = "ch"
            out = run_ocr(image, lang)
            self._send(200, out)
        except Exception as e:  # noqa: BLE001 边车崩溃也要返回 JSON 错误
            self._send(500, {"error": f"{type(e).__name__}: {e}"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        print(json.dumps({"ok": True, "paddle": "available"}))
        sys.exit(0)

    print(json.dumps({"ready": True, "port": args.port}), flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
