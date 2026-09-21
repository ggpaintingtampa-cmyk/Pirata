#!/usr/bin/env python3
"""Read-only HTTP checks; credentials are accepted only through a terminal."""
import argparse
import base64
import getpass
import hashlib
import ssl
import sys
import urllib.error
import urllib.request

ORIGIN = 'https://pirata.andresinbox.tech'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def request(url, authorization=None):
    headers = {'User-Agent': 'Pirata-deployment-verification/1'}
    if authorization:
        if not url.startswith(ORIGIN + '/'):
            raise ValueError('Credentials may only be sent to the configured HTTPS origin')
        headers['Authorization'] = authorization
    opener = urllib.request.build_opener(
        NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        response = opener.open(urllib.request.Request(url, headers=headers), timeout=12)
    except urllib.error.HTTPError as response_error:
        response = response_error
    with response:
        body = response.read(2 * 1024 * 1024 + 1)
        if len(body) > 2 * 1024 * 1024:
            raise ValueError('Response exceeds the reviewed 2 MiB verification limit')
        return response.status, response.headers, body


def check(condition, label):
    if not condition:
        raise ValueError(label)
    print('PASS: ' + label)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('access', choices=['private', 'team', 'public'])
    parser.add_argument('--asset', required=True, help='/assets/<actual-built-hash>.js')
    parser.add_argument('--interactive', action='store_true', help='Prompt securely for app credentials')
    args = parser.parse_args()
    if args.access == 'team' and args.interactive:
        parser.error('Team mode uses the app sign-in form; --interactive is only for the historical Basic gate')
    if not args.asset.startswith('/assets/') or any(c in args.asset for c in '?&#\\\r\n'):
        parser.error('Use one actual /assets/ path without query or fragment')

    status, headers, _ = request('http://pirata.andresinbox.tech/')
    check(status in (301, 302, 307, 308) and headers.get('Location') == ORIGIN + '/',
          'HTTP redirects to the exact HTTPS origin')
    status, _, _ = request(ORIGIN + '/')
    expected = 401 if args.access == 'private' else 200
    check(status == expected, 'Unauthenticated page status matches chosen access policy')
    status, _, _ = request(ORIGIN + args.asset)
    check(status == expected, 'Unauthenticated direct asset status matches chosen access policy')

    authorization = None
    if args.interactive:
        if not sys.stdin.isatty():
            parser.error('Interactive credential entry requires a real terminal')
        username = input('Separate Pirata username: ')
        password = getpass.getpass('Separate Pirata password (hidden): ')
        authorization = 'Basic ' + base64.b64encode((username + ':' + password).encode()).decode()
        del password
    if args.access == 'private' and not authorization:
        print('PARTIAL: authenticated checks still required; run --interactive in your terminal.')
        return 2

    status, headers, body = request(ORIGIN + '/', authorization)
    check(status == 200 and b'Morgan el Pirata' in body, 'Authorized Pirata entrypoint loads')
    check(headers.get('X-Content-Type-Options') == 'nosniff', 'nosniff header')
    check(headers.get('X-Frame-Options') == 'DENY', 'Clickjacking header')
    check(headers.get('Referrer-Policy') == 'no-referrer', 'Referrer policy')
    check('no-store' in headers.get('Cache-Control', ''), 'HTML is not cached')
    csp = headers.get('Content-Security-Policy', '')
    directives = dict((part.strip().split(' ', 1) + [''])[:2]
                      for part in csp.split(';') if part.strip())
    check(directives.get('script-src') == "'self'" and directives.get('object-src') == "'none'"
          and directives.get('frame-ancestors') == "'none'", 'Expected script/frame/object CSP')
    status, _, body = request(ORIGIN + args.asset, authorization)
    check(status == 200 and bool(body), 'Authorized direct asset loads')
    print('Asset SHA256: ' + hashlib.sha256(body).hexdigest())
    for path in ['/assets/does-not-exist.js', '/.env', '/.git/config', '/src/main.tsx',
                 '/deploy/README.md', '/backups/', '/uploads/', '/package.json', '/unknown-page']:
        status, _, _ = request(ORIGIN + path, authorization)
        check(status == 404, 'Missing/private path is not served: ' + path)
    if args.access == 'team':
        for path in ['/api/v1/snapshot', '/api/v1/export',
                     '/api/v1/files/00000000-0000-4000-8000-000000000000/content']:
            status, _, _ = request(ORIGIN + path)
            check(status == 401, 'Anonymous business API rejected: ' + path)
    print('HTTP checks passed with normal certificate verification. Still run the browser/phone,'
          ' DNS, firewall, service, renewal, rollback and unrelated-service checks in README.md.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except ValueError as error:
        print('Verification failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, urllib.error.URLError):
        # Do not print request objects or headers, which could contain auth data.
        print('Verification failed. Check connectivity, TLS and the last reported check; '
              'no deployment success has been established.', file=sys.stderr)
        sys.exit(1)
