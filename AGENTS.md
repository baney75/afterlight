# Afterlight

A static, browser-based light instrument. Keep the runtime dependency-free and the artwork usable without an account or network requests after loading.

- Use native ES modules in `src/`; `index.html` is the entry point.
- Keep URL scene parsing bounded and backward compatible. Never interpret URL state as HTML or code.
- Audio starts only on request. Honor reduced motion and pause rendering/audio in hidden tabs.
- Test with `npm test` and `npm run test:browser`; build with `npm run build`.
- Verify desktop, narrow phone, keyboard, export, share restore, and the no-WebGL fallback before releasing changes to these paths.
- Do not commit credentials, local paths, browser profiles, node_modules, dist, or test artifacts.
