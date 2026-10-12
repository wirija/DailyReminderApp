"""Start the database-backed local PWA and its background worker."""
import argparse
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--no-worker', action='store_true', help='Run only the web application.')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Port must be between 1 and 65535.')
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', args.port))
        except OSError:
            parser.error(f'Port {args.port} is already in use. Choose another --port.')

    def run(*arguments):
        subprocess.run([sys.executable, *arguments], cwd=ROOT, check=True)

    run('scripts/build_pwa.py')
    run('backend/manage.py', 'check')
    run('backend/manage.py', 'migrate', '--noinput')
    run('backend/manage.py', 'createcachetable')
    run('backend/manage.py', 'create_huey_tables')
    run('backend/manage.py', 'collectstatic', '--noinput')
    print(f'\nOpen http://localhost:{args.port}/app/ — press Ctrl+C to stop.\n', flush=True)
    processes = []
    stopping = {'requested': False, 'force': False}

    def request_stop(signum, frame):
        if stopping['requested']:
            stopping['force'] = True
        stopping['requested'] = True

    previous_handlers = {sig: signal.signal(sig, request_stop) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        processes.append(subprocess.Popen([sys.executable, 'backend/manage.py', 'runserver',
                                         f'127.0.0.1:{args.port}', '--noreload'], cwd=ROOT, start_new_session=True))
        if not args.no_worker:
            processes.append(subprocess.Popen([sys.executable, 'backend/manage.py', 'run_huey'], cwd=ROOT, start_new_session=True))
        while not stopping['requested'] and all(process.poll() is None for process in processes):
            time.sleep(0.5)
        return next((process.returncode or 0 for process in processes if process.poll() is not None), 0)
    except KeyboardInterrupt:
        return 0
    finally:
        stopping['requested'] = True
        print('Stopping web server; waiting for active background jobs. Press Ctrl+C again to force stop.', flush=True)
        for index, process in enumerate(processes):
            if process.poll() is None:
                process.send_signal(signal.SIGTERM if index == 0 else signal.SIGINT)
        while any(process.poll() is None for process in processes):
            if stopping['force']:
                for process in processes:
                    if process.poll() is None:
                        process.kill()
            time.sleep(0.2)
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)


if __name__ == '__main__':
    raise SystemExit(main())
