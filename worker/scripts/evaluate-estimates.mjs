const configuredUrl = process.env.EATLOG_WORKER_URL;
if (!configuredUrl) throw new Error('Set EATLOG_WORKER_URL before running the live estimate evaluation.');

const baseUrl = new URL(configuredUrl);
if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password
  || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) {
  throw new Error('EATLOG_WORKER_URL must be a public HTTPS origin without credentials, query, or fragment.');
}

const cases = [
  {
    description: 'one banana',
    required: [['banana']],
    componentRange: [1, 1],
  },
  {
    description: 'one cup rice and chicken adobo',
    required: [['rice'], ['chicken'], ['oil'], ['sauce', 'soy']],
    forbiddenExact: ['chicken adobo', 'chicken adobo with rice'],
    componentRange: [4, 8],
  },
  {
    description: 'dalawang pork lumpia',
    required: [['pork'], ['wrapper', 'lumpia wrapper'], ['oil']],
    forbiddenExact: ['pork lumpia', 'lumpia'],
    componentRange: [3, 7],
  },
  {
    description: 'one labeled strawberry yogurt cup',
    required: [['yogurt']],
    componentRange: [1, 1],
  },
];

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function includesPhrase(value, expected) {
  return ` ${value} `.includes(` ${normalize(expected)} `);
}

async function estimate(description) {
  const response = await fetch(new URL('/v1/estimate', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Eatlog-Install-ID': '00000000000000000000000000000000',
    },
    body: JSON.stringify({ operation: 'describe', text: description }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`${description}: HTTP ${response.status}`);
  return response.json();
}

let failures = 0;
for (const evaluation of cases) {
  const result = await estimate(evaluation.description);
  const names = Array.isArray(result.components)
    ? result.components.map((component) => normalize(String(component.name ?? ''))).filter(Boolean)
    : [];
  const missing = evaluation.required.filter((alternatives) =>
    !alternatives.some((expected) => names.some((name) => includesPhrase(name, expected))),
  );
  const forbidden = (evaluation.forbiddenExact ?? []).filter((dish) => names.includes(normalize(dish)));
  const [minimum, maximum] = evaluation.componentRange;
  const countValid = names.length >= minimum && names.length <= maximum;
  const passed = result.status === 'recognized' && missing.length === 0 && forbidden.length === 0 && countValid;
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${evaluation.description}: ${names.join(', ') || '(none)'}`);
  if (missing.length > 0) console.log(`  missing: ${missing.map((group) => group.join('|')).join(', ')}`);
  if (forbidden.length > 0) console.log(`  parent dish returned: ${forbidden.join(', ')}`);
  if (!countValid) console.log(`  component count: ${names.length}; expected ${minimum}-${maximum}`);
}

console.log(`\n${cases.length - failures}/${cases.length} estimate cases passed.`);
if (failures > 0) process.exitCode = 1;
