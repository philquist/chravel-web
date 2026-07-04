## Swap use-case section imagery

Update `src/lib/useCaseImages.ts` mappings and generate two new photorealistic images.

### Changes

1. **Group Trips** (`group-travel-planning-app`) — replace Cancun beach with the existing Disney family cruise image (`disney-family-cruise.webp`). Update `alt`/`caption` to reflect a group cruise vibe.

2. **Families & Parents** (`family-organization-app`) — generate a new hyper-realistic image of a youth soccer league (kids playing on a field, parents on the sidelines). Save to `src/assets/trip-covers/youth-soccer-family.jpg` using the premium image model. Point the mapping at the new asset.

3. **Faith & Church Groups** (`church-group-trip-coordination`) — generate a new hyper-realistic community-service image (volunteers building/framing a house together, tool belts, lumber). Save to `src/assets/trip-covers/faith-community-build.jpg`. Point the mapping at the new asset.

4. **Conferences & Events** (`conference-event-management-app`) — generate a new hyper-realistic image of a large Las Vegas-style conference ballroom with a speaker on stage and audience seated. Save to `src/assets/trip-covers/conference-ballroom-stage.jpg`. Point the mapping at the new asset.

### Notes

- All three new images generated at premium quality, 1600x1000 (matches existing landscape trip-cover ratio).
- Old assets (`cancun-beach.webp`, `yellowstone-hiking-group.webp`, `tokyo-skyline.webp`) are left in place — they may be used elsewhere as trip covers; only the use-case hub mapping changes.
- No component/layout changes; captions and alt text updated to match new imagery.