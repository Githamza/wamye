# Correctifs appliqués à l'instance Fleetbase

L'instance est auto-hébergée (service Coolify `fleetbase`, uuid
`suipficfbfirfrwu4uuw10p2`, sur 91.134.240.158). Ce fichier liste ce qui y a été
modifié **hors du dépôt** — donc invisible pour quiconque lit seulement ce code.

> ⚠️ Ces correctifs vivent dans la couche du conteneur, pas dans l'image. Un
> redéploiement du service ou un `docker compose pull` les efface **en
> silence** : le symptôme réapparaît sans aucune erreur. À re-vérifier après
> chaque intervention sur la pile Fleetbase.

## 1. Invitations d'organisation désactivées (2026-08-03)

**Symptôme sans le patch.** Chaque validation de compte envoyait au livreur un
email Fleetbase en anglais, « You've been invited to join <company> », l'invitant
sur une console qu'il n'utilisera jamais — il travaille dans Navigator.

**Pourquoi ce n'était pas contournable depuis notre code.** Créer un livreur
(`POST /v1/drivers`) appelle `User::assignCompany()`, qui envoie l'invitation
sans condition sauf si l'utilisateur est admin de l'instance, propriétaire de la
company, ou sans email — aucun de ces cas n'est atteignable pour un livreur.
Créer le livreur sous une adresse jetable puis poser la vraie ne marche pas non
plus : `UserInvited implements ShouldQueue`, donc le worker résout le
destinataire à la livraison, en relisant l'utilisateur en base — il poste à
l'adresse *courante*, pas à celle du moment de la création.

**Le correctif.** Dans le conteneur `application`, court-circuit en tête de
`sendInviteFromCompany()` :

```php
// /fleetbase/api/vendor/fleetbase/core-api/src/Models/User.php, ligne ~1124
public function sendInviteFromCompany(?Company $company = null): bool
{ if (file_exists("/fleetbase/api/storage/app/noinv")) { return false; }
```

Appliqué par :

```sh
cd /fleetbase/api/vendor/fleetbase/core-api/src/Models
cp -n User.php User.php.orig
sed -i '/function sendInviteFromCompany/{n;s|^    {$|    { if (file_exists("/fleetbase/api/storage/app/noinv")) { return false; }|}' User.php
php -l User.php            # doit afficher "No syntax errors detected"
touch /fleetbase/api/storage/app/noinv
cd /fleetbase/api && php artisan octane:reload   # sinon les workers gardent l'ancienne classe
```

Le `sed` est idempotent (une fois patchée, la ligne ne matche plus) et `cp -n`
ne réécrase pas la sauvegarde.

**L'interrupteur est un fichier**, `storage/app/noinv`, et non une variable
d'environnement : `storage/app` est un volume persistant, donc on active et
désactive par `touch` / `rm` sans redéployer la pile. Une variable d'env aurait
imposé un redéploiement — précisément l'opération qui a déjà mis l'API en
crashloop par le passé.

**Portée.** Le patch coupe **toutes** les invitations d'organisation, y compris
celles envoyées volontairement depuis la console pour ajouter un collègue. Pour
en réactiver une ponctuellement : `rm /fleetbase/api/storage/app/noinv`,
inviter, puis remettre le fichier.

**Retour arrière.** `cp User.php.orig User.php` puis `php artisan octane:reload`.

**Vérifier que le patch tient toujours** — la table `invites` ne doit pas
grandir quand un compte est validé :

```sh
cd /fleetbase/api && php artisan tinker --execute="echo DB::table('invites')->count();"
```

Sans SSH, tout ceci se lance depuis Coolify : service *fleetbase* → conteneur
`application` → Terminal, ou via une tâche planifiée ponctuelle (commandes
limitées à 255 caractères).

### Ne JAMAIS utiliser `octane:reload` sur cette instance

Le 2026-08-03, `php artisan octane:reload` a **arrêté** le serveur FrankenPHP au
lieu de le recharger. PID 1 étant `sh -c './deploy.sh && php artisan
octane:frankenphp …'`, sa mort a relancé le conteneur, qui s'est alors heurté au
bug `ledger_accounts` ci-dessous : ~50 minutes d'API indisponible.

Pour qu'un patch prenne effet, laisser les workers se recycler d'eux-mêmes
(`--max-requests=1000`), ou redémarrer le service depuis Coolify — mais
seulement après avoir vérifié que `ledger_accounts` est cohérent.

## Le bug `ledger_accounts` : tout démarrage est un pari

`php artisan fleetbase:seed`, exécuté par `deploy.sh` à chaque démarrage, meurt
sur `Duplicate entry 'account_…' for key ledger_accounts_public_id_unique` dès
qu'une ligne porte un `public_id` qui ne correspond pas à sa propre dérivation
(`account_` + 10 premiers hex de `sha256(company_uuid:code)`). `deploy.sh` étant
en `set -e` et enchaîné par `&&`, Octane ne démarre jamais : l'API répond 503,
et la console affiche une fausse erreur CORS.

**Chaque création d'organisation replante le problème** — par l'API comme par la
console (vérifié : une organisation créée à la main le 2026-08-02 était dans le
même état qu'une créée par l'API le 2026-08-03). Il ne se manifeste qu'au
démarrage suivant, donc longtemps après sa cause.

Réparation (MySQL, en deux passes — une mise à jour directe heurterait l'index
unique en cours de route) :

```sql
CREATE TABLE IF NOT EXISTS ledger_accounts_bk_AAAAMMJJ AS SELECT * FROM ledger_accounts;
UPDATE ledger_accounts SET public_id = CONCAT('tmpfix_', uuid);
UPDATE ledger_accounts SET public_id = CONCAT('account_', SUBSTRING(SHA2(CONCAT(company_uuid, ':', code), 256), 1, 10));
```

Vérification (doit donner `0`) :

```sql
SELECT SUM(public_id <> CONCAT('account_', SUBSTRING(SHA2(CONCAT(company_uuid, ':', code), 256), 1, 10))) FROM ledger_accounts;
```

Le conteneur `database` accepte `mysql -uroot fleetbase -e "…"` sans mot de
passe. Sauvegardes existantes : `ledger_accounts_backup_20260801`,
`ledger_accounts_bk20260803`.

**Piste pour ne plus jamais tomber dessus** : une tâche planifiée Coolify
quotidienne qui rejoue ces deux `UPDATE`. Idempotent, une seconde, aucun
redéploiement. Non mis en place à ce jour.

## Rendre le correctif durable (non fait)

Pour qu'il survive aux redéploiements, il faudrait déplacer le `sed` dans la
`command:` du service `application` du compose Coolify, avant `./deploy.sh` — il
se ré-appliquerait alors à chaque démarrage. Non fait à ce jour : cela impose un
redéploiement de toute la pile Fleetbase, et `deploy.sh` a déjà provoqué une
coupure en crashloop (incident du mismatch `ledger_accounts.public_id`).
