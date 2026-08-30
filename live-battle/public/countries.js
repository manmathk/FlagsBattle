export const COUNTRY_CODES = "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT PS QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(' ');

export const COUNTRIES = COUNTRY_CODES.map((code, index) => ({
  code,
  number: index + 1,
  name: new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code,
  flag: [...code].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('')
}));

export const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map((country) => [country.code, country]));
export const COUNTRY_BY_NUMBER = Object.fromEntries(COUNTRIES.map((country) => [String(country.number), country]));

export const ALIASES = {
  usa: 'US', us: 'US', america: 'US', 'united states': 'US', 'united states of america': 'US',
  uk: 'GB', britain: 'GB', 'great britain': 'GB', 'united kingdom': 'GB',
  uae: 'AE', 'united arab emirates': 'AE', russia: 'RU', russian: 'RU',
  korea: 'KR', 'south korea': 'KR', 'republic of korea': 'KR', 'north korea': 'KP', 'dpr korea': 'KP',
  iran: 'IR', 'islamic republic of iran': 'IR', turkey: 'TR', 'türkiye': 'TR',
  czechia: 'CZ', 'czech republic': 'CZ', 'vatican city': 'VA', vatican: 'VA',
  palestine: 'PS', 'state of palestine': 'PS', bolivia: 'BO', 'bolivia (plurinational state of)': 'BO',
  venezuela: 'VE', 'venezuela (bolivarian republic of)': 'VE', tanzania: 'TZ', 'united republic of tanzania': 'TZ',
  vietnam: 'VN', 'viet nam': 'VN', laos: 'LA', 'lao pdr': 'LA', moldova: 'MD', 'republic of moldova': 'MD',
  brunei: 'BN', 'brunei darussalam': 'BN', congo: 'CG', 'republic of the congo': 'CG', 'republic of congo': 'CG',
  'democratic republic of the congo': 'CD', 'dr congo': 'CD', drc: 'CD', 'cote divoire': 'CI', 'côte d’ivoire': 'CI',
  'cote d ivoire': 'CI', eswatini: 'SZ', swaziland: 'SZ', macedonia: 'MK', 'north macedonia': 'MK',
  myanmar: 'MM', burma: 'MM', czech: 'CZ', bhutan: 'BT', india: 'IN', bharat: 'IN', hindustan: 'IN', brasil: 'BR',
  deutschland: 'DE', germany: 'DE', espana: 'ES', españa: 'ES', spain: 'ES', italia: 'IT', italy: 'IT', nippon: 'JP',
  japan: 'JP', 'south africa': 'ZA', 'new zealand': 'NZ', philippines: 'PH', filipinas: 'PH', indonesia: 'ID', pakistan: 'PK',
  bangladesh: 'BD', nepal: 'NP', 'sri lanka': 'LK', ceylon: 'LK', china: 'CN', prc: 'CN', ukraine: 'UA', israel: 'IL',
  egypt: 'EG', nigeria: 'NG', kenya: 'KE', ghana: 'GH', mexico: 'MX', méxico: 'MX', argentina: 'AR', colombia: 'CO',
  chile: 'CL', peru: 'PE', ecuador: 'EC', uruguay: 'UY', paraguay: 'PY', 'costa rica': 'CR', panama: 'PA', panamá: 'PA',
  cuba: 'CU', canada: 'CA', australia: 'AU', france: 'FR', netherlands: 'NL', holland: 'NL', belgium: 'BE', switzerland: 'CH',
  austria: 'AT', poland: 'PL', portugal: 'PT', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', iceland: 'IS',
  ireland: 'IE', greece: 'GR', romania: 'RO', hungary: 'HU', serbia: 'RS', croatia: 'HR', bulgaria: 'BG', slovakia: 'SK',
  slovenia: 'SI', albania: 'AL', armenia: 'AM', georgia: 'GE', azerbaijan: 'AZ', kazakhstan: 'KZ', uzbekistan: 'UZ',
  kyrgyzstan: 'KG', tajikistan: 'TJ', turkmenistan: 'TM', afghanistan: 'AF', iraq: 'IQ', jordan: 'JO', lebanon: 'LB',
  syria: 'SY', qatar: 'QA', kuwait: 'KW', bahrain: 'BH', oman: 'OM', yemen: 'YE'
};

export function normalizeCountryInput(input) {
  if (input == null) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[🇦-🇿]/gu, '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (COUNTRY_BY_NUMBER[compact]) return COUNTRY_BY_NUMBER[compact];
  const upper = compact.toUpperCase();
  if (COUNTRY_BY_CODE[upper]) return COUNTRY_BY_CODE[upper];
  if (ALIASES[compact]) return COUNTRY_BY_CODE[ALIASES[compact]];
  return COUNTRIES.find((country) => country.name.toLowerCase() === compact) || null;
}
