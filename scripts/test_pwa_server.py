"""Exercise actual HTTP handlers in memory: no sockets, browser or network."""
import io
import unittest
from types import SimpleNamespace

from build_pwa import DOCS, build_worker, shell_files
from serve_pwa import PlannerHandler


class MemoryConnection:
    def __init__(self, request):
        self.request = request
        self.output = bytearray()

    def makefile(self, mode, buffering=-1):
        return io.BytesIO(self.request)

    def sendall(self, data):
        self.output.extend(data)


class QuietHandler(PlannerHandler):
    def log_message(self, format, *args):
        pass


class PlannerServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = shell_files() + ['service-worker.js']

    def request(self, target, method='GET'):
        connection = MemoryConnection(f'{method} {target} HTTP/1.0\r\nHost: localhost\r\n\r\n'.encode())
        QuietHandler(connection, ('127.0.0.1', 12345), SimpleNamespace(), allowed_files=self.files)
        head, body = bytes(connection.output).split(b'\r\n\r\n', 1)
        lines = head.decode().split('\r\n')
        status = int(lines[0].split()[1])
        headers = {name.lower(): value for name, value in (line.split(': ', 1) for line in lines[1:])}
        return status, headers, body

    def test_root_and_app_return_same_html(self):
        for target in ['/', '/mockup.html', '/mockup.html?view=projects']:
            status, headers, body = self.request(target)
            self.assertEqual(status, 200)
            self.assertEqual(body, (DOCS / 'mockup.html').read_bytes())
            self.assertEqual(headers['content-type'], 'text/html')

    def test_every_offline_file_is_served(self):
        for name in self.files:
            with self.subTest(name=name):
                status, headers, body = self.request('/' + name)
                self.assertEqual(status, 200)
                self.assertEqual(body, (DOCS / name).read_bytes())
                self.assertEqual(headers['cache-control'], 'no-cache')
                self.assertEqual(headers['x-content-type-options'], 'nosniff')

    def test_head_has_headers_without_a_body(self):
        status, headers, body = self.request('/service-worker.js', 'HEAD')
        self.assertEqual(status, 200)
        self.assertEqual(headers['content-type'], 'text/javascript')
        self.assertEqual(int(headers['content-length']), (DOCS / 'service-worker.js').stat().st_size)
        self.assertEqual(body, b'')

    def test_required_content_types(self):
        for name, mime in {
            'manifest.webmanifest': 'application/manifest+json',
            'pwa.js': 'text/javascript',
            'icons/icon.svg': 'image/svg+xml',
            'icons/icon-192.png': 'image/png',
            'templates/PBC-template.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }.items():
            with self.subTest(name=name):
                self.assertEqual(self.request('/' + name)[1]['content-type'], mime)

    def test_unlisted_files_and_traversal_are_unavailable(self):
        for target in ['/requirements.html', '/REVIEW-pbc-exchange.md', '/icons/', '/../PWA.md', '/%2e%2e/PWA.md', '/scripts/serve_pwa.py', '/api/projects', '/uploads/client.docx']:
            with self.subTest(target=target):
                status, headers, body = self.request(target)
                self.assertEqual(status, 404)
                self.assertNotIn(b'# Daily Project Planner PWA', body)

    def test_generated_worker_matches_all_current_asset_bytes(self):
        self.assertEqual((DOCS / 'service-worker.js').read_text(), build_worker())


if __name__ == '__main__':
    unittest.main()
