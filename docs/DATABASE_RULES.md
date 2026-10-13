# Realtime Database rules for the Season ladder

The new Season screen publishes each player's weekly score to `seasons/{seasonId}/{uid}` and reads the
top 25 from it. **Until these rules are added the game still works** — the ladder just shows only your own
score (the client detects the denied write and stops retrying).

Merge this into your existing `database.rules.json` (I couldn't see your current rules in the zip):

```json
"seasons": {
  "$seasonId": {
    ".indexOn": ["sp"],
    ".read": "auth != null",
    "$uid": {
      ".write": "auth != null && auth.uid === $uid",
      ".validate": "newData.hasChildren(['sp','n','u']) && newData.child('sp').isNumber() && newData.child('sp').val() >= 0 && newData.child('sp').val() <= 20000 && (!data.exists() || newData.child('sp').val() >= data.child('sp').val()) && newData.child('n').isString() && newData.child('n').val().length <= 24"
    }
  }
}
```

Notes
- SP is computed client-side, like coins already are. The rule stops decreasing/absurd values, not a determined cheater.
  For a hardened ladder, move SP awarding into an `api/` function (you already have `api/` + firebase-admin).
- Old seasons (`seasons/s20xxx`) are never read again; delete them periodically if you care about size.
