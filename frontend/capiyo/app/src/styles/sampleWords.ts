import type { Cue } from "../app/CaptionTimeline";

/**
 * Sample captions for My styles' studio, so a look can be built and checked in the language it will be used in.
 * Words wrapped in *stars* are key words (they show emphasis, like the AI's picks on a real video).
 */
export const SAMPLE_LANGUAGES = [
  { id: "en", label: "English", lines: [
    "Every *big* change starts with one small step",
    "Show up every day and the *results* follow",
    "Your story is *worth* telling, so tell it loud",
    "Keep going, the *best* part is just ahead",
  ] },
  { id: "hi", label: "हिन्दी", lines: [
    "हर बड़ा *बदलाव* एक छोटे कदम से शुरू होता है",
    "रोज़ मेहनत करो तो *नतीजे* खुद आते हैं",
    "तुम्हारी कहानी *सुनाने* लायक है",
    "चलते रहो, सबसे *अच्छा* अभी बाकी है",
  ] },
  { id: "hinglish", label: "Hinglish", lines: [
    "Har bada *badlaav* ek chhote kadam se shuru hota hai",
    "Roz mehnat karo toh *results* khud aate hain",
    "Tumhari story *sunane* laayak hai",
    "Chalte raho, sabse *best* abhi baaki hai",
  ] },
  { id: "ta", label: "தமிழ்", lines: [
    "ஒவ்வொரு பெரிய *மாற்றமும்* ஒரு சிறிய அடியில் தொடங்குகிறது",
    "தினமும் உழைத்தால் *வெற்றி* தானாக வரும்",
    "உன் கதை *சொல்லத்* தகுந்தது",
    "தொடர்ந்து நட, *சிறந்தது* இன்னும் வரவிருக்கிறது",
  ] },
  { id: "bn", label: "বাংলা", lines: [
    "প্রতিটি বড় *পরিবর্তন* একটি ছোট পদক্ষেপে শুরু হয়",
    "প্রতিদিন চেষ্টা করো, *ফল* নিজেই আসবে",
    "তোমার গল্প *বলার* মতো",
    "এগিয়ে চলো, *সেরা* সময় সামনে",
  ] },
  { id: "es", label: "Español", lines: [
    "Cada gran *cambio* empieza con un pequeño paso",
    "Hazlo cada día y los *resultados* llegan",
    "Tu historia *merece* ser contada",
    "Sigue adelante, lo *mejor* está por venir",
  ] },
] as const;

export type SampleLanguage = (typeof SAMPLE_LANGUAGES)[number]["id"];

/** The sample lines as timed words, one line every few seconds, looped to fill `seconds`. */
export function sampleCues(language: SampleLanguage, seconds: number): Cue[] {
  const lines = (SAMPLE_LANGUAGES.find((item) => item.id === language) ?? SAMPLE_LANGUAGES[0]).lines;
  const cues: Cue[] = [];
  let at = 0.2;
  // Stops at the first line that would run past the end (and after a few rounds at most).
  fill: for (let round = 0; round < 12; round++) {
    for (const [index, line] of lines.entries()) {
      const words = line.split(" ");
      const length = Math.min(3.4, 0.42 * words.length + 0.6);
      if (at + length > seconds) break fill;
      const step = length / words.length;
      words.forEach((raw, k) => {
        const key = /^\*.+\*$/.test(raw);
        const hero = raw.replace(/\*/g, "");
        cues.push({
          id: `s${round}_${index}_${k}`,
          hero,
          start: Number((at + k * step).toFixed(3)),
          end: Number((at + (k + 1) * step - 0.02).toFixed(3)),
          ...(key && { highlighted: true, aiEmphasis: true }),
        });
      });
      at += length + 0.25;
    }
  }
  return cues;
}
