# Wamye Livreur — Android : build, signature, publication

Le shell Android (Capacitor) rend le site déployé : `capacitor.config.ts`
pointe la WebView sur `https://wamye.mylabs.live/dashboard`. **Un déploiement
web met à jour l'app installée sans nouvel APK.** On ne reconstruit l'APK que
quand le côté natif change : plugin ajouté, permission, versionCode, config
Capacitor.

## Prérequis (une fois par machine)

```bash
brew install openjdk@21                        # JDK, keg-only (pas de sudo)
brew install --cask android-commandlinetools   # SDK sous /usr/local/share/android-commandlinetools
export JAVA_HOME=/usr/local/opt/openjdk@21
export ANDROID_HOME=/usr/local/share/android-commandlinetools
```

Les licences SDK et les composants (platform android-36, build-tools 36)
s'installent via `sdkmanager` si absents ; Gradle les réclame explicitement
sinon.

## Construire

```bash
npm ci
npx cap sync android          # après tout changement de plugin ou de config
cd android
./gradlew assembleDebug       # → android/app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease     # → android/app/build/outputs/apk/release/app-release.apk
```

Sans `android/keystore.properties`, `assembleRelease` produit un APK **non
signé** — le build reste vérifiable depuis un clone propre.

## Signature

Deux fichiers, **jamais dans git** (le .gitignore racine les couvre) :

- `android/wamye-release.keystore` — la clé (alias `wamye`, RSA 2048).
- `android/keystore.properties` :

  ```properties
  storeFile=../wamye-release.keystore
  storePassword=<le mot de passe>
  keyAlias=wamye
  keyPassword=<le même>
  ```

**Sauvegarder le keystore et son mot de passe hors de cette machine.** Perdre
la clé = signature différente = Android refuse la mise à jour ; chaque
livreur devrait désinstaller/réinstaller.

Vérifier une signature :

```bash
JAVA_HOME=/usr/local/opt/openjdk@21 \
  $ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

## Publier une version (checklist)

1. **Bump du versionCode, aux DEUX endroits** (ils doivent rester égaux) :
   - `android/app/build.gradle` → `versionCode N`
   - `capacitor.config.ts` → `appendUserAgent: "WamyeLivreur/N"`
     (c'est ce que lit la bannière de mise à jour, voir plus bas)
2. `npx cap sync android && cd android && ./gradlew assembleRelease`
3. Publier : `bash scripts/publish-apk.sh android/app/build/outputs/apk/release/app-release.apk`
   — crée le bucket public `apk` au besoin et écrase
   `wamye-livreur.apk` ; la page `/telecharger` sert alors la nouvelle
   version, sans déploiement. (Le script lit `.env.local` ; à lancer soi-même,
   pas par l'agent — la clé service_role est volontairement hors de sa portée.)
4. Installer depuis `https://wamye.mylabs.live/telecharger` sur un vrai
   téléphone et dérouler la matrice : connexion persistante, notification de
   course, suivi écran éteint, arrêt du service à la livraison.
5. **Forcer la mise à jour** (optionnel) : monter `ANDROID_MIN_VERSION=N` sur
   Coolify (variable runtime) puis **redémarrer** le conteneur — une variable
   posée après le lancement d'un build n'atteint pas le conteneur sans
   restart. Les shells plus vieux que N voient alors la bannière « nouvelle
   version » sur le dashboard.

## Déboguer le natif

```bash
$ANDROID_HOME/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
$ANDROID_HOME/platform-tools/adb logcat -s Capacitor BackgroundGeolocation
```

## Comportement batterie / OEM

Le suivi écran éteint repose sur le service de premier plan du plugin
`@capgo/background-geolocation` (levé quand une course est active). Les
surcouches agressives (Xiaomi/MIUI, Oppo, etc.) peuvent le tuer malgré tout :
si un livreur signale des trous de position, désactiver l'optimisation de
batterie pour Wamye Livreur dans les réglages du téléphone. Compléter cette
section avec les observations réelles (matrice ligne 6).
