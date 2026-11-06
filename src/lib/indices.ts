// MediaPipe Face Landmarker (478-point canonical mesh) index sets.
// "Right"/"left" are the client's own sides. In an unmirrored photo the
// client's right side appears on the image's left.

export const N_LANDMARKS = 478;
/** Mesh points used for warping (iris points excluded: they move with gaze). */
export const N_MESH = 468;

export const R_OUTER_CANTHUS = 33;
export const L_OUTER_CANTHUS = 263;
export const R_INNER_CANTHUS = 133;
export const L_INNER_CANTHUS = 362;
export const NOSE_TIP = 1;

/** Upper brow edge, lateral → medial. */
export const R_BROW_UPPER = [70, 63, 105, 66, 107];
export const L_BROW_UPPER = [300, 293, 334, 296, 336];
/** Lower brow edge, lateral → medial. */
export const R_BROW_LOWER = [46, 53, 52, 65, 55];
export const L_BROW_LOWER = [276, 283, 282, 295, 285];

/** Brow measurement points: medial, mid, lateral. */
export const R_BROW_POINTS = [107, 105, 70] as const;
export const L_BROW_POINTS = [336, 334, 300] as const;

/** Eye contours (outer → inner along the upper lid, then back along the lower lid). */
export const R_EYE_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133];
export const R_EYE_LOWER = [133, 155, 154, 153, 145, 144, 163, 7];
export const L_EYE_UPPER = [263, 466, 388, 387, 386, 385, 384, 398, 362];
export const L_EYE_LOWER = [362, 382, 381, 380, 374, 373, 390, 249];
export const R_EYE_POLY = [...R_EYE_UPPER, ...R_EYE_LOWER];
export const L_EYE_POLY = [...L_EYE_UPPER, ...L_EYE_LOWER];

/** Top of the face oval across the forehead, client's right → left. */
export const FOREHEAD_TOP = [54, 103, 67, 109, 10, 338, 297, 332, 284];

/** Points that barely move between rest, frown, brow raise and squint. */
export const STABLE = [1, 2, 4, 5, 98, 327, 133, 362, 234, 454];
