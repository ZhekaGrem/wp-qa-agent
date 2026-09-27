# Defect catalog

| ID | What it means | Typical WordPress cause | Confirm by | Common false positive |
|---|---|---|---|---|
| VIS-OVERFLOW-X | An element sticks out past the screen width; the page scrolls sideways or content is cut | Fixed-width tables/iframes/embeds, long unbroken URLs, page-builder columns with fixed px widths | Screenshot at that width shows a cut or sideways scroll | Element inside a carousel the probe could not recognise |
| VIS-IMG-BROKEN | Image failed to load | Media deleted, wrong URL after migration, hotlink protection, mixed http/https | Blank or broken-icon area in the screenshot | Tracking pixel with empty alt |
| VIS-IMG-DISTORTED | Image stretched or squashed (> 5 %) | Fixed width and height in CSS/builder, `object-fit` missing | Visibly stretched faces, logos, charts | Deliberate artistic stretch (rare) |
| VIS-OVERLAP | A button or link is covered by another element | Absolute-positioned badges, negative margins, z-index bugs | Screenshot shows the control hidden or partly covered | Transparent overlay wrappers that pass clicks through |
| VIS-TEXT-CLIPPED | Text cut off by its container | Fixed button height/width, translated labels longer than the English ones | Screenshot shows cut words | Decorative marquee text |
| TXT-SHORTCODE | `[shortcode]` shown as text | Plugin deactivated, shortcode misspelled, page builder removed | Brackets visible on the page | Legitimate bracketed text like `[to-do]` in an article |
| TXT-PHP-ERROR | PHP warning/notice/fatal or wp_die page visible | `WP_DEBUG_DISPLAY` on production, plugin/PHP version mismatch | Text visible in screenshot | Article that quotes an error message |
| TXT-MOJIBAKE | `Ð¿Ñ€`, `â€™`, `Ã©`, `�` | Database or export in the wrong charset, copy-paste from Word | Garbled characters visible | None known |
| TXT-PLACEHOLDER | Lorem ipsum, "Sample Page", "Hello world!", tagline "Just another WordPress site" | Demo content left after theme import | Text visible | A page about placeholder text |
| TXT-UNRENDERED | `&nbsp;`, `<p>`, `{{name}}`, `%s` visible | Double-escaped content, broken translation strings, email/SMS templates on pages | Text visible | Code samples in a blog post |
| TXT-DUP-WORD | Same word twice in a row | Editing slip | Read the sentence | Intentional repetition ("так, так") |
| TXT-MIXED-SCRIPT | One word mixes Cyrillic and Latin letters (`Kиїв`) | Keyboard layout slip, copy-paste | Zoomed text or the quote | Brand names written that way on purpose |
| TXT-LANG-LEAK | ы/э/ъ/ё on a Ukrainian page (or і/ї/є/ґ on a Russian one) | Russian copy or machine translation left in place | Read the sentence | Quoted names or citations |
| TXT-EMPTY-CONTROL | Link or button with no text or label | Icon fonts without `aria-label`, empty builder buttons | Screenshot shows an icon-only control | Decorative links hidden from assistive tech but not marked as such |
| NET-HTTP-ERROR | Page or resource answered 4xx/5xx | Deleted pages still in menus, missing CSS/JS after plugin removal, server errors | Status in the record | Third-party resources blocked by ad-blocking in the browser |
| NET-CONSOLE-ERROR | JavaScript errors in the console | Plugin conflicts, jQuery version issues | Messages in the record | Third-party analytics noise |
| NET-BROKEN-LINK | Internal link leads to 4xx/5xx | Renamed slugs, deleted pages, typos in menus | Status in the record | Links that need login |

Agent judgment IDs: `AGT-TYPO`, `AGT-GRAMMAR`, `AGT-UNTRANSLATED`, `AGT-LAYOUT`. Compare: `CMP-REGRESSION`.
