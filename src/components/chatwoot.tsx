import Script from "next/script";

// Chatwoot live-chat widget. Loaded with `lazyOnload` (browser idle time)
// rather than `afterInteractive`: unlike analytics, the launcher bubble is
// pure UI and nothing depends on it being there early. Rendered from both
// root layouts to cover the whole site (customer surface + driver/admin).
const CHATWOOT_BASE_URL = "https://app.chatwoot.com";
const CHATWOOT_WEBSITE_TOKEN = "B1a1m7YBoRpuaRbY9tTyWfWj";

export function Chatwoot() {
  return (
    <Script id="chatwoot" strategy="lazyOnload">
      {`window.chatwootSettings = {"position":"right","type":"standard","launcherTitle":""};
      (function(d,t) {
        var BASE_URL="${CHATWOOT_BASE_URL}";
        var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
        g.src=BASE_URL+"/packs/js/sdk.js";
        g.async = true;
        s.parentNode.insertBefore(g,s);
        g.onload=function(){
          window.chatwootSDK.run({
            websiteToken: '${CHATWOOT_WEBSITE_TOKEN}',
            baseUrl: BASE_URL
          })
        }
      })(document,"script");`}
    </Script>
  );
}
