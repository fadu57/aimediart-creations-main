# Workflow Git — déploiement (checklist)

Repo : `aimediart-creations-main`  
Remote : `origin` → `https://github.com/fadu57/aimediart-creations-main.git`  
Branche habituelle : `main`

> Remplacer `<branche>` par le nom réel (souvent `main`).  
> PowerShell : exécuter les commandes à la racine du projet.

---

## 0. Prérequis

- [ ] Terminal ouvert dans le dossier du projet  
- [ ] Pas de secret dans le commit (ne **jamais** committer `.env`)  
- [ ] Tests / build OK si vous déployez du code applicatif (`npm run test`, `npm run build`)

---

## 1. Vérifier la branche et le remote

```powershell
cd "c:\Users\Fab\Downloads\aimediart-creations-main\aimediart-creations-main"

git branch --show-current
git remote -v
git status -sb
```

- [ ] La branche affichée est bien celle voulue (`<branche>`)  
- [ ] `origin` pointe vers le bon dépôt GitHub  
- [ ] Noter si vous êtes `ahead` / `behind` / divergé par rapport à `origin/<branche>`

---

## 2. État du working tree (fichiers modifiés)

```powershell
git status
git diff --stat
git diff --stat --cached
```

- [ ] Lire la liste des fichiers **modifiés** / **non suivis**  
- [ ] Vérifier qu’il n’y a pas `.env`, clés API, `node_modules/`, `dist/`, fichiers temporaires  
- [ ] Décider ce qui entre dans le commit (tout ou sélection ciblée)

**Staging ciblé (exemple) :**

```powershell
git add chemin/fichier1 chemin/fichier2
git reset HEAD .env
git status
```

---

## 3. Commit (si nécessaire)

À faire seulement s’il reste des changements à versionner.

```powershell
git status
# .env ne doit PAS figurer dans "Changes to be committed"

git commit -m "$(@'
type(scope): message court en français ou anglais

Phrase optionnelle expliquant le pourquoi.
'@)"
```

- [ ] Message de commit clair (fix / feat / chore…)  
- [ ] `git log -1 --oneline` pour confirmer le dernier commit  
- [ ] Si **rien à committer** : passer à l’étape 4

---

## 4. Mettre à jour depuis le remote (rebase)

```powershell
git fetch origin
git pull --rebase origin <branche>
```

- [ ] `fetch` terminé sans erreur  
- [ ] `pull --rebase` terminé **ou** conflits signalés (étape 5)

**Si la branche locale n’existe pas encore sur le remote :**

```powershell
git push -u origin <branche>
```

---

## 5. Résoudre les conflits (avec aide si besoin)

Uniquement si Git affiche `CONFLICT` pendant le rebase.

```powershell
git status
```

- [ ] Ouvrir chaque fichier listé en **both modified**  
- [ ] Choisir le bon code (garder les deux parties, fusion manuelle, ou annuler un changement)  
- [ ] Supprimer les marqueurs `<<<<<<<`, `=======`, `>>>>>>>`

**Marquer comme résolu et poursuivre le rebase :**

```powershell
git add chemin/fichier-resolu
git rebase --continue
```

- [ ] Répéter jusqu’à « rebase successful »  
- [ ] En cas d’impasse : `git rebase --abort` (revient à l’état avant le rebase) puis demander de l’aide

---

## 6. Pousser vers GitHub

```powershell
git push origin <branche>
```

- [ ] Push accepté (`main -> main` ou équivalent)  
- [ ] Si rejet **push protection** (secret dans l’historique) : ne pas utiliser « allow secret » — retirer le secret du commit (`git reset`, amend ou nouveau commit propre) puis repousser  
- [ ] Si rejet **non-fast-forward** : rebases manquants → refaire étape 4

---

## 7. Déploiement Vercel (après push sur `main`)

Le site se redéploie en général **automatiquement** si le projet Vercel est lié au repo.

- [ ] Vercel → **Deployments** → dernier build **Ready**  
- [ ] Variables d’environnement à jour (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `PDF_EXPORT_ORIGIN`, etc.)  
- [ ] **Redeploy** si vous avez seulement changé des variables sans nouveau commit  
- [ ] Test rapide en prod (ex. statistiques → **Enregistrer le PDF**)

---

## 8. Récap une ligne (copier-coller)

```powershell
cd "c:\Users\Fab\Downloads\aimediart-creations-main\aimediart-creations-main"
$branche = "main"
git branch --show-current; git remote -v; git status -sb
git status; git diff --stat
# git add ... && git commit -m "..."   # si besoin
git fetch origin
git pull --rebase origin $branche
# résoudre conflits → git add … && git rebase --continue
git push origin $branche
```

---

## Rappels sécurité

| À ne pas committer | Pourquoi |
|--------------------|----------|
| `.env` | Clés Groq, service_role, etc. |
| `supabase/.temp/` | Fichiers CLI temporaires |
| `tsconfig.*.tsbuildinfo` | Cache build local |

`.env` est dans `.gitignore` — toujours `git reset HEAD .env` avant commit si Git le propose.

---

## État actuel (indicatif — à revérifier avant chaque deploy)

Dernière vérification locale : branche `main`, remote `origin`, parfois **ahead** d’un ou plusieurs commits avant push.
