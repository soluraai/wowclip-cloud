import time

import requests

from settings import LLM_MODELS, OPENROUTER_API_KEY

API_URL = "https://openrouter.ai/api/v1/chat/completions"
ROUNDS = 2
WAIT_BETWEEN_ROUNDS = 3
TIMEOUT_SECONDS = 120


def error_reason(response):
    if response.status_code == 429:
        return "rate-limited (429)"
    try:
        message = response.json()["error"]["message"]
    except Exception:
        message = response.text[:120]
    return f"error {response.status_code}: {message}"


def call_model(llm, system_prompt, user_message):
    body = {
        "model": llm["model"],
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
        "max_tokens": 32000,
        "reasoning": llm["reasoning"],
        "provider": {"order": llm["providers"], "allow_fallbacks": False},
        "usage": {"include": True},
    }
    headers = {"Authorization": "Bearer " + OPENROUTER_API_KEY}
    response = requests.post(API_URL, json=body, headers=headers, timeout=TIMEOUT_SECONDS)
    if response.status_code != 200:
        raise Exception(error_reason(response))

    data = response.json()
    if "error" in data:
        raise Exception(data["error"].get("message", "unknown error"))
    answer = data["choices"][0]["message"]["content"]
    if not answer:
        raise Exception("empty answer")

    usage = data.get("usage", {})
    return {
        "answer": answer,
        "model": llm["name"],
        "provider": data.get("provider", llm["providers"][0]),
        "input_tokens": usage.get("prompt_tokens", 0),
        "output_tokens": usage.get("completion_tokens", 0),
        "cost_usd": usage.get("cost", 0),
    }


def check_answer(answer, check):
    if check is None:
        return
    try:
        check(answer)
    except Exception as error:
        raise Exception(f"unusable answer ({error})")


def ask_llm(system_prompt, user_message, check=None, log=print):
    failures = []
    for round_number in range(ROUNDS):
        if round_number > 0:
            log(f"Every model failed, trying them all again in {WAIT_BETWEEN_ROUNDS}s")
            time.sleep(WAIT_BETWEEN_ROUNDS)
        for number, llm in enumerate(LLM_MODELS):
            if number > 0 or round_number > 0:
                log(f"Switching to {llm['name']} on {llm['providers'][0]}")
            try:
                reply = call_model(llm, system_prompt, user_message)
                check_answer(reply["answer"], check)
                return reply
            except requests.Timeout:
                reason = f"no answer in {TIMEOUT_SECONDS}s"
            except Exception as error:
                reason = str(error)
            failures.append(f"{llm['name']}: {reason}")
            log(f"{llm['name']} could not answer: {reason}")

    raise Exception("Every AI model failed. " + " | ".join(failures[-len(LLM_MODELS):]))
