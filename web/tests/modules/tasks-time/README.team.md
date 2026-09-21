# Team work and calendar verification

This harness always creates disposable SQLite data. It never reads production
configuration. Tests exercise title-only capture, parent/child completion,
equal daily/project fractions, deliberate goals, inherited assignments,
independent timers, retained request retries, calendar filters and layouts.

From the canonical project, with the bundled runtime PATH from web/README.md:

```bash
pnpm --filter @pirata/server exec vitest run tests/modules/tasks-time tests/modules/planning
cd web
pnpm exec playwright test --config tests/modules/tasks-time/playwright.group-a.config.ts
```

Screenshots live in `web/tests/modules/tasks-time/artifacts/`:
`team-work-{320,390,768,1280}.png`, `calendar-hours-{width}.png` and
`calendar-month-{width}.png`. These are isolated module harness screenshots.
The integrated application has separate screenshots and tests.

## WebKit without changing the host

Linux WebKit needs libraries not installed on this workstation. Test-only
Ubuntu packages were downloaded with `apt-get download` and extracted with
`dpkg-deb -x` into `backups/testing-runtime/root/`, without package installation.
Packages: libevent-2.1-7t64, libgstreamer-plugins-bad1.0-0, libflite1,
libavif16, libgav1-1 and libyuv0. The executable wrapper is
`backups/testing-runtime/webkit-private.sh`; it points to the bundled
Playwright WebKit build and adds the private libraries to its environment.
No global library path or browser installation was changed.

WebKit correctly refuses Secure cookies over this HTTP loopback origin. Use
the test-only HTTPS mode; do not weaken application session cookies.
A local self-signed certificate/key with 127.0.0.1 and localhost SANs are in
`backups/testing-runtime/localhost-{cert,key}.pem`. The key is mode0600 and
is test-only. The seven-day certificate can be regenerated with OpenSSL.

```bash
export PIRATA_WEBKIT_EXECUTABLE='/home/andre/Desktop/LargeConcierge/Morgan el Pirata/backups/testing-runtime/webkit-private.sh'
PIRATA_TEST_HTTPS=1 PLAYWRIGHT_WEBKIT=1 pnpm exec playwright test \
  --config tests/modules/tasks-time/playwright.group-a.config.ts \
  --project=group-a-webkit
```

This verifies the Linux WebKit engine with iPhone13 browser emulation and
real secure session cookies. It is not a physical iPhone/Safari device check.
