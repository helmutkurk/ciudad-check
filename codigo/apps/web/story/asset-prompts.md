# Asset prompts (optional upgrade)

The live page draws its frames in code. These prompts are for a later photoreal version of the same story; no Imagen or video API key was available when the page was built. Keep the palette (#0B2E1F, #2E7D32, #6BAF5B, #CFE7C1, #F5EFE3), leave the left 45 % (desktop) or the bottom 40 % (mobile) free for HTML text, and never put text, logos or UI into the images.

## Keyframes (Imagen)

Shared negative prompt: text, watermark, logo, brand names, readable labels, distorted objects, broken geometry, unreadable signage, UI elements, people's faces, random extra objects, inconsistent lighting.

| Id | Function | Prompt |
|---|---|---|
| kf_01_empty_aisle | start | Photorealistic keyframe for a cinematic scrollytelling website. A calm, empty supermarket aisle in Munich at early morning, soft warm light, cream and deep green tones, shallow depth of field, a single empty shopping cart on the right third, slight low angle, the left 45 % calm and uncluttered for text. 16:9, 1880x920. |
| kf_02_shelf_tag | transition | Same aisle and light. Close-up of one shelf edge with a plain green price tag (no readable text) and a hand with two raised fingers next to it, photographed through a phone camera frame, right half of the image. 16:9. |
| kf_03_cart_full | end | Same cart, now with a few unbranded bottles, a can and a box, a soft green glow around it, the aisle slightly blurred as if the cart is moving right. 16:9. |
| kf_04_cta | CTA background | Wide shot of the aisle from the end, cream light, very calm, plenty of empty space in the centre for a headline. 16:9. |

Mobile versions: same scenes at 9:16, 900x1600, subject in the upper 55 %.

## Motion (image-to-video, model slot `KIE_MODEL`)

| Id | Input | Prompt |
|---|---|---|
| mo_hero | kf_01 -> kf_03 | Short cinematic image-to-video for a scrollytelling website. Slow, stable dolly forward along the aisle; the cart fills with products one by one; no hectic motion, no hard cuts, no zooms, no morphing, keep the cart, light and perspective stable. MP4, 6-8 s. |
| mo_proof | kf_02 | Slow push-in on the price tag and the two raised fingers, the phone frame steady. MP4, 5 s. |

Avoid in all motion: text, logos, fast zooms, shaking, morphing artifacts, new objects, changing perspective.

## Pipeline when keys exist
1. Generate keyframes and motion clips; store MP4s outside `public/` (they are large).
2. `python3 codigo/apps/web/story/compile_sequence.py <clip>.mp4 --out codigo/apps/web/public/story/frames/hero --id hero --fps 24 --width 1880 --height 920 --public-url /story/frames/hero --overwrite` (and a 900x1600 mobile run).
3. Replace the procedural `render(p)` in `story.js` with a loader for `manifest.json` (`frameUrlTemplate`, `frameCount`) and preload the frames.
4. Keep the total under a few MB per sequence (webp, quality around 80).
