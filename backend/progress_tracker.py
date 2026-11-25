import time


def new_progress(steps):
    return {
        "started_at": time.time(),
        "steps": [{"key": key, "label": label, "state": "waiting", "seconds": None} for key, label in steps],
        "log": [],
    }


def find_step(progress, key):
    for step in progress["steps"]:
        if step["key"] == key:
            return step
    raise Exception("Unknown step " + key)


def add_log(progress, text):
    print(text)
    progress["log"].append({"when": time.time(), "text": text})


def start_step(progress, key):
    step = find_step(progress, key)
    step["state"] = "running"
    step["began"] = time.time()


def finish_step(progress, key):
    step = find_step(progress, key)
    step["state"] = "done"
    step["seconds"] = round(time.time() - step.get("began", time.time()), 1)


def fail_running_steps(progress):
    for step in progress["steps"]:
        if step["state"] == "running":
            step["state"] = "failed"


def steps_for_browser(progress):
    result = []
    for step in progress["steps"]:
        seconds = step["seconds"]
        if step["state"] == "running":
            seconds = round(time.time() - step["began"], 1)
        result.append({"key": step["key"], "label": step["label"], "state": step["state"], "seconds": seconds})
    return result


def log_for_browser(lines, start_time):
    return [{"at": round(line["when"] - start_time, 1), "text": line["text"]} for line in lines]
