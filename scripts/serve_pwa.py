"""Serve the planner's app files for installation, without third-party dependencies."""
import argparse
import functools
import ssl
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from build_pwa import DOCS, build_worker, shell_files


class PlannerHandler(SimpleHTTPRequestHandler):
    """Expose the app shell only, rather than the repository or uploaded files."""
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.webmanifest': 'application/manifest+json',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }

    def __init__(self, *args, allowed_files, **kwargs):
        self.allowed_files = frozenset(allowed_files)
        super().__init__(*args, directory=str(DOCS), **kwargs)

    def prepare_path(self):
        name = unquote(urlsplit(self.path).path).removeprefix('/')
        if name == '':
            name = 'mockup.html'
        if name not in self.allowed_files:
            self.send_error(404, 'App file not found')
            return False
        self.path = '/' + name
        return True

    def do_GET(self):
        if self.prepare_path():
            super().do_GET()

    def do_HEAD(self):
        if self.prepare_path():
            super().do_HEAD()

    def end_headers(self):
        # Browsers check for updates; the service worker owns the versioned offline cache.
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, 'App file not found')
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1', help='Bind address; default is this computer only.')
    parser.add_argument('--port', type=int, default=8765, help='Port; default is 8765.')
    parser.add_argument('--cert', type=Path, help='HTTPS certificate file trusted by your browser.')
    parser.add_argument('--key', type=Path, help='HTTPS private key file for the certificate.')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('--port must be between 1 and 65535')
    if bool(args.cert) != bool(args.key):
        parser.error('HTTPS needs both --cert and --key')
    try:
        expected = build_worker()
        target = DOCS / 'service-worker.js'
        if not target.exists() or target.read_text() != expected:
            parser.error('Offline shell is out of date. Run python3 scripts/build_pwa.py first.')
        handler = functools.partial(PlannerHandler, allowed_files=shell_files() + ['service-worker.js'])
        with ThreadingHTTPServer((args.host, args.port), handler) as server:
            if args.cert:
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.load_cert_chain(args.cert, args.key)
                server.socket = context.wrap_socket(server.socket, server_side=True)
            scheme = 'https' if args.cert else 'http'
            shown_host = 'localhost' if args.host == '127.0.0.1' else args.host
            print(f'Daily Project Planner: {scheme}://{shown_host}:{args.port}/mockup.html', flush=True)
            if args.host == '0.0.0.0':
                print('Open using the server hostname or IP address instead of 0.0.0.0.', flush=True)
            print('Press Ctrl+C to stop.', flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        print('\nPlanner server stopped.')
    except (OSError, ValueError) as error:
        parser.exit(1, f'Could not start the planner server: {error}\n')


if __name__ == '__main__':
    main()
