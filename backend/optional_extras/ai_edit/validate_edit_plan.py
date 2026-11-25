import math
import re

FPS = 30
ACCENTS = {"yellow": "#F5B301", "blue": "#38BDF8", "red": "#EF4444", "green": "#22C55E"}
LENGTHS = {"broll": (1.2, 4.5), "card": (1.5, 4.0), "split": (2.5, 9.0), "graphic": (2.4, 7.0), "template": (3.0, 8.0)}
FULL_SCREEN = ("broll", "graphic", "template")
ENTERS = ("cut", "zoom", "slide", "flash", "fade")
MOTIONS = ("in", "out", "left", "right")
LEAD = 0.12
TAIL = 0.15
OPEN_SECONDS = 1.0
CLOSE_SECONDS = 1.5
EDGE_SECONDS = 0.3
GAP_BETWEEN = 0.05
MOST_COVERED = 0.65
TEMPLATES_PER_MINUTE = 3
ZOOMS_PER_MINUTE = 5
VISUALS_PER_MINUTE = 14
GRAPHICS_PER_MINUTE = 4
MOST_MEDIA = 22
MOST_ELEMENTS = 4
MOST_FLASHES = 2
ZOOM_GAP = 5.0
ZOOM_LONGEST = {"punch": 2.5, "push": 6.0}
CUT_LONGEST = 6
CUT_SHARE = 0.15
PAUSE_LONGEST = 0.40
PAUSE_AFTER = 0.14
PAUSE_BEFORE = 0.08
CUT_AFTER = 0.14
CUT_BEFORE = 0.08
START_ROOM = 0.12
END_ROOM = 0.30
SHORTEST_PIECE = 2
FILLERS = {"um", "uh", "uhm", "umm", "erm", "er", "ah", "hmm", "mm", "mhm"}
REPEATABLE = {"i", "the", "a", "an", "and", "to", "we", "you", "it", "is", "that", "so", "but", "my", "of", "in", "he",
              "she", "they", "this", "was", "like"}
WORD_ID = re.compile(r"^w?(\d+)$")
SCENE_TYPES = {"kicker", "text", "number", "statRow", "bullets", "quote", "barGraph", "lineGraph", "pieChart", "table",
               "image", "gallery", "portrait", "divider"}


def frame_of(seconds):
    return int(math.floor(seconds * FPS + 0.5))


def seconds_of(frame):
    return round(frame / FPS, 5)


def word_at(ref, count):
    if isinstance(ref, int):
        return ref if 0 <= ref < count else None
    match = WORD_ID.match(str(ref or "").strip().lower())
    if match is None:
        return None
    index = int(match.group(1))
    return index if 0 <= index < count else None


def bare(text):
    return re.sub(r"[^\w']", "", str(text).lower())


def clean_text(value, longest):
    text = " ".join(str(value or "").split())
    if len(text) <= longest:
        return text
    head = text[:longest + 1]
    cut = head.rsplit(" ", 1)[0] if " " in head else text[:longest]
    return cut.rstrip(" ,;:-")


def clean_read(value):
    text = " ".join(str(value or "").split())
    short = clean_text(text, 420)
    return short if short == text else short + "…"


def number_of(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value if math.isfinite(value) else None
    try:
        number = float(str(value).replace(",", "").replace("%", "").replace("$", "").strip())
        return number if math.isfinite(number) else None
    except ValueError:
        return None


def index_in(value, count):
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value < count else None


def removed_ranges(raw, words, duration):
    count = len(words)
    holds = {word_at(ref, count) for ref in raw.get("holds") or []}
    cut = set()
    cuts = []
    budget = int(count * CUT_SHARE)
    for item in raw.get("cuts") or []:
        if not isinstance(item, dict):
            continue
        first = word_at(item.get("from"), count)
        last = word_at(item.get("to", item.get("from")), count)
        if first is None:
            continue
        if last is None or last < first:
            last = first
        size = last - first + 1
        if size > CUT_LONGEST or len(cut) + size > budget or cut.intersection(range(first, last + 1)):
            continue
        cut.update(range(first, last + 1))
        cuts.append({"first": first, "last": last, "why": clean_text(item.get("why"), 80)})

    ranges = []
    index = 0
    while index < count:
        if index not in cut:
            index += 1
            continue
        first = index
        while index + 1 < count and index + 1 in cut:
            index += 1
        last = index
        if first == 0:
            start = 0.0
        else:
            previous_end = words[first - 1]["end"]
            start = previous_end + min(CUT_AFTER, max(0.0, words[first]["start"] - previous_end))
        if last == count - 1:
            end = duration
        else:
            next_start = words[last + 1]["start"]
            end = next_start - min(CUT_BEFORE, max(0.0, next_start - words[last]["end"]))
        ranges.append((start, end))
        index += 1

    kept = [index for index in range(count) if index not in cut]
    for before, after in zip(kept, kept[1:]):
        if after != before + 1 or before in holds:
            continue
        gap = words[after]["start"] - words[before]["end"]
        if gap > PAUSE_LONGEST:
            ranges.append((words[before]["end"] + PAUSE_AFTER, words[after]["start"] - PAUSE_BEFORE))
    if kept:
        ranges.append((0.0, words[kept[0]]["start"] - START_ROOM))
        ranges.append((words[kept[-1]]["end"] + END_ROOM, duration))
    return ranges, cuts


def keep_ranges(ranges, duration):
    last_frame = frame_of(duration)
    removed = []
    for start, end in ranges:
        first = math.ceil(max(0.0, start) * FPS - 1e-6)
        last = math.floor(min(duration, end) * FPS + 1e-6)
        if last - first >= SHORTEST_PIECE:
            removed.append([first, min(last, last_frame)])
    removed.sort()
    merged = []
    for first, last in removed:
        if merged and first <= merged[-1][1] + SHORTEST_PIECE:
            merged[-1][1] = max(merged[-1][1], last)
        else:
            merged.append([first, last])
    keep = []
    cursor = 0
    for first, last in merged:
        if first - cursor >= SHORTEST_PIECE:
            keep.append([cursor, first])
        cursor = max(cursor, last)
    if last_frame - cursor >= SHORTEST_PIECE:
        keep.append([cursor, last_frame])
    if not keep:
        keep = [[0, last_frame]]
    return [[seconds_of(first), seconds_of(last)] for first, last in keep]


def media_request(raw, want=None):
    if not isinstance(raw, dict):
        return None
    query = clean_text(raw.get("query"), 100)
    if len(query) < 2:
        return None
    kind = want or ("video" if raw.get("want") == "video" else "photo")
    return {"query": query, "want": kind, "look": clean_text(raw.get("look"), 160)}


def clean_rows(rows, columns):
    clean = []
    for row in rows[:4] if isinstance(rows, list) else []:
        if not isinstance(row, list):
            continue
        cells = [clean_text(cell, 18) if cell is not None else "" for cell in row[:columns]]
        clean.append(cells + [""] * (columns - len(cells)))
    return clean


def clean_element(raw):
    if not isinstance(raw, dict) or raw.get("type") not in SCENE_TYPES:
        return None
    kind = raw["type"]
    if kind == "divider":
        return {"type": "divider"}
    if kind == "kicker":
        value = clean_text(raw.get("value"), 28).upper()
        return {"type": "kicker", "value": value} if value else None
    if kind == "text":
        value = clean_text(raw.get("value"), 90)
        if not value:
            return None
        tone = raw.get("tone") if raw.get("tone") in ("title", "body") else "title"
        emphasis = [clean_text(item, 40) for item in raw.get("emphasis") or [] if isinstance(item, str)]
        emphasis = [item for item in emphasis if item and item.lower() in value.lower()][:1]
        return {"type": "text", "value": value, "tone": tone, "emphasis": emphasis}
    if kind == "number":
        value = number_of(raw.get("value"))
        if value is None:
            value = clean_text(raw.get("value"), 12)
            if not value:
                return None
        element = {"type": "number", "value": value, "label": clean_text(raw.get("label"), 60)}
        for name, longest in (("prefix", 4), ("suffix", 6)):
            if raw.get(name):
                element[name] = clean_text(raw.get(name), longest)
        return element
    if kind == "statRow":
        stats = []
        for item in raw.get("stats") or []:
            if not isinstance(item, dict):
                continue
            value = number_of(item.get("value"))
            if value is None:
                value = clean_text(item.get("value"), 10)
            if value == "":
                continue
            stat = {"value": value, "label": clean_text(item.get("label"), 32)}
            for name, longest in (("prefix", 4), ("suffix", 6)):
                if item.get(name):
                    stat[name] = clean_text(item.get(name), longest)
            stats.append(stat)
        stats = stats[:3]
        if len(stats) < 2:
            return None
        element = {"type": "statRow", "stats": stats}
        if index_in(raw.get("highlight"), len(stats)) is not None:
            element["highlight"] = raw["highlight"]
        return element
    if kind == "bullets":
        items = [clean_text(item, 48) for item in raw.get("items") or [] if isinstance(item, (str, int, float))]
        items = [item for item in items if item][:5]
        if len(items) < 2:
            return None
        marker = raw.get("marker") if raw.get("marker") in ("number", "check", "dash", "dot") else "dash"
        element = {"type": "bullets", "items": items, "marker": marker}
        if index_in(raw.get("highlight"), len(items)) is not None:
            element["highlight"] = raw["highlight"]
        return element
    if kind == "quote":
        value = clean_text(raw.get("value"), 140)
        if not value:
            return None
        return {"type": "quote", "value": value.strip("\"'“”"), "author": clean_text(raw.get("author"), 40)}
    if kind in ("barGraph", "lineGraph", "pieChart"):
        field, longest, lowest, highest, label_size = {
            "barGraph": ("bars", 6, 2, 6, 18),
            "lineGraph": ("points", 8, 3, 8, 10),
            "pieChart": ("sectors", 5, 2, 5, 18),
        }[kind]
        points = []
        for item in raw.get(field) or []:
            if not isinstance(item, dict):
                continue
            value = number_of(item.get("value"))
            if value is None or (kind == "pieChart" and value <= 0):
                continue
            points.append({"label": clean_text(item.get("label"), label_size), "value": value})
        points = points[:highest]
        if len(points) < lowest:
            return None
        element = {"type": kind, field: points}
        if index_in(raw.get("highlight"), len(points)) is not None:
            element["highlight"] = raw["highlight"]
        if kind == "barGraph" and raw.get("valueSuffix"):
            element["valueSuffix"] = clean_text(raw.get("valueSuffix"), 4)
        return element
    if kind == "table":
        columns = [clean_text(item, 18) for item in raw.get("columns") or [] if isinstance(item, (str, int, float))][:4]
        if len(columns) < 2:
            return None
        rows = clean_rows(raw.get("rows"), len(columns))
        if not rows:
            return None
        highlight = []
        for pair in raw.get("highlight") or []:
            if isinstance(pair, list) and len(pair) == 2 and index_in(pair[0], len(rows)) is not None \
                    and index_in(pair[1], len(columns)) is not None:
                highlight.append(pair)
        return {"type": "table", "columns": columns, "rows": rows, "highlight": highlight[:3]}
    if kind == "image":
        request = media_request(raw.get("media"), "photo")
        return {"type": "image", "media": request} if request else None
    if kind == "portrait":
        request = media_request(raw.get("media"), "photo")
        if request is None:
            return None
        return {"type": "portrait", "media": request, "name": clean_text(raw.get("name"), 32),
                "subtitle": clean_text(raw.get("subtitle"), 48)}
    if kind == "gallery":
        requests = [media_request(item, "photo") for item in (raw.get("media") or [])[:4]]
        captions = raw.get("captions") if isinstance(raw.get("captions"), list) else []
        pairs = [(request, clean_text(captions[index] if index < len(captions) else "", 24))
                 for index, request in enumerate(requests) if request]
        if len(pairs) < 2:
            return None
        return {"type": "gallery", "media": [request for request, _ in pairs], "captions": [caption for _, caption in pairs]}
    return None


TEMPLATE_NAMES = ("news", "person", "timeline", "versus", "checklist", "showcase", "headline")
TEMPLATE_MEDIA = {"news": None, "person": "photo", "showcase": "photo", "headline": None}


def clean_template(raw):
    if not isinstance(raw, dict) or raw.get("name") not in TEMPLATE_NAMES:
        return None, None
    name = raw["name"]
    template = {"name": name}
    if name in ("news", "person"):
        template["topic"] = clean_text(raw.get("topic"), 18).upper()
        template["headline"] = clean_text(raw.get("headline"), 80)
        template["description"] = clean_text(raw.get("description"), 170)
        template["source"] = clean_text(raw.get("source"), 32)
        template["date"] = clean_text(raw.get("date"), 24)
        if not template["headline"]:
            return None, None
    elif name == "timeline":
        template["title"] = clean_text(raw.get("title"), 32)
        template["subtitle"] = clean_text(raw.get("subtitle"), 48)
        stops = []
        for item in (raw.get("milestones") or [])[:5]:
            if isinstance(item, dict) and clean_text(item.get("title"), 28):
                stops.append({"date": clean_text(item.get("date"), 12), "title": clean_text(item.get("title"), 28),
                              "description": clean_text(item.get("description"), 60)})
        if len(stops) < 2:
            return None, None
        template["milestones"] = stops
        template["active"] = index_in(raw.get("active"), len(stops)) if index_in(raw.get("active"), len(stops)) is not None else len(stops) - 1
    elif name == "versus":
        template["title"] = clean_text(raw.get("title"), 40)
        template["left"] = clean_text(raw.get("left"), 20)
        template["right"] = clean_text(raw.get("right"), 20)
        rows = []
        for item in (raw.get("rows") or [])[:5]:
            if isinstance(item, dict) and clean_text(item.get("label"), 16):
                winner = item.get("winner") if item.get("winner") in ("left", "right") else "none"
                rows.append({"label": clean_text(item.get("label"), 16), "left": clean_text(item.get("leftValue", item.get("left")), 18),
                             "right": clean_text(item.get("rightValue", item.get("right")), 18), "winner": winner})
        if not template["left"] or not template["right"] or len(rows) < 2:
            return None, None
        template["rows"] = rows
    elif name == "checklist":
        template["title"] = clean_text(raw.get("title"), 32)
        items = [clean_text(item, 48) for item in raw.get("items") or [] if isinstance(item, str) and item.strip()][:5]
        if len(items) < 2:
            return None, None
        template["items"] = items
        template["marker"] = "check" if raw.get("marker") == "check" else "number"
    elif name == "showcase":
        template["text"] = clean_text(raw.get("text"), 40)
    elif name == "headline":
        template["text"] = clean_text(raw.get("text"), 60)
        template["emphasis"] = clean_text(raw.get("emphasis"), 24)
        if len(template["text"].split()) < 2:
            return None, None
    request = None
    if name in TEMPLATE_MEDIA:
        request = media_request(raw.get("media"), TEMPLATE_MEDIA[name])
        if request is None and name in ("person", "showcase"):
            return None, None
    return template, request


def clean_scene(raw):
    if not isinstance(raw, dict):
        return None
    elements = [clean_element(item) for item in raw.get("elements") or []]
    elements = [element for element in elements if element][:MOST_ELEMENTS]
    if not any(element["type"] not in ("divider", "kicker") for element in elements):
        return None
    while elements and elements[-1]["type"] == "divider":
        elements.pop()
    layout = raw.get("layout") if raw.get("layout") in ("stack", "split", "grid", "hero", "cinema") else "auto"
    return {"layout": layout, "elements": elements}


def media_count(insert):
    count = 1 if insert.get("request") else 0
    for element in (insert.get("scene") or {}).get("elements", []):
        if element["type"] in ("image", "portrait"):
            count += 1
        if element["type"] == "gallery":
            count += len(element["media"])
    return count


def place_visuals(raw, words, duration):
    count = len(words)
    candidates = []
    for item in raw.get("visuals") or []:
        if not isinstance(item, dict) or item.get("type") not in LENGTHS:
            continue
        kind = item["type"]
        first = word_at(item.get("from"), count)
        last = word_at(item.get("to"), count)
        if first is None:
            continue
        if last is None or last < first:
            last = first
        insert = {"type": kind, "start": max(0.0, words[first]["start"] - LEAD), "end": min(duration, words[last]["end"] + TAIL)}
        if kind == "graphic":
            insert["scene"] = clean_scene(item.get("scene"))
            if insert["scene"] is None:
                continue
        elif kind == "template":
            insert["template"], request = clean_template(item.get("template"))
            if insert["template"] is None:
                continue
            if request:
                insert["request"] = request
        elif kind == "split" and isinstance(item.get("scene"), dict) and not item.get("media"):
            insert["scene"] = clean_scene(item.get("scene"))
            if insert["scene"] is None:
                continue
        else:
            insert["request"] = media_request(item.get("media"), "photo" if kind == "card" else None)
            if insert["request"] is None:
                continue
        insert["enter"] = item.get("enter") if item.get("enter") in ENTERS else "cut"
        insert["motion"] = item.get("motion") if item.get("motion") in MOTIONS else None
        insert["label"] = clean_text(item.get("label"), 40)
        candidates.append(insert)
    candidates.sort(key=lambda insert: insert["start"])

    most_visuals = max(2, math.ceil(VISUALS_PER_MINUTE * duration / 60))
    most_graphics = max(1, math.ceil(GRAPHICS_PER_MINUTE * duration / 60))
    most_templates = max(1, math.ceil(TEMPLATES_PER_MINUTE * duration / 60))
    placed = []
    covered = 0.0
    graphics = 0
    templates = 0
    media = 0
    flashes = 0
    for insert in candidates:
        kind = insert["type"]
        shortest, longest = LENGTHS[kind]
        start, end = insert["start"], insert["end"]
        if end - start < shortest:
            end = start + shortest
        end = min(end, start + longest)
        if kind in FULL_SCREEN:
            start = max(start, OPEN_SECONDS)
            end = min(end, duration - CLOSE_SECONDS)
        else:
            start = max(start, EDGE_SECONDS)
            end = min(end, duration - EDGE_SECONDS)
        if placed:
            start = max(start, placed[-1]["end"] + GAP_BETWEEN)
        if end - start < shortest - 0.2:
            continue
        if len(placed) >= most_visuals or (kind == "graphic" and graphics >= most_graphics):
            continue
        if kind == "template" and templates >= most_templates:
            continue
        if kind in FULL_SCREEN and covered + (end - start) > MOST_COVERED * duration:
            continue
        needed = media_count(insert)
        if media + needed > MOST_MEDIA:
            continue
        if insert["enter"] == "flash":
            if flashes >= MOST_FLASHES:
                insert["enter"] = "cut"
            flashes += 1
        insert["start"] = round(start, 3)
        insert["end"] = round(end, 3)
        insert["exit"] = "fade" if insert["enter"] == "fade" else "cut"
        placed.append(insert)
        media += needed
        if kind in FULL_SCREEN:
            covered += end - start
        if kind == "graphic":
            graphics += 1
        if kind == "template":
            templates += 1
    for number, insert in enumerate(placed, start=1):
        insert["id"] = f"v{number}"
        if insert.get("request") and insert["motion"] is None:
            insert["motion"] = MOTIONS[number % 2]
    return placed


def place_zooms(raw, words, inserts):
    count = len(words)
    covered = [(insert["start"], insert["end"]) for insert in inserts]
    zooms = []
    for item in raw.get("zooms") or []:
        if not isinstance(item, dict):
            continue
        index = word_at(item.get("word"), count)
        if index is None:
            continue
        style = "push" if item.get("style") == "push" else "punch"
        until = word_at(item.get("until"), count)
        if until is None or until < index:
            until = min(count - 1, index + (4 if style == "push" else 1))
        at = words[index]["start"]
        end = min(words[until]["end"] + 0.1, at + ZOOM_LONGEST[style])
        if end - at < 0.3:
            end = at + 0.3
        zooms.append({"at": round(at, 3), "end": round(end, 3), "style": style})
    zooms.sort(key=lambda zoom: zoom["at"])
    most = max(1, math.ceil(ZOOMS_PER_MINUTE * (words[-1]["end"] if words else 60) / 60))
    placed = []
    for zoom in zooms:
        if len(placed) >= most:
            break
        if placed and zoom["at"] < placed[-1]["end"] + ZOOM_GAP:
            continue
        if any(zoom["at"] < end and zoom["end"] > start for start, end in covered):
            continue
        placed.append(zoom)
    for number, zoom in enumerate(placed, start=1):
        zoom["id"] = f"z{number}"
    return placed


def normalize(raw, words, duration):
    keep = [[0.0, round(duration, 3)]]
    inserts = place_visuals(raw, words, duration)
    zooms = place_zooms(raw, words, inserts)
    accent = ACCENTS.get(str(raw.get("accent") or "").lower(), ACCENTS["yellow"])
    return {
        "read": clean_read(raw.get("read")),
        "accent": accent,
        "keep": keep,
        "cuts": [],
        "removed": 0.0,
        "inserts": inserts,
        "zooms": zooms,
    }


def fallback_raw(words):
    cuts = []
    for index, word in enumerate(words):
        text = bare(word["text"])
        if text in FILLERS:
            cuts.append({"from": f"w{index}", "to": f"w{index}", "why": "filler"})
        elif index + 1 < len(words) and text in REPEATABLE and text == bare(words[index + 1]["text"]):
            cuts.append({"from": f"w{index}", "to": f"w{index}", "why": "repeated word"})
    zooms = []
    last = -10.0
    for index, word in enumerate(words[1:], start=1):
        previous = words[index - 1]
        fresh_line = word["start"] - previous["end"] >= 0.3 or previous["text"].endswith((".", "!", "?"))
        if word["start"] - last < 5.0 or word["start"] < 1.5 or not fresh_line or len(bare(word["text"])) < 5:
            continue
        zooms.append({"word": f"w{index}", "style": "punch", "until": f"w{min(len(words) - 1, index + 1)}"})
        last = word["start"]
    return {"read": "", "accent": "yellow", "cuts": cuts, "holds": [], "zooms": zooms, "visuals": []}


def kept_pieces(plan):
    whole = [[0.0, plan["sourceDuration"]]]
    ranges = plan.get("keep") if plan.get("trims") and plan.get("keep") else whole
    clean = sorted([max(0.0, start), min(plan["sourceDuration"], end)] for start, end in ranges if end > start)
    pieces = []
    last_end = -1
    for start, end in clean or whole:
        source_from = max(frame_of(start), last_end)
        source_to = frame_of(end)
        if source_to - source_from <= 0:
            continue
        pieces.append((source_from, source_to - source_from))
        last_end = source_to
    return pieces


def edit_frames(plan):
    return max(1, sum(frames for _, frames in kept_pieces(plan)))
