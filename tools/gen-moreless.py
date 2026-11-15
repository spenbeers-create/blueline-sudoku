"""Builds data/moreless.json for More or Less: well-known topics with how many
times their English Wikipedia article was viewed per month, on average, over the
last twelve full months (Wikimedia pageviews API, people only, no bots).
Run: python tools/gen-moreless.py  (needs internet; takes a minute or two)."""
import json, time, urllib.request, urllib.error, urllib.parse, datetime, os, sys

NL = '\n'
UA = 'BluelineGameData/1.0 (personal hobby project; pageview snapshot)'
TOPICS = {
    'food': 'Pizza Sushi Hamburger Taco Chocolate Coffee Ice_cream Pancake French_fries Ramen Avocado Banana Strawberry Cheese Bacon Popcorn Doughnut Croissant Pasta Burrito Hot_dog Waffle Peanut_butter Mango Pineapple Watermelon Honey Tea Kimchi Spaghetti Pretzel Cupcake Nachos Lasagna Guacamole',
    'animals': 'Dog Cat Elephant Giraffe Lion Tiger Shark Dolphin Octopus Penguin Giant_panda Kangaroo Koala Horse Wolf Owl Western_honey_bee Butterfly Crocodile Hippopotamus Cheetah Gorilla Polar_bear Sloth Axolotl Blue_whale Red_panda Capybara Flamingo Platypus Hedgehog Raccoon Goldfish Parrot Jellyfish',
    'places': 'Paris Tokyo New_York_City London Rome Iceland Hawaii Las_Vegas Dubai Venice Grand_Canyon Mount_Everest Eiffel_Tower Great_Wall_of_China Machu_Picchu Bali Australia Canada Brazil Japan Antarctica Sahara Amazon_rainforest Niagara_Falls Disneyland Times_Square Statue_of_Liberty Colosseum Stonehenge Yellowstone_National_Park Mexico Italy Greece Egypt Ireland',
    'screen': 'Titanic_(1997_film) Avatar_(2009_film) The_Lion_King Frozen_(2013_film) Star_Wars Harry_Potter The_Simpsons Friends SpongeBob_SquarePants Shrek Toy_Story Jurassic_Park The_Office_(American_TV_series) Stranger_Things Game_of_Thrones Breaking_Bad Spider-Man Batman Superman Mickey_Mouse Scooby-Doo Sesame_Street Finding_Nemo The_Wizard_of_Oz Home_Alone',
    'games': 'Minecraft Fortnite Tetris Super_Mario Pac-Man Roblox The_Legend_of_Zelda Chess Monopoly_(game) Sudoku Among_Us Animal_Crossing Wordle Uno_(card_game) Scrabble Rubik\'s_Cube Poker Pokémon Sonic_the_Hedgehog Checkers Jigsaw_puzzle Crossword Dungeons_&_Dragons Candy_Crush_Saga Mario_Kart',
    'sports': 'Association_football Basketball Baseball American_football Tennis Golf Cricket Ice_hockey Formula_One Olympic_Games FIFA_World_Cup Super_Bowl Skateboarding Surfing Boxing Volleyball Bowling Marathon Table_tennis Gymnastics Rugby_union Snowboarding Badminton Cycling Karate',
    'music': 'The_Beatles Taylor_Swift Michael_Jackson Elvis_Presley Beyoncé Queen_(band) Bad_Bunny BTS Rihanna Madonna ABBA Eminem Billie_Eilish Ed_Sheeran Ariana_Grande Bruno_Mars Adele Coldplay Dolly_Parton Lady_Gaga Shakira Freddie_Mercury Bob_Marley Frank_Sinatra Olivia_Rodrigo',
    'history': 'Albert_Einstein Leonardo_da_Vinci Cleopatra Napoleon Abraham_Lincoln William_Shakespeare Isaac_Newton Marie_Curie Wolfgang_Amadeus_Mozart Vincent_van_Gogh Christopher_Columbus Julius_Caesar Queen_Victoria Nikola_Tesla Frida_Kahlo Charles_Darwin Amelia_Earhart Pablo_Picasso Thomas_Edison Benjamin_Franklin Titanic Ancient_Egypt Vikings Ancient_Rome Mona_Lisa',
    'space': 'Moon Sun Mars Jupiter Saturn Black_hole Dinosaur Tyrannosaurus Volcano Earthquake Tornado Rainbow Aurora DNA Gravity Solar_eclipse Milky_Way Diamond Gold Lightning Pluto Comet Big_Bang Venus Neptune',
    'brands': 'Google YouTube Instagram TikTok IPhone Netflix Amazon_(company) Tesla,_Inc. Lego Coca-Cola McDonald\'s Nike,_Inc. The_Walt_Disney_Company Spotify Bitcoin Wikipedia Artificial_intelligence ChatGPT Starbucks IKEA Nintendo PlayStation Barbie Apple_Inc. Microsoft',
    'fun': 'Christmas Halloween Valentine\'s_Day Thanksgiving Easter New_Year\'s_Eve Birthday Friday_the_13th April_Fools\'_Day Fireworks Santa_Claus Unicorn Dragon Ghost Vampire Zombie Mermaid Pirate Ninja Robot Rainbow_trout Roller_coaster Hot_air_balloon Treehouse Pajamas',
}

CACHE_PATH = os.path.join(os.environ.get('TEMP', '.'), 'moreless-cache.json')
try: CACHE = json.load(open(CACHE_PATH, encoding='utf-8'))
except Exception: CACHE = {}

def get(url):
    if url in CACHE: return CACHE[url]
    for attempt in range(6):
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode('utf-8'))
            CACHE[url] = data
            json.dump(CACHE, open(CACHE_PATH, 'w', encoding='utf-8'))
            time.sleep(0.8)                       # be polite to Wikimedia
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                wait = int(e.headers.get('Retry-After') or 0) or 5 * (attempt + 1)
                print(f'  waiting {wait}s ({e.code})', file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError('gave up on ' + url)

def canonical(titles):
    out = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        q = urllib.parse.urlencode({'action': 'query', 'titles': '|'.join(t.replace('_', ' ') for t in chunk), 'redirects': 1, 'format': 'json'})
        data = get('https://en.wikipedia.org/w/api.php?' + q)['query']
        norm = {n['from']: n['to'] for n in data.get('normalized', [])}
        redir = {r['from']: r['to'] for r in data.get('redirects', [])}
        missing = {p['title'] for p in data.get('pages', {}).values() if 'missing' in p}
        for t in chunk:
            name = t.replace('_', ' ')
            name = norm.get(name, name)
            name = redir.get(name, name)
            if name not in missing: out[t] = name
        time.sleep(0.3)
    return out

def main():
    today = datetime.date.today()
    end = today.replace(day=1) - datetime.timedelta(days=1)          # last day of last month
    start = (end.replace(day=1) - datetime.timedelta(days=330)).replace(day=1)
    rng = f"{start:%Y%m%d}00/{end:%Y%m%d}00"
    items, skipped = [], []
    for cat, words in TOPICS.items():
        titles = words.split(' ')
        canon = canonical(titles)
        for t in titles:
            if t not in canon: skipped.append(t); continue
            article = urllib.parse.quote(canon[t].replace(' ', '_'), safe='')
            try:
                data = get(f'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{article}/monthly/{rng}')
                views = [x['views'] for x in data.get('items', [])]
            except Exception as e:
                skipped.append(t); continue
            if len(views) < 6: skipped.append(t); continue
            name = canon[t]
            if name.endswith(')') and ' (' in name: name = name[:name.rindex(' (')]
            name = name.replace(', Inc.', '')
            items.append({'t': name, 'c': cat, 'v': round(sum(views) / len(views))})
            time.sleep(0.12)
        print(cat, len([i for i in items if i['c'] == cat]), file=sys.stderr)
    # Drop exact duplicates of a display name (keep the bigger one).
    seen = {}
    for it in items:
        if it['t'] not in seen or it['v'] > seen[it['t']]['v']: seen[it['t']] = it
    items = sorted(seen.values(), key=lambda x: -x['v'])
    out = {'source': 'English Wikipedia, average monthly views by people', 'from': f'{start:%Y-%m}', 'to': f'{end:%Y-%m}', 'items': items}
    path = os.path.join(os.path.dirname(__file__), '..', 'data', 'moreless.json')
    with open(path, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    # The app loads the topics as a script, so they work offline with the rest of the app.
    head = '/* More or Less topics: average monthly views of each English Wikipedia article by people,' + NL
    head += '   built by tools/gen-moreless.py from the Wikimedia pageviews API. */' + NL
    js = head + '(function (root) {' + NL + "  'use strict';" + NL + '  const DATA = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';' + NL
    js += '  root.MORELESS_DATA = DATA;' + NL + "  if (typeof module === 'object' && module.exports) module.exports = DATA;" + NL
    js += "})(typeof self !== 'undefined' ? self : globalThis);" + NL
    with open(os.path.join(os.path.dirname(__file__), '..', 'js', 'games', 'moreless-data.js'), 'w', encoding='utf-8', newline=NL) as f: f.write(js)
    print(f'{len(items)} topics written; skipped: {skipped}', file=sys.stderr)

if __name__ == '__main__':
    main()
