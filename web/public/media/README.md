# Licensed media

The app does not bundle official driver portraits, team logos or car renders. Formula 1, the FIA and the teams own those images, and they are not available under an open licence. Add the ones you hold a licence for here and list them in `manifest.json`. Until then the interface uses clearly labelled fallbacks.

```json
{
  "drivers": {
    "44": { "code": "HAM", "src": "/media/drivers/44.webp", "credit": "Photographer or agency", "license": "Licensed from Formula One Licensing B.V., agreement 123", "source": "https://..." }
  },
  "logos": {
    "ferrari": { "src": "/media/logos/ferrari.svg", "credit": "Scuderia Ferrari", "license": "Press kit, editorial use" }
  },
  "cars": {
    "ferrari": { "src": "/media/cars/ferrari.webp", "credit": "Scuderia Ferrari", "license": "Press kit, editorial use" }
  }
}
```

- **Portraits** are keyed by race number. `code` must match the driver's three-letter code, so a reused number can never show the wrong face. A portrait that fails to load falls back to the placeholder.
- **Car renders** should be transparent PNG or WebP at the same three-quarter angle and size for every team, so the directory stays consistent. When one exists for a team it replaces the illustrative 3D model on cards and profiles.
- Every entry needs `credit` and `license`; they are shown to the viewer.
- Do not add images scraped from formula1.com, team sites or social media without permission.
