// Spoken-number parsing for English, Hindi (Devanagari and Roman) when the recogniser returns words instead of digits.
const EN_WORDS = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12,
  thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19,
  twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
};
const HI_LIST = ("शून्य,एक,दो,तीन,चार,पाँच,छह,सात,आठ,नौ,दस,ग्यारह,बारह,तेरह,चौदह,पंद्रह,सोलह,सत्रह,अठारह,उन्नीस," +
  "बीस,इक्कीस,बाईस,तेईस,चौबीस,पच्चीस,छब्बीस,सत्ताईस,अट्ठाईस,उनतीस,तीस,इकतीस,बत्तीस,तैंतीस,चौंतीस,पैंतीस,छत्तीस,सैंतीस,अड़तीस,उनतालीस," +
  "चालीस,इकतालीस,बयालीस,तैंतालीस,चवालीस,पैंतालीस,छियालीस,सैंतालीस,अड़तालीस,उनचास,पचास,इक्यावन,बावन,तिरपन,चौवन,पचपन,छप्पन,सत्तावन,अट्ठावन,उनसठ," +
  "साठ,इकसठ,बासठ,तिरसठ,चौंसठ,पैंसठ,छियासठ,सड़सठ,अड़सठ,उनहत्तर,सत्तर,इकहत्तर,बहत्तर,तिहत्तर,चौहत्तर,पचहत्तर,छिहत्तर,सतहत्तर,अठहत्तर,उन्यासी," +
  "अस्सी,इक्यासी,बयासी,तिरासी,चौरासी,पचासी,छियासी,सत्तासी,अट्ठासी,नवासी,नब्बे,इक्यानवे,बानवे,तिरानवे,चौरानवे,पंचानवे,छियानवे,सत्तानवे,अट्ठानवे,निन्यानवे").split(",");
const HI_WORDS = {};
HI_LIST.forEach((w, i) => { HI_WORDS[w] = i; });
Object.assign(HI_WORDS, { पांच: 5, छः: 6, छ: 6, छे: 6 });
const ROMAN_HI = {
  ek:1, do:2, teen:3, char:4, chaar:4, paanch:5, panch:5, chhe:6, chhah:6, saat:7, aath:8, nau:9, das:10,
  gyarah:11, barah:12, terah:13, chaudah:14, pandrah:15, solah:16, satrah:17, atharah:18, unnis:19, bees:20,
  tees:30, chalis:40, pachas:50, saath:60, sattar:70, assi:80, nabbe:90,
};
const HUNDRED = ["hundred", "sau", "सौ"];
const THOUSAND = ["thousand", "hazaar", "hazar", "hajar", "हज़ार", "हजार"];

function parseSpokenNumber(text) {
  const tokens = text.toLowerCase().replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
  let total = 0, current = 0, found = false;
  for (const w of tokens) {
    let v;
    if (w in EN_WORDS) v = EN_WORDS[w];
    else if (w in HI_WORDS) v = HI_WORDS[w];
    else if (w in ROMAN_HI) v = ROMAN_HI[w];
    if (v !== undefined) { current += v; found = true; continue; }
    if (HUNDRED.includes(w)) { current = (current || 1) * 100; found = true; continue; }
    if (THOUSAND.includes(w)) { total += (current || 1) * 1000; current = 0; found = true; continue; }
  }
  return found ? total + current : null;
}
if (typeof module !== "undefined") module.exports = { parseSpokenNumber };
