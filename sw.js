/* Retirement worker for the former root Days Matter app.
 * Keep this file at /sw.js for returning browsers, even after adding a root navigation page.
 * No fetch handler, no clients.claim(), no navigation and no user-storage/cache deletion.
 * Old caches are retained deliberately for stale open pages; they no longer control new requests.
 */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.registration.unregister()));
