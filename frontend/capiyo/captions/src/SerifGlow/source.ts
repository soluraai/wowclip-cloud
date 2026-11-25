import transcript from "../StyleTwo/demo.transcript.json";
import type { SerifGlowDirection, SerifGlowSource } from "./types";

const phrase = (from: number, through: number, glow = false): SerifGlowDirection => ({
  from: `w${from}`, through: `w${through}`, treatment: glow ? "glow" : "plain",
});

/** Phrase edits for the original speech; all copy still comes from the timed transcript. */
export const serifGlowSource: SerifGlowSource = {
  transcript,
  durationMs: 44044,
  background: { src: "why_not_you_hq.mp4", muted: false, volume: 1 },
  direction: [
    phrase(0, 1),                 // and my
    phrase(2, 3),                 // personal question
    phrase(4, 6),                 // to you is
    phrase(7, 9, true),           // why not you?
    phrase(10, 12),
    phrase(13, 13, true),         // brains
    phrase(14, 16),
    phrase(17, 17, true),         // decisions
    phrase(18, 20),
    phrase(21, 22, true),         // the plan
    phrase(23, 25),
    phrase(26, 27, true),         // your life
    phrase(28, 30),
    phrase(31, 31, true),         // immensely
    phrase(32, 33),
    phrase(34, 36),
    phrase(37, 38),
    phrase(39, 40),
    phrase(41, 41, true),         // dreams
    phrase(42, 43),
    phrase(44, 47),
    phrase(48, 49, true),         // financial wall
    phrase(50, 51),
    phrase(52, 52, true),         // family
    phrase(53, 54),
    phrase(55, 56),
    phrase(57, 59),
    phrase(60, 60, true),         // healthy
    phrase(61, 63),
    phrase(64, 64, true),         // powerful
    phrase(65, 67, true),
    phrase(68, 70),
    phrase(71, 73),
    phrase(74, 75),
    phrase(76, 77),
    phrase(78, 79, true),         // my support
    phrase(80, 82),
    phrase(83, 84, true),         // personal dreams
    phrase(85, 86),
    phrase(87, 88),
    phrase(89, 90),
    phrase(91, 93, true),
    phrase(94, 96),
    phrase(97, 99),
    phrase(100, 101),
    phrase(102, 103),
    phrase(104, 105),
    phrase(106, 107),
    phrase(108, 109),
    phrase(110, 111, true),       // with you
    phrase(112, 113),
    phrase(114, 114, true),       // journey
    phrase(115, 117),
    phrase(118, 118),
    phrase(119, 120),
    phrase(121, 121, true),       // world
  ],
};
