from clip_finder.find_best_clips import parse_json
from clip_finder.ask_llm_with_fallback import ask_llm

SYSTEM_PROMPT = """You pick the key words of short-video captions.
You get the spoken words, each with an id. Pick the words a viewer should notice: the important nouns, numbers,
names, strong verbs and emotional words. About one word in seven. Never pick small words like "the", "is", "and".
Answer only with JSON: {"emphasis": ["id", "id", ...]}"""


def pick_emphasis(words):
    lines = [f"{word['id']}: {word['text']}" for word in words if isinstance(word, dict) and word.get("id")]
    reply = ask_llm(SYSTEM_PROMPT, "\n".join(lines), check=parse_json)
    known = {word["id"] for word in words if isinstance(word, dict)}
    picked = [word_id for word_id in parse_json(reply["answer"]).get("emphasis", []) if word_id in known]
    return {"model": reply["model"], "edits": {}, "emphasis": picked, "chunks": []}


def words_from_request(body):
    words = body.get("words")
    if not isinstance(words, list):
        raise ValueError("words are missing")
    return [{"id": str(word.get("id")), "text": str(word.get("text", ""))} for word in words if isinstance(word, dict)]


def emphasis_for_request(body):
    return pick_emphasis(words_from_request(body))

