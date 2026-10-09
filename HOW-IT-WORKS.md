# How AnaemiaLens works

A walkthrough so you can explain every part of it.

## 1. The big picture

```
 photo (or a drawn sample)
        │  scaled to at most 1000 px, drawn on a canvas
        ▼
 simulated room light / shake (demo controls)
        │
        ▼
 the user marks:  ▭ inner eyelid (drag)     ○ white of the eye (tap)
        │
        ├──▶ photo checks: brightness · sharpness · glare ──▶ fail? "Retake"
        │
        ├──▶ raw redness index  = (R − G) / (R + G) of the eyelid
        │
        └──▶ corrected index: scale R and G by how far the eye white is from neutral
                 │
                 ▼
         below 0.19 "Looks pale" · 0.19–0.23 "Borderline" · above "No obvious pallor"
```

## 2. File tour

| Path | Job |
|---|---|
| `index.html` | The whole app: layout, sample drawing, image processing and results |
| `tests/ui-tests.mjs` | 15 behaviour, robustness and security checks in a real browser |
| `.github/workflows/ci.yml` | Runs the tests, then deploys to GitHub Pages |

## 3. Key ideas

### Measuring pallor
Healthy eyelid tissue is red because of the blood in it, and with less haemoglobin it looks paler. The app uses a simple **redness index**, `(R − G) / (R + G)`, from the average red and green values in the marked box. Red-rich tissue scores high, and pale tissue scores low.

### Correcting the light (the white-reference trick)
A warm bulb adds red and removes blue, so every colour in the photo shifts, and a pale eyelid can look healthy. The white of the eye is close to neutral grey, so whatever tint it shows *is* the lighting. The app scales each colour channel of the eyelid by `average ÷ channel` measured on the eye white. This is the same idea as white balance in a camera (the von Kries method).

### Refusing bad photos
- **Brightness:** the average brightness (luma) of the eyelid box must not be too dark or blown out.
- **Sharpness:** the variance of the Laplacian (an edge detector) over the whole photo, measured at a fixed 480-pixel width so any phone resolution compares fairly. Blur removes edges, so the variance drops.
- **Glare:** the share of nearly white pixels inside the eyelid box.

If brightness or sharpness fails, the result is "Retake the photo", never a reading.

### Drawn samples
The two sample eyes are generated with seeded randomness (`rng(seed)`), so they look natural but are identical on every run, which is what makes the tests repeatable.

## 4. Glossary

| Term | Plain version |
|---|---|
| Anaemia | Too little haemoglobin in the blood to carry oxygen well |
| Conjunctiva | The pink lining inside the eyelid |
| Pallor | Paleness, a classic clinical sign of anaemia |
| White balance | Correcting a photo so neutral things look neutral |
| Laplacian | An edge detector; blur lowers its variance |

## 5. Interview questions you might get

**Q: Why use the white of the eye?**
A: Because it is in the same photo, under the same light, and close to neutral. The tint it shows is the lighting, so dividing it out corrects the eyelid too, with no colour card or extra hardware. The tests show the point: under a warm bulb, the raw reading of the pale sample says "normal", and the corrected reading says "pale".

**Q: Can this diagnose anaemia?**
A: No. It's a screening prototype with hand-set thresholds and drawn samples. The next step is to calibrate against lab-measured haemoglobin, for example the CP-AnemiC dataset of 710 children, and check that it generalises to adults with the Eyes-defy-anemia dataset. Even then it would be a "get a blood test" prompt, not a diagnosis.

**Q: How do you keep photos private?**
A: All processing happens on a canvas in the browser, and the Content-Security-Policy sets `connect-src 'none'`, so the page cannot send data anywhere even if there were a bug. The tests check that no requests are made apart from the web fonts.

## 6. Ideas to extend it

1. **Automatic eyelid detection**, so no manual marking is needed.
2. **A calibrated model** trained on lab-measured haemoglobin, reporting an estimate with an uncertainty range.
3. **A guided camera mode** that checks brightness and focus live, before the photo is taken.
