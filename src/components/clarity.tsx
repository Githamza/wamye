import Script from "next/script";

// Microsoft Clarity analytics. Loaded with the default `afterInteractive`
// strategy (recommended for tag managers / analytics), so it runs after
// first-party hydration rather than blocking it. Rendered from both root
// layouts to cover the whole site (customer surface + driver/admin).
const CLARITY_PROJECT_ID = "xoigx033ml";

export function Clarity() {
  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
    </Script>
  );
}
