## get-client-ip

Edge Function Supabase qui retourne l'IP vue côté edge.

### Déploiement

```bash
supabase functions deploy get-client-ip
```

### Test local

```bash
supabase functions serve get-client-ip --no-verify-jwt
```

### Réponse

```json
{ "ip_address": "203.0.113.10" }
```

En production, prévoir une politique de rétention/anonymisation RGPD.

