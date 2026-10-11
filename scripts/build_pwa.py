"""Generate a complete, content-versioned offline shell using Python's standard library."""
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
TEMPLATE = Path(__file__).with_name('service-worker.template.js')


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.files = {'mockup.html', 'manifest.webmanifest'}

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'script' and values.get('src'):
            self.files.add(values['src'])
        if tag == 'link' and values.get('rel') in {'stylesheet', 'icon', 'apple-touch-icon', 'manifest'}:
            self.files.add(values['href'])


def shell_files():
    parser = AssetParser()
    parser.feed((DOCS / 'mockup.html').read_text())
    manifest = json.loads((DOCS / 'manifest.webmanifest').read_text())
    parser.files.update(icon['src'] for icon in manifest['icons'])
    parser.files.update({'templates/PBC-template.xlsx', 'templates/Issue-template.xlsx'})
    files = sorted({value.removeprefix('./') for value in parser.files})
    for name in files:
        url = urlsplit(name)
        if url.scheme or url.netloc or url.query or url.fragment or name.startswith('/'):
            raise ValueError(f'Offline assets must be local relative paths: {name}')
        path = (DOCS / name).resolve()
        if not path.is_relative_to(DOCS.resolve()) or not path.is_file():
            raise ValueError(f'Missing or out-of-scope app asset: {name}')
    return files


def build_worker():
    files = shell_files()
    digest = hashlib.sha256(TEMPLATE.read_bytes())
    for name in files:
        digest.update(name.encode() + b'\0' + (DOCS / name).read_bytes() + b'\0')
    return TEMPLATE.read_text().replace('__VERSION__', digest.hexdigest()[:20]).replace('__SHELL_FILES__', json.dumps(files, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if the generated worker needs rebuilding.')
    args = parser.parse_args()
    expected = build_worker()
    target = DOCS / 'service-worker.js'
    if args.check:
        if not target.exists() or target.read_text() != expected:
            parser.exit(1, 'Offline shell is out of date. Run python3 scripts/build_pwa.py.\n')
        print('PASS: offline asset list and content version match the current app.')
    else:
        target.write_text(expected)
        print('Built docs/service-worker.js with a content-versioned offline shell.')


if __name__ == '__main__':
    main()
