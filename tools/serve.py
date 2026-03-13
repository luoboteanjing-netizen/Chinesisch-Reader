
import http.server, socketserver
from pathlib import Path

PORT = 8000
WEB = Path(__file__).resolve().parent.parent / 'web'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

print(f"Serving on http://localhost:{PORT}")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
