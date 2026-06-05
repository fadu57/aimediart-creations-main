## get-client-ip

Edge Function Supabase qui retourne l'IP vue côté edge.

### Déploiement

JWT désactivé (obligatoire pour le preflight CORS depuis le navigateur) :

```bash
npm run deploy:supabase:get-client-ip
```

ou :

```bash
supabase functions deploy get-client-ip --no-verify-jwt
```

Le fichier `supabase/config.toml` contient `[functions.get-client-ip] verify_jwt = false`.

### Test local

```bash
supabase functions serve get-client-ip --no-verify-jwt
```

### Réponse

```json
{ "ip_address": "203.0.113.10" }
```

En production, prévoir une politique de rétention/anonymisation RGPD.

