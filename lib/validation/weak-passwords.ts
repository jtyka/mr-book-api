// Blocklist der häufigsten / meist-geleakten Passwörter (NIST 800-63B §5.1.1.2:
// "compare against a list of commonly-used, expected, or compromised values").
// Bewusst kein vollständiges Breach-Corpus — eine kuratierte Liste der Klassiker
// deckt den Großteil der trivialen Passwörter ab. Für einen echten Online-Abgleich
// ließe sich später die HaveIBeenPwned-Range-API ergänzen.
//
// Alle Einträge kleingeschrieben; der Abgleich erfolgt case-insensitiv.
export const WEAK_PASSWORDS: ReadonlySet<string> = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "123456789",
  "12345678910",
  "111111111",
  "000000000",
  "password",
  "password1",
  "password123",
  "passwort",
  "passwort1",
  "passwort123",
  "qwertyuiop",
  "qwertzuiop",
  "asdfghjkl",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "1qaz2wsx",
  "zaq12wsx",
  "qazwsxedc",
  "iloveyou",
  "iloveyou1",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "batman123",
  "trustno1",
  "welcome1",
  "welcome123",
  "letmein1",
  "letmein123",
  "admin123",
  "administrator",
  "root1234",
  "changeme",
  "changeme123",
  "monkey123",
  "dragon123",
  "master123",
  "abcd1234",
  "abcdefgh",
  "a1b2c3d4",
  "test1234",
  "testtest",
  "hallo123",
  "hallowelt",
  "geheim123",
  "passwort1234",
  "startseite",
  "willkommen",
  "sommer2024",
  "sommer2025",
  "winter2024",
  "winter2025",
  "fussball",
  "schalke04",
  "borussia",
  "deutschland",
  "berlin123",
  "muenchen123",
]);

// Prüft, ob ein Passwort als schwach gilt (in der Blocklist oder rein numerisch/
// eine einzelne wiederholte Ziffer). Rückgabe: true = schwach.
export function isWeakPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  if (WEAK_PASSWORDS.has(normalized)) return true;
  // Reine Zahlenfolgen und identisch wiederholte Zeichen (z. B. "aaaaaaaaaaaa").
  if (/^\d+$/.test(normalized)) return true;
  if (/^(.)\1+$/.test(normalized)) return true;
  return false;
}
