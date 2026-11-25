// wowclip version of this file. Capiyo's original signed the user in with Firebase and sent their sign-in token
// with every request. wowclip has no accounts (the backend is your own), so requests are sent without a token.

export async function authHeaders(): Promise<Record<string, string>> {
  return {};
}
