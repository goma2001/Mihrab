/**
 * The first screen, the way round the page, and what every language's page
 * carries.
 *
 * The site was checked in November 2026 and three things held it back, none
 * of them speed: the hero had no way to install the app and no picture of
 * it; the English page was thirty-seven phone screens long with no links to
 * its sections, a third of it one feature list written out in full; and the
 * eleven generated languages had no Accuracy section — the claim the app
 * leads with, on the pages its installs come from. These are the ways each
 * could quietly come back.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const LANGS = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts', 'site', 'strings.json'), 'utf-8'),
) as Record<string, { path: string; accuracy?: { table?: unknown } }>;
const { PLATFORMS, OPERATING_SYSTEMS, CSS_V } = require('../scripts/build-site.js');

const codes = Object.keys(LANGS);
const pageOf = (code: string) =>
  readFileSync(
    code === 'en' ? path.join(DOCS, 'index.html') : path.join(DOCS, code, 'index.html'),
    'utf-8',
  );
const heroOf = (code: string) => /<header class="hero">[\s\S]*?<\/header>/.exec(pageOf(code))![0];

describe('the first screen gets the app onto a device', () => {
  it.each(codes)('%s offers both stores in the hero, and a link to every other channel', code => {
    const hero = heroOf(code);
    expect(hero).toContain('badges/appstore.png');
    expect(hero).toContain('badges/googleplay.png');
    const more = /<a class="more" href="(#[\w-]+)">/.exec(hero);
    expect(more).not.toBeNull();
    expect(pageOf(code)).toContain(`id="${more![1].slice(1)}"`);
  });

  it.each(codes)('%s shows the app in the hero, described in its own language', code => {
    const img = /<figure class="hero-shot">[\s\S]*?<img[^>]*>/.exec(heroOf(code));
    expect(img).not.toBeNull();
    expect(img![0]).toMatch(/alt="[^"]{20,}"/);
    // The first picture on the page is not left for the browser to fetch late.
    expect(img![0]).not.toContain('loading="lazy"');
    expect(existsSync(path.join(DOCS, 'assets', 'img', 'hero-home.jpg'))).toBe(true);
  });

  it('does not show the hero’s phone on a phone, where it was cut in half, nor download it there', () => {
    const css = readFileSync(path.join(DOCS, 'assets', 'site.css'), 'utf-8');
    expect(css).toMatch(/\n\.hero-shot \{ display: none; \}/);
    expect(css).toMatch(/@media \(min-width: 900px\) \{[^@]*\.hero-shot \{ display: block;/);
    for (const code of codes) {
      expect(heroOf(code)).toMatch(/<source media="\(max-width: 899px\)" srcset="data:image\/gif;base64,/);
    }
  });

  it.each(codes)('%s names every platform the page offers, in the hero and the structured data', code => {
    expect(heroOf(code)).toContain(`<span>${PLATFORMS}</span>`);
    expect(pageOf(code)).toContain(`"operatingSystem": "${OPERATING_SYSTEMS}"`);
  });
});

describe('a long page can be got round', () => {
  it.each(codes)('%s links to its sections, and every link lands on one', code => {
    const page = pageOf(code);
    const nav = /<nav class="jump"[\s\S]*?<\/nav>/.exec(page);
    expect(nav).not.toBeNull();
    const links = [...nav![0].matchAll(/href="#([\w-]+)"/g)].map(m => m[1]);
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const id of links) expect(page).toContain(`id="${id}"`);
  });

  it('folds the English feature list: every feature a name that opens, none dropped', () => {
    const section = /<section class="features" id="features">[\s\S]*?<\/section>/.exec(pageOf('en'))![0];
    const items = section.match(/<li>/g)!.length;
    expect(items).toBeGreaterThanOrEqual(50);
    expect(section.match(/<li><details><summary><b>/g)!.length).toBe(items);
  });

  it('offers the wide device picture at a phone’s width too', () => {
    expect(pageOf('en')).toMatch(/xplat-1200\.jpg[^ ]* 1200w/);
    expect(existsSync(path.join(DOCS, 'assets', 'img', 'panels', 'xplat-1200.jpg'))).toBe(true);
  });
});

describe('accuracy is on every page that leads with it', () => {
  const generated = codes.filter(c => c !== 'en' && c !== 'sv');

  it.each(generated)('%s has the section, its table in its own words, and the report link', code => {
    const section = /<section class="accuracy-section" id="accuracy"[\s\S]*?<\/section>/.exec(pageOf(code));
    expect(section).not.toBeNull();
    expect(section![0]).toContain('<table class="accuracy">');
    // The method's name is given, not linked upstream; the report link
    // points at this fork's issues.
    expect(section![0]).toContain('mihrab-methods');
    expect(section![0]).not.toContain('github.com/MihrabHQ/mihrab-methods');
    expect(section![0]).toContain('github.com/goma2001/salaty/issues/new');
    // Its own words, not the English table's — which names an authority
    // the translated pages leave to the Swedish one.
    expect(LANGS[code].accuracy?.table).toBeDefined();
    expect(section![0]).not.toContain('Matches the published timetable of');
  });

  it.each(generated)('%s says the published tables are not part of the check, and that it is independent', code => {
    const section = /<section class="accuracy-section"[\s\S]*?<\/section>/.exec(pageOf(code))![0];
    expect(section).toContain('MUIS');
    expect(section).toContain('JAKIM');
    expect(section).toContain('Türkiye Takvimi');
    expect(section.match(/<article class="card">/g)!.length).toBe(4);
  });

  it.each(generated)('%s answers the accuracy questions too', code => {
    const page = pageOf(code);
    const faq = /<section class="faq" id="faq">[\s\S]*?<\/section>/.exec(page)![0];
    expect(faq.match(/<article class="card">/g)!.length).toBeGreaterThanOrEqual(9);
    expect(faq).toContain('OpenStreetMap');
    expect(faq).toContain('mihrab-methods');
  });
});

/**
 * Mihrab Web — the same app in a browser at mihrabhq.github.io — is gone:
 * the fork ships the installed app only. No page may offer it, link to it,
 * or describe it to a search engine.
 */
describe('Mihrab Web is gone: no page offers or links to it', () => {
  it.each(codes)('%s has no web section, no hero button for it, and no link to it', code => {
    const page = pageOf(code);
    expect(page).not.toContain('class="webapp"');
    expect(page).not.toContain('class="open-web"');
    expect(page).not.toContain('mihrabhq.github.io');
    expect(page).not.toContain('Mihrab Web');
    expect(heroOf(code)).not.toContain('open-web');
  });

  it.each(codes)('%s does not link to it from the section links, and its questions do not answer it', code => {
    const page = pageOf(code);
    expect(/<nav class="jump"[\s\S]*?<\/nav>/.exec(page)![0]).not.toContain('href="#web"');
    const faq = /<section class="faq"[\s\S]*?<\/section>/.exec(page);
    if (faq) expect(faq[0]).not.toContain('mihrabhq.github.io');
  });

  it.each(codes)('%s does not describe it to a search engine', code => {
    const blocks = Array.from(
      pageOf(code).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
      m => JSON.parse(m[1]),
    );
    expect(blocks.find(b => b['@type'] === 'WebApplication')).toBeUndefined();
    // And the installed app is still the first block, which other tests read.
    expect(blocks[0]['@type']).toBe('MobileApplication');
  });

  it('does not offer it below the hero either', () => {
    for (const code of codes) {
      const install = /<section class="install"[\s\S]*?<\/section>/.exec(pageOf(code))![0];
      expect(install).not.toContain('class="platform web"');
      expect(install).not.toContain('mihrabhq.github.io');
    }
  });
});

describe('a page asks for the stylesheet it was written for', () => {
  // Page and stylesheet are cached separately; unstamped, a phone drew new
  // markup with an old sheet and showed an empty frame in the hero.
  it.each(codes)('%s stamps the stylesheet link with the sheet’s contents', code => {
    expect(CSS_V).toMatch(/^\?v=[0-9a-f]{10}$/);
    expect(pageOf(code)).toContain(`assets/site.css${CSS_V}"`);
  });
});
