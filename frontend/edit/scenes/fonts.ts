// wowclip: the scene components ask for their fonts through these loaders. They load the real faces from Google
// Fonts (Remotion waits for them before a frame is taken), so the preview and the Lambda render use the same type.
import { loadFont as loadInterFace } from "@remotion/google-fonts/Inter";
import { loadFont as loadOutfitFace } from "@remotion/google-fonts/Outfit";
import { loadFont as loadMontserratFace } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadDancingFace } from "@remotion/google-fonts/DancingScript";
import { loadFont as loadPlayfairFace } from "@remotion/google-fonts/PlayfairDisplay";

type Options = { weights?: (string | number)[]; subsets?: string[] };
type Loaded = { fontFamily: string };

const once = (load: () => string) => {
  let family: string | undefined;
  return (): Loaded => ({ fontFamily: (family ??= load()) });
};

const inter = once(() => loadInterFace("normal", { weights: ["400", "500", "600", "700", "800", "900"], subsets: ["latin"] }).fontFamily);
const outfit = once(() => loadOutfitFace("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] }).fontFamily);
const montserrat = once(() => loadMontserratFace("normal", { weights: ["400", "700", "800"], subsets: ["latin"] }).fontFamily);
const dancing = once(() => loadDancingFace("normal", { weights: ["700"], subsets: ["latin"] }).fontFamily);
const playfair = once(() => loadPlayfairFace("normal", { weights: ["400", "600", "700"], subsets: ["latin"] }).fontFamily);

export const loadInter = (_style?: string, _options?: Options) => inter();
export const loadOutfit = (_style?: string, _options?: Options) => outfit();
export const loadMontserrat = (_style?: string, _options?: Options) => montserrat();
export const loadDancingScript = (_style?: string, _options?: Options) => dancing();
export const loadPlayfair = (_style?: string, _options?: Options) => playfair();
