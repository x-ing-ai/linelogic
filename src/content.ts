import type { Pose, View } from './lib/types';

export const BRAND = 'LineLogic';

export const DISCLAIMER_SHORT =
  'Simulation for education only. Not a prediction of your results. Your provider makes all treatment decisions.';

export const DISCLAIMER_FULL =
  'These images are computer illustrations made from your photos. They are not a guarantee or prediction of your results. ' +
  'Results vary with your anatomy, your skin, the product, the dose and the technique. Neuromodulators relax muscle movement. ' +
  "They don't remove lines that are visible at rest, restore lost volume or tighten skin. Effects are temporary. " +
  'Side effects are possible and are listed next to each plan. This tool does not diagnose any condition or recommend a treatment. ' +
  'Your licensed provider will assess you in person and make the final decision about whether any treatment is right for you.';

export const CONSENT_PHOTOS =
  'I agree to photos of my face and to mapping points on it (face geometry) to create these illustrations. ' +
  'Processing happens on this device. Photos and face maps are not sent to any server and stay on this device until deleted.';

export const CONSENT_CALIBRATION =
  'Optional: my consultation and follow-up photos may be used, on this device, to check how close the illustrations were to my real results.';

export const DEMO_NOTE =
  'Demo build. Everything is stored in this browser only. Use staff or volunteer photos, not client records.';

export const POSE_INFO: Record<Pose, { title: string; prompt: string; optional?: boolean }> = {
  rest: { title: 'Relaxed', prompt: 'Relax the whole face, eyes open, looking at the camera.' },
  closed: {
    title: 'Relaxed, eyes closed',
    prompt: 'Gently close the eyes and let the forehead relax. Used to measure how much the forehead lifts the brows.',
    optional: true,
  },
  frown: { title: 'Frown', prompt: 'Frown as hard as you can: pull the brows down and together.' },
  raise: { title: 'Brows raised', prompt: 'Raise the eyebrows as high as you can.' },
  squint: { title: 'Smile and squint', prompt: 'Smile big and squint so the lines at the outer eye corners show.', optional: true },
};

export const VIEW_LABEL: Record<View, string> = {
  rest: 'At rest',
  frown: 'Frowning',
  raise: 'Brows raised',
  squint: 'Smiling',
};

export const AREAS = {
  glabella: {
    name: 'Frown lines (11s)',
    change: 'Vertical lines between the brows soften when frowning, toward how they look at rest.',
    effects: 'Eyelid drooping (ptosis): 3% in trials.',
  },
  forehead: {
    name: 'Forehead lines',
    change: 'Horizontal forehead lines soften when raising the brows, toward how they look at rest. The brows lift less.',
    effects: 'Headache: 9%. Brow drooping: 2%.',
  },
  crowsFeet: {
    name: "Crow's feet",
    change: 'Lines at the outer eye corners soften when smiling, toward how they look at rest.',
    effects: 'Eyelid swelling: 1%.',
  },
};

export const SIDE_EFFECT_SOURCE = 'Rates from the BOTOX Cosmetic prescribing information (rev. 10/2024); other products differ.';

export const TIMING =
  'Usually starts working in 1–2 days and builds over the first week. Frown-line results last about 3–4 months on the label, then movement gradually returns.';

export const WONT_CHANGE = [
  'Lines that are visible with the face relaxed (etched lines) stay. They can soften over repeated treatments, and other options exist.',
  'Lost volume, such as temple hollowing.',
  'Skin laxity, texture and sun damage.',
  'Hooded upper lids. They can look heavier if the brows sit lower.',
];

export const URGENT =
  'After any treatment: trouble swallowing, speaking or breathing needs urgent care. Call the clinic or 911; do not wait for a message reply.';
