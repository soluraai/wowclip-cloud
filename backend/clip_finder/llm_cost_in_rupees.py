import requests

RATE_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR"
BACKUP_RATE = 92.0


def get_dollar_rate():
    try:
        response = requests.get(RATE_URL, timeout=15)
        return response.json()["rates"]["INR"]
    except Exception:
        return BACKUP_RATE


def cost_in_rupees(cost_usd):
    return cost_usd * get_dollar_rate()
