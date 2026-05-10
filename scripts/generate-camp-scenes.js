const fs = require("node:fs/promises");
const path = require("node:path");

const OUT_DIR = path.join(__dirname, "..", "public", "assets");
const WIDTH = 1600;
const HEIGHT = 900;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;"
  }[char]));
}

function starField(count, color = "rgba(255,255,255,0.7)", seed = 1) {
  let x = seed * 97;
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    x = (x * 9301 + 49297) % 233280;
    const px = Math.floor((x / 233280) * WIDTH);
    x = (x * 9301 + 49297) % 233280;
    const py = Math.floor((x / 233280) * HEIGHT * 0.7);
    x = (x * 9301 + 49297) % 233280;
    const r = 1 + (x / 233280) * 2.4;
    dots.push(`<circle cx="${px}" cy="${py}" r="${r.toFixed(1)}" fill="${color}" opacity="${(0.25 + r / 4).toFixed(2)}"/>`);
  }
  return dots.join("\n");
}

function surfaceCampSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#182844"/>
      <stop offset="0.55" stop-color="#49311f"/>
      <stop offset="1" stop-color="#101214"/>
    </linearGradient>
    <radialGradient id="fire" cx="50%" cy="68%" r="45%">
      <stop offset="0" stop-color="#f9d76a" stop-opacity="0.95"/>
      <stop offset="0.26" stop-color="#f97316" stop-opacity="0.5"/>
      <stop offset="0.65" stop-color="#14532d" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  ${starField(70, "rgba(250, 240, 190, 0.75)", 3)}
  <circle cx="1260" cy="150" r="80" fill="#f7e6b2" opacity="0.85"/>
  <circle cx="1228" cy="132" r="80" fill="#182844" opacity="0.72"/>
  <path d="M0 520 C170 420 300 470 440 390 C620 280 750 370 900 300 C1100 210 1260 300 1600 210 L1600 900 L0 900 Z" fill="#15201a"/>
  <path d="M0 610 C210 530 370 580 520 500 C680 415 790 475 940 420 C1140 350 1330 410 1600 330 L1600 900 L0 900 Z" fill="#202318"/>
  <ellipse cx="805" cy="700" rx="500" ry="145" fill="#060708" opacity="0.55"/>
  <rect x="600" y="460" width="430" height="210" rx="24" fill="#49301f"/>
  <path d="M575 480 L815 305 L1055 480 Z" fill="#7f4b24"/>
  <path d="M815 305 L1068 480 L1028 492 L815 355 Z" fill="#b36a2a"/>
  <rect x="655" y="520" width="110" height="150" rx="8" fill="#1a1512"/>
  <rect x="820" y="525" width="150" height="86" rx="12" fill="#192433"/>
  <path d="M828 535 h132 v66 h-132z" fill="#f7d36f" opacity="0.38"/>
  <g opacity="0.95">
    <path d="M270 690 L320 560 L375 690 Z" fill="#103923"/>
    <path d="M335 700 L390 535 L455 700 Z" fill="#13472c"/>
    <path d="M1215 690 L1265 545 L1328 690 Z" fill="#103923"/>
    <path d="M1290 705 L1350 520 L1420 705 Z" fill="#155233"/>
  </g>
  <circle cx="805" cy="675" r="210" fill="url(#fire)"/>
  <g filter="url(#soft)" opacity="0.88">
    <path d="M750 690 C780 618 835 616 860 690 C822 660 790 660 750 690 Z" fill="#facc15"/>
    <path d="M790 695 C815 620 840 650 855 700 C832 672 815 675 790 695 Z" fill="#fb923c"/>
  </g>
  <path d="M95 805 C280 740 420 805 600 760 C820 705 1005 775 1190 735 C1360 700 1490 735 1600 690 L1600 900 L0 900 L0 830 Z" fill="#0b0d0f"/>
  <rect width="1600" height="900" fill="rgba(0,0,0,0.12)"/>
</svg>`;
}

function undergroundCampSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="cave" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#130d12"/>
      <stop offset="0.48" stop-color="#221313"/>
      <stop offset="1" stop-color="#070708"/>
    </linearGradient>
    <radialGradient id="lavaGlow" cx="50%" cy="76%" r="55%">
      <stop offset="0" stop-color="#fb923c" stop-opacity="0.9"/>
      <stop offset="0.38" stop-color="#dc2626" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <rect width="1600" height="900" fill="url(#cave)"/>
  <path d="M0 0 L95 0 L160 270 L210 0 L405 0 L465 330 L550 0 L750 0 L790 285 L900 0 L1110 0 L1155 315 L1260 0 L1600 0 L1600 900 L0 900 Z" fill="#08080a" opacity="0.82"/>
  <path d="M0 610 C190 560 300 620 470 575 C640 530 820 590 980 545 C1200 480 1380 555 1600 500 L1600 900 L0 900 Z" fill="#1b1515"/>
  <ellipse cx="790" cy="760" rx="570" ry="140" fill="url(#lavaGlow)" filter="url(#blur)"/>
  <path d="M0 770 C260 720 390 790 580 748 C785 704 970 784 1160 730 C1350 680 1505 720 1600 700 L1600 900 L0 900 Z" fill="#070708"/>
  <path d="M170 760 C340 700 475 754 620 710 C795 655 965 725 1140 675 C1325 620 1470 665 1600 610 L1600 740 C1390 760 1220 780 1030 790 C730 807 450 815 170 795 Z" fill="#4b130f"/>
  <path d="M170 758 C360 720 455 775 645 728 C815 686 950 735 1115 700 C1310 660 1450 690 1600 640 L1600 710 C1370 720 1195 742 1000 750 C720 765 465 770 170 790 Z" fill="#f97316" opacity="0.74"/>
  <g opacity="0.95">
    <rect x="510" y="460" width="580" height="180" rx="26" fill="#201a18"/>
    <path d="M475 480 L800 310 L1125 480 Z" fill="#3b2419"/>
    <path d="M800 310 L1125 480 L1075 500 L800 360 Z" fill="#6b341a"/>
    <rect x="610" y="525" width="125" height="115" rx="12" fill="#0d0b0b"/>
    <rect x="820" y="520" width="170" height="80" rx="12" fill="#2a1513"/>
    <path d="M830 532 h150 v56 h-150z" fill="#fb923c" opacity="0.34"/>
  </g>
  <g opacity="0.78">
    <circle cx="325" cy="500" r="26" fill="#f97316"/>
    <circle cx="1235" cy="460" r="22" fill="#f97316"/>
    <circle cx="1370" cy="575" r="15" fill="#fb923c"/>
    <path d="M320 500 C330 430 375 420 395 350" stroke="#f97316" stroke-width="8" fill="none" opacity="0.36"/>
    <path d="M1235 460 C1240 390 1290 360 1310 295" stroke="#f97316" stroke-width="7" fill="none" opacity="0.32"/>
  </g>
  <rect width="1600" height="900" fill="rgba(0,0,0,0.18)"/>
</svg>`;
}

function skyCampSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#09162d"/>
      <stop offset="0.45" stop-color="#1c3d70"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
    <radialGradient id="aura" cx="50%" cy="42%" r="58%">
      <stop offset="0" stop-color="#fef3c7" stop-opacity="0.65"/>
      <stop offset="0.24" stop-color="#60a5fa" stop-opacity="0.28"/>
      <stop offset="0.78" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <filter id="cloudBlur"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  ${starField(95, "rgba(219, 234, 254, 0.9)", 7)}
  <circle cx="780" cy="320" r="390" fill="url(#aura)"/>
  <g filter="url(#cloudBlur)" opacity="0.62">
    <ellipse cx="285" cy="590" rx="260" ry="75" fill="#dbeafe"/>
    <ellipse cx="585" cy="645" rx="360" ry="88" fill="#bfdbfe"/>
    <ellipse cx="1210" cy="575" rx="320" ry="92" fill="#dbeafe"/>
    <ellipse cx="1040" cy="690" rx="420" ry="100" fill="#93c5fd"/>
  </g>
  <path d="M265 650 C455 590 585 625 740 560 C905 490 1060 555 1240 500 C1390 455 1510 500 1600 455 L1600 900 L0 900 L0 715 C90 715 160 680 265 650 Z" fill="#1e293b" opacity="0.72"/>
  <g opacity="0.96">
    <path d="M430 590 L800 380 L1170 590 Z" fill="#e0f2fe" opacity="0.2"/>
    <path d="M540 610 L800 455 L1060 610 Z" fill="#e5e7eb"/>
    <path d="M800 455 L1060 610 L1012 625 L800 500 Z" fill="#94a3b8"/>
    <rect x="600" y="610" width="400" height="110" rx="28" fill="#dbeafe"/>
    <rect x="670" y="645" width="105" height="75" rx="15" fill="#172554" opacity="0.72"/>
    <rect x="825" y="640" width="135" height="62" rx="18" fill="#1e3a8a" opacity="0.7"/>
    <circle cx="808" cy="585" r="42" fill="#fef3c7" opacity="0.86"/>
  </g>
  <g opacity="0.72">
    <path d="M300 710 C450 655 550 718 710 665 C890 605 1035 690 1200 630 C1350 575 1490 620 1600 580 L1600 900 L0 900 L0 745 C100 755 190 745 300 710 Z" fill="#020617"/>
    <path d="M150 790 C310 760 480 805 640 760 C800 715 960 775 1130 728 C1320 675 1465 720 1600 690 L1600 900 L0 900 L0 810 Z" fill="#0f172a"/>
  </g>
  <rect width="1600" height="900" fill="rgba(255,255,255,0.04)"/>
</svg>`;
}

const scenes = [
  ["camp-surface-scene.svg", surfaceCampSvg],
  ["camp-underground-scene.svg", undergroundCampSvg],
  ["camp-sky-scene.svg", skyCampSvg]
];

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const [fileName, makeSvg] of scenes) {
    const svg = makeSvg();
    if (!svg.includes("<svg")) throw new Error(`Invalid SVG for ${esc(fileName)}`);
    const outPath = path.join(OUT_DIR, fileName);
    await fs.writeFile(outPath, svg.trim(), "utf8");
    console.log(`wrote ${outPath}`);
  }
})();
