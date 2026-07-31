/**
 * Pronunciation lexicon for the voiced copy only. Captions are built separately
 * from the original beat text (`studio/captions.ts`), so the screen always keeps
 * the correct spelling while the voice hears a respelling.
 *
 * ## Two lists, because they have different failure modes
 *
 * `INDIAN_TERMS` is respelled **for a non-Indian voice only**. An `en-IN`/`hi-IN`
 * voice is trained on these names and says them natively; feeding it phonetics
 * authored for an American ear over-corrects a reading that was already right.
 * Row 12.6 now routes the 11 India-first subjects to `en-IN-NeerjaExpressiveNeural`,
 * so in practice this list is the fallback for the global-subject and
 * user-overrode-the-voice cases.
 *
 * `TECH_TERMS` applies to every English voice, because no voice knows that nginx
 * is said "engine X". Kept small and limited to pronunciations that are
 * documented conventions rather than opinions.
 *
 * ## What is NOT verified here
 *
 * These respellings have not been checked by ear. Duration probing cannot
 * settle it — a multi-syllable respelling is longer than the raw token by
 * construction, whether or not the raw token was read correctly. Run
 * `node scripts/lexicon-check.mjs` to voice every entry both ways and listen.
 *
 * Convention, matching the six entries this replaces: `aa` = long a (father),
 * `ee` = long i (machine), `oo` = long u (rule), `uh`/bare vowel = schwa. Only
 * terms an English TTS plausibly gets wrong are listed — `Goa` and `Delhi` are
 * not here because they need no help.
 */

export type Respelling = [RegExp, string];

/** Polity, law and administration — the vocabulary of the UPSC-facing subjects. */
const POLITY: Respelling[] = [
  [/\bLok Sabha\b/gi, "Loke Sub-haa"],
  [/\bRajya Sabha\b/gi, "Raajya Sub-haa"],
  [/\bVidhan Sabha\b/gi, "Vid-haan Sub-haa"],
  [/\bVidhan Parishad\b/gi, "Vid-haan Pa-ri-shad"],
  [/\bGram Sabha\b/gi, "Graam Sub-haa"],
  [/\bZila Parishad\b/gi, "Zil-laa Pa-ri-shad"],
  [/\bPanchayat(i)?\b/gi, "Pun-chaa-yat$1"],
  [/\bLokpal\b/gi, "Loke-paal"],
  [/\bLokayukta\b/gi, "Loke-aa-yook-ta"],
  [/\bKesavananda\b/gi, "Kay-sha-vaa-nanda"],
  [/\bMinerva Mills\b/gi, "Mi-ner-va Mills"],
  [/\bNiti Aayog\b/gi, "Nee-ti Aa-yog"],
  [/\bRashtrapati\b/gi, "Raash-tra-pa-ti"],
  [/\bPradhan Mantri\b/gi, "Pra-dhaan Man-tree"],
  [/\bSarpanch\b/gi, "Sar-punch"],
  [/\bAdhiniyam\b/gi, "A-dhi-ni-yam"],
  [/\bSwaraj\b/gi, "Swa-raaj"],
  [/\bDiwani\b/gi, "Dee-waa-nee"],
  [/\bZamindari\b/gi, "Za-meen-daa-ree"],
  [/\bRyotwari\b/gi, "Ryot-waa-ree"],
  [/\bMahalwari\b/gi, "Ma-hal-waa-ree"],
];

/** Dynasties, rulers and empires. */
const HISTORY: Respelling[] = [
  [/\bMaurya(n)?\b/gi, "Mour-ya$1"],
  [/\bChandragupta\b/gi, "Chun-dra-goop-ta"],
  [/\bSamudragupta\b/gi, "Sa-moo-dra-goop-ta"],
  [/\bAshoka(n)?\b/gi, "A-sho-ka$1"],
  [/\bKalinga\b/gi, "Ka-ling-ga"],
  [/\bHarshavardhana\b/gi, "Hur-sha-var-dha-na"],
  [/\bSatavahana\b/gi, "Saa-ta-vaa-ha-na"],
  [/\bRashtrakuta\b/gi, "Raash-tra-koo-ta"],
  [/\bChalukya(n)?\b/gi, "Cha-look-ya$1"],
  [/\bPallava(s)?\b/gi, "Pul-la-va$1"],
  [/\bKakatiya\b/gi, "Kaa-ka-tee-ya"],
  [/\bHoysala\b/gi, "Hoy-sa-la"],
  [/\bVijayanagara?\b/gi, "Vi-ja-ya-na-ga-ra"],
  [/\bKrishnadevaraya\b/gi, "Krish-na-day-va-raa-ya"],
  [/\bBahmani\b/gi, "Bah-ma-nee"],
  [/\bPratihara(s)?\b/gi, "Pra-ti-haa-ra$1"],
  [/\bRajaraja\b/gi, "Raa-ja-raa-ja"],
  [/\bRajendra\b/gi, "Raa-jen-dra"],
  [/\bTughlaq\b/gi, "Toog-lak"],
  [/\bKhilji\b/gi, "Khil-jee"],
  [/\bAurangzeb\b/gi, "Ow-rung-zeb"],
  [/\bJahangir\b/gi, "Ja-haan-geer"],
  [/\bHumayun\b/gi, "Hu-maa-yoon"],
  [/\bShivaji\b/gi, "Shi-vaa-jee"],
  [/\bPeshwa(s)?\b/gi, "Pesh-waa$1"],
  [/\bPrithviraj\b/gi, "Prith-vee-raaj"],
  [/\bRanjit Singh\b/gi, "Run-jeet Singh"],
  [/\bTipu Sultan\b/gi, "Tee-poo Sul-taan"],
  [/\bPlassey\b/gi, "Plah-see"],
  [/\bPanipat\b/gi, "Paa-nee-put"],
  [/\bMohenjo-?daro\b/gi, "Mo-hen-jo Daa-ro"],
  [/\bHarappa(n)?\b/gi, "Ha-rup-pa$1"],
  [/\bIndus\b/gi, "In-duss"],
];

/** Rivers, ranges and regions. */
const GEOGRAPHY: Respelling[] = [
  [/\bBrahmaputra\b/gi, "Brah-ma-poo-tra"],
  [/\bGodavari\b/gi, "Go-daa-va-ree"],
  [/\bKaveri\b|\bCauvery\b/gi, "Kaa-vay-ree"],
  [/\bNarmada\b/gi, "Nur-ma-daa"],
  [/\bMahanadi\b/gi, "Ma-haa-na-dee"],
  [/\bSutlej\b/gi, "Sut-lej"],
  [/\bJhelum\b/gi, "Jay-lum"],
  [/\bChenab\b/gi, "Che-naab"],
  [/\bAravalli\b/gi, "A-raa-va-lee"],
  [/\bVindhya(s)?\b/gi, "Vin-dhya$1"],
  [/\bSatpura\b/gi, "Sut-poo-ra"],
  [/\bNilgiri(s)?\b/gi, "Neel-gi-ree$1"],
  [/\bSahyadri\b/gi, "Sah-yaa-dree"],
  [/\bSundarban(s)?\b/gi, "Soon-dar-bun$1"],
  [/\bDeccan\b/gi, "Deck-an"],
  [/\bKutch\b|\bKachchh\b/gi, "Kutch"],
  [/\bChilika\b/gi, "Chil-ka"],
  [/\bLoktak\b/gi, "Lok-tuck"],
  [/\bKanchenjunga\b|\bKangchenjunga\b/gi, "Kan-chen-joong-ga"],
  [/\bCoromandel\b/gi, "Ko-ro-man-del"],
  [/\bMalabar\b/gi, "Ma-la-baar"],
  [/\bTelangana\b/gi, "Te-lung-gaa-na"],
  [/\bChhattisgarh\b/gi, "Chat-tees-garh"],
  [/\bUttarakhand\b/gi, "Ut-ta-raa-khand"],
  [/\bMeghalaya\b/gi, "Meg-haa-la-ya"],
  [/\bArunachal\b/gi, "A-roo-naa-chal"],
];

/** Epics, deities and characters. */
const MYTHOLOGY: Respelling[] = [
  [/\bMahabharata?\b/gi, "Ma-haa-baa-ra-ta"],
  [/\bRamayana?\b/gi, "Raa-maa-ya-na"],
  [/\bBhagavad ?Gita\b/gi, "Bha-ga-vad Gee-taa"],
  [/\bUpanishad(s)?\b/gi, "U-pa-ni-shad$1"],
  [/\bYudhishthira\b/gi, "Yu-dhish-thi-ra"],
  [/\bDuryodhana\b/gi, "Dur-yo-dha-na"],
  [/\bDraupadi\b/gi, "Drow-pa-dee"],
  [/\bArjuna\b/gi, "Ar-joo-na"],
  [/\bArjun\b/gi, "Ar-joon"],
  [/\bBhishma\b/gi, "Bheesh-ma"],
  [/\bAbhimanyu\b/gi, "A-bhi-mun-yu"],
  [/\bShakuni\b/gi, "Shu-ku-nee"],
  [/\bGandhari\b/gi, "Gaan-dhaa-ree"],
  [/\bHanuman\b/gi, "Hu-noo-maan"],
  [/\bRavana\b/gi, "Raa-va-na"],
  [/\bLakshmana\b/gi, "Luk-shma-na"],
  [/\bVibhishana\b/gi, "Vi-bhee-sha-na"],
  [/\bSugriva\b/gi, "Su-gree-va"],
  [/\bDasharatha\b/gi, "Da-sha-ra-tha"],
  [/\bKaikeyi\b/gi, "Kai-kay-yee"],
  [/\bValmiki\b/gi, "Vaal-mee-kee"],
  [/\bVishnu\b/gi, "Vish-noo"],
  [/\bParvati\b/gi, "Paar-va-tee"],
  [/\bSaraswati\b/gi, "Sa-rus-va-tee"],
  [/\bGanesh(a)?\b/gi, "Ga-naysh$1"],
  [/\bKartikeya\b/gi, "Kaar-ti-kay-ya"],
  [/\bNarasimha\b/gi, "Na-ra-sim-ha"],
  [/\bGaruda\b/gi, "Ga-roo-da"],
  [/\bAvatar(a)?\b/gi, "A-va-taar$1"],
];

/** Monuments, dance, music and craft. */
const ART_CULTURE: Respelling[] = [
  [/\bKailasa\b/gi, "Kye-laa-saa"],
  [/\bKhajuraho\b/gi, "Ka-joo-raa-ho"],
  [/\bAjanta\b/gi, "A-jun-ta"],
  [/\bEllora\b/gi, "El-lo-ra"],
  [/\bSanchi\b/gi, "Saan-chee"],
  [/\bKonark\b/gi, "Ko-naark"],
  [/\bMahabalipuram\b/gi, "Ma-haa-ba-li-poo-ram"],
  [/\bHampi\b/gi, "Hum-pee"],
  [/\bFatehpur Sikri\b/gi, "Fut-teh-poor See-kree"],
  [/\bBrihadeeswara(r)?\b/gi, "Bri-ha-dees-wa-ra"],
  [/\bDilwara\b/gi, "Dil-waa-ra"],
  [/\bElephanta\b/gi, "El-e-fan-ta"],
  [/\bBharatanatyam\b/gi, "Bha-ra-ta-naat-yam"],
  [/\bKathakali\b/gi, "Ka-tha-ka-lee"],
  [/\bKuchipudi\b/gi, "Koo-chi-poo-dee"],
  [/\bOdissi\b/gi, "O-di-see"],
  [/\bMohiniyattam\b/gi, "Mo-hi-ni-yaat-tam"],
  [/\bSattriya\b/gi, "Sat-tree-ya"],
  [/\bCarnatic\b/gi, "Kar-naa-tik"],
  [/\bHindustani\b/gi, "Hin-doo-staa-nee"],
  [/\bMridangam\b/gi, "Mri-dung-gam"],
  [/\bShehnai\b/gi, "Sheh-naa-ee"],
  [/\bSarod\b/gi, "Sa-rode"],
  [/\bMadhubani\b/gi, "Maa-dhu-baa-nee"],
  [/\bPattachitra\b/gi, "Pat-ta-chi-tra"],
  [/\bKalamkari\b/gi, "Ka-lam-kaa-ree"],
  [/\bPhulkari\b/gi, "Phool-kaa-ree"],
  [/\bChikankari\b/gi, "Chi-kan-kaa-ree"],
  [/\bBandhani\b/gi, "Baan-dha-nee"],
  [/\bPashmina\b/gi, "Push-mee-na"],
];

/** Schemes, institutions and market words the finance/economy subjects use. */
const ECONOMY: Respelling[] = [
  [/\bAadhaar\b/gi, "Aa-dhaar"],
  [/\bMGNREGA\b/g, "M G N-rega"],
  [/\bJan Dhan\b/gi, "Jun Dhun"],
  [/\bAyushman\b/gi, "Aa-yush-maan"],
  [/\bSensex\b/gi, "Sen-sex"],
  [/\bNifty\b/gi, "Nif-tee"],
  [/\bMandi(s)?\b/gi, "Mun-dee$1"],
];

/**
 * Names every English voice gets wrong regardless of locale. Deliberately short:
 * only pronunciations that are documented project conventions, not preferences.
 */
export const TECH_TERMS: Respelling[] = [
  [/\bnginx\b/gi, "engine X"],
  [/\bRedis\b/g, "Red-iss"],
  [/\bKubernetes\b/g, "Koo-ber-net-ees"],
  [/\bPydantic\b/g, "Pie-dan-tic"],
  [/\bUvicorn\b/g, "Oo-vee-corn"],
  [/\bGunicorn\b/g, "Goo-nee-corn"],
  [/\bPostgreSQL\b/g, "Post-gres Q L"],
  [/\bPostgres\b/g, "Post-gres"],
  [/\bTimsort\b/g, "Tim sort"],
  [/\bnpm\b/g, "N P M"],
  [/\bkubectl\b/g, "kube control"],
  [/\bTk?inter\b/g, "T K inter"],
];

/** Everything respelled only when the voice is not natively Indian. */
export const INDIAN_TERMS: Respelling[] = [
  ...POLITY,
  ...HISTORY,
  ...GEOGRAPHY,
  ...MYTHOLOGY,
  ...ART_CULTURE,
  ...ECONOMY,
];

/** Named groups, for the listening harness and for reporting coverage. */
export const LEXICON_GROUPS: Record<string, Respelling[]> = {
  polity: POLITY,
  history: HISTORY,
  geography: GEOGRAPHY,
  mythology: MYTHOLOGY,
  artCulture: ART_CULTURE,
  economy: ECONOMY,
  tech: TECH_TERMS,
};

/** A voice that says Indian names natively and must not be handed phonetics. */
export function isNativeIndianVoice(voice: string): boolean {
  return /^(en-IN|hi-IN|bn-IN|ta-IN|te-IN|mr-IN|gu-IN|kn-IN|ml-IN|pa-IN|ur-IN)/i.test(voice);
}
